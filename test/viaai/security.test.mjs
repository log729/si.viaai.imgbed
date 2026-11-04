import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { load, makeEnv, mockPassport, sessionJson, req } from './setup.mjs';
globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };
const { getDatabase } = await load('utils/databaseAdapter.js');
const { onRequest: myFiles } = await load('api/my-files.js');
const { readIndex } = await load('utils/indexManager.js');
const { secureFileHeaders, secureFileResponse } = await load('file/contentSecurity.js');
const { setCommonHeaders, handleHeadRequest } = await load('file/fileTools.js');
const { errorHandling, telemetryEvent } = await load('utils/middleware.js');
const { getOthersConfig } = await load('api/manage/sysConfig/others.js');
const { authenticate, AUTH_SCOPE } = await load('utils/auth/authCore.js');
const { onRequestPost: adminLogin } = await load('api/auth/adminLogin.js');
const { initializeChunkedUpload, handleChunkUpload, handleCleanupRequest } = await load('upload/chunkUpload.js');
const { handleChunkMerge } = await load('upload/chunkMerge.js');
const { onRequestPost: commitUpload } = await load('upload/huggingface/commitUpload.js');
const { onRequestPost: completeMultipart } = await load('upload/huggingface/completeMultipart.js');
const { buildUniqueFileId } = await load('upload/uploadTools.js');
const { readUploadTicket } = await load('utils/auth/fileOwnership.js');
const origin = 'https://imgbed.viaai.si';
const owner = 'u_alice', other = 'u_bob';
const security = { auth: { admin: { adminUsername: 'admin', adminPassword: 'password' }, user: {} } };
function fixture(files = []) {
  const env = makeEnv({ security });
  const metadata = new Map(files.map(f => [f.id, f.metadata]));
  const { kv } = env;
  kv.getWithMetadata = async k => ({ value: kv.m.get(k) ?? null, metadata: metadata.get(k) ?? null });
  const put = kv.put;
  kv.put = async (k, v, opts) => { if (opts?.metadata) metadata.set(k, structuredClone(opts.metadata)); await put(k, v, opts); };
  const del = kv.delete;
  kv.delete = async k => { metadata.delete(k); await del(k); };
  kv.list = async ({ prefix = '' } = {}) => ({ keys: [...kv.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: metadata.get(name) })), list_complete: true });
  kv.m.set('manage@index@meta', JSON.stringify({ chunkCount: 1, totalCount: files.length, lastOperationId: null, lastUpdated: 1 }));
  kv.m.set('manage@index_0', JSON.stringify(files));
  files.forEach(f => kv.m.set(f.id, ''));
  env.dev_mode = 'true';
  return env;
}
const entry = (id, uploaderId, extra = {}) => ({ id, metadata: { uploaderId, FileName: id, FileType: 'image/png', Directory: '', TimeStamp: 1, ...extra } });
const context = (env, request, extra = {}) => ({ env, request, url: new URL(request.url), waitUntil: () => {}, data: {}, ...extra });
async function asAlice(fn) {
  const m = mockPassport(url => { assert.equal(url, 'https://id.viaai.si/api/v1/session'); return sessionJson({ id: owner }); });
  try { return await fn(); } finally { m.restore(); }
}
const personal = (env, method = 'GET', query = '', headers = {}) => myFiles(context(env, req(origin + '/api/my-files' + query, { Cookie: 'viaai_sid=a', ...headers }, { method })));

test('telemetry defaults off and its kill switch overrides persisted opt-in', async () => {
  const env = fixture();
  assert.equal((await getOthersConfig(env.kv, env)).telemetry.enabled, false);
  env.kv.m.set('manage@sysConfig@others', JSON.stringify({ telemetry: { enabled: true } }));
  assert.equal((await getOthersConfig(env.kv, env)).telemetry.enabled, false); // operator DSN required
  env.SENTRY_DSN = 'https://key@sentry.example/42'; env.disable_telemetry = 'true';
  assert.equal((await getOthersConfig(env.kv, env)).telemetry.enabled, false);
});
test('enabled telemetry emits only fixed metadata, never credentials, query, body, IP or exception text', async () => {
  const env = fixture(); env.SENTRY_DSN = 'https://public@sentry.example/42'; env.sampleRate = '1';
  env.kv.m.set('manage@sysConfig@others', JSON.stringify({ telemetry: { enabled: true } }));
  const request = req(origin + '/upload/secret-path?authCode=secret-query', { Cookie: 'secret-cookie', Authorization: 'Bearer secret-auth', 'X-Api-Key': 'secret-key', Referer: 'https://example.org/private', 'CF-Connecting-IP': '203.0.113.42' }, { method: 'POST', body: 'secret-body' });
  const sent = [], tasks = [];
  const mock = mockPassport((url, init) => { sent.push({ url, init }); return new Response(null); });
  try {
    const res = await errorHandling(context(env, request, { next: async () => new Response('ok'), waitUntil: task => tasks.push(task) }));
    assert.equal(res.status, 200); await Promise.all(tasks);
    assert.equal(sent.length, 1); assert.equal(sent[0].url, 'https://sentry.example/api/42/envelope/');
    assert.doesNotMatch(JSON.stringify(sent), /secret-|203\.0\.113|example\.org/);
    assert.equal(await request.text(), 'secret-body'); // request was never read/replaced
    const task2 = [];
    await assert.rejects(errorHandling(context(env, request, { next: async () => { throw new Error('secret-error'); }, waitUntil: t => task2.push(t) })), /secret-error/);
    await Promise.all(task2); assert.doesNotMatch(JSON.stringify(sent), /secret-/);
    assert.deepEqual(telemetryEvent(request, 500, 5).tags, { route: 'upload', method: 'POST', status: '500' });
  } finally { mock.restore(); }
});
test('HTML, SVG, XML, PDF and unknown files are sandboxed downloads, including HEAD and Range', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/pdf', '', 'application/octet-stream']) {
    const headers = new Headers({ 'Set-Cookie': 'injected=1' });
    setCommonHeaders(headers, 'file.svg', type);
    assert.match(headers.get('Content-Disposition'), /^attachment/);
    assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(headers.get('Content-Security-Policy'), /sandbox/);
    assert.equal(headers.get('Set-Cookie'), null);
    const head = handleHeadRequest(headers);
    assert.match(head.headers.get('Content-Disposition'), /^attachment/);
    assert.match(head.headers.get('Content-Security-Policy'), /sandbox/);
    const partial = secureFileResponse(new Response('data', { status: 206, headers }));
    assert.equal(partial.status, 206); assert.match(partial.headers.get('Content-Disposition'), /^attachment/);
    const cached = secureFileResponse(new Response('svg', { headers: { 'Content-Type': type || 'application/octet-stream', 'Content-Disposition': 'inline' } }));
    assert.equal(cached.headers.get('Content-Disposition'), 'attachment');
  }
  assert.match(secureFileHeaders(new Headers({ 'Content-Type': 'image/png', 'Content-Disposition': 'inline' })).get('Content-Disposition'), /^inline/);
});
test('no password means no admin authorization, no bootstrap session, including username-only setup', async () => {
  for (const admin of [{}, { adminUsername: 'admin' }]) {
    const env = makeEnv({ security: { auth: { admin, user: {} } } });
    for (const scope of [AUTH_SCOPE.ADMIN, AUTH_SCOPE.EITHER]) assert.equal((await authenticate({ env, request: req(origin), authScope: scope })).authorized, false);
    const res = await adminLogin(context(env, req(origin + '/api/auth/adminLogin', {}, { method: 'POST', body: '{}' })));
    assert.equal(res.status, 503); assert.equal(res.headers.get('Set-Cookie'), null);
  }
});
test('owner filtering precedes pagination and counts; shared gallery excludes personal files', async () => {
  const env = fixture([entry('other.png', other), entry('mine1.png', owner), entry('old.png', undefined), entry('mine2.png', owner)]);
  const result = await readIndex(context(env, req(origin)), { ownerId: owner, start: 1, count: 1, includeSubdirFiles: true });
  assert.equal(result.totalCount, 2); assert.deepEqual(result.files.map(f => f.id), ['mine2.png']);
  const shared = await readIndex(context(env, req(origin)), { excludeOwned: true, count: -1, includeSubdirFiles: true });
  assert.deepEqual(shared.files.map(f => f.id), ['old.png']);
});
test('personal listing authenticates, ignores requested owner, and strips private metadata', () => asAlice(async () => {
  const env = fixture([entry('other.png', other), entry('mine.png', owner, { UploadIP: 'private-ip', S3Secret: 'secret' }), entry('old.png', undefined)]);
  assert.equal((await myFiles(context(env, req(origin + '/api/my-files')))).status, 401);
  const response = await personal(env, 'GET', '?ownerId=' + other);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.totalCount, 1); assert.deepEqual(body.files.map(f => f.id), ['mine.png']);
  assert.doesNotMatch(JSON.stringify(body), /private-ip|secret|u_bob|uploaderId/);
}));
test('cross-user delete and legacy file delete return 404 without mutations; CSRF is refused', () => asAlice(async () => {
  const env = fixture([entry('other.png', other), entry('mine.png', owner), entry('old.png', undefined)]);
  const writes = env.kv.writes;
  for (const id of ['other.png', 'old.png']) assert.equal((await personal(env, 'DELETE', '?id=' + id, { Origin: origin })).status, 404);
  assert.equal(env.kv.writes, writes); assert.ok(env.kv.m.has('other.png'));
  assert.equal((await personal(env, 'DELETE', '?id=mine.png')).status, 403);
  assert.equal((await personal(env, 'DELETE', '?id=mine.png', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await personal(env, 'DELETE', '?id=manage%40sysConfig%40security', { Origin: origin })).status, 400);
  assert.equal((await personal(env, 'DELETE', '?id=mine.png', { Origin: origin })).status, 200);
  assert.ok(!env.kv.m.has('mine.png')); assert.ok(env.kv.m.has('other.png'));
}));
test('new file IDs use server-assigned owner namespaces even with arbitrary requested folders', async () => {
  const env = fixture(), request = req(origin + '/upload?uploadNameType=origin&uploadFolder=../u_bob');
  const id = await buildUniqueFileId(context(env, request, { uploader: { id: owner } }), 'a.png', 'image/png');
  assert.ok(id.startsWith('users/u_alice/')); assert.ok(!id.includes('..'));
});
test('chunk, merge and cleanup reject another owner without deleting or uploading anything', async () => {
  const env = fixture(), uploadId = 'upload_test';
  const session = { ownerId: other, originalFileName: 'x.png', originalFileType: 'image/png', totalChunks: 1, expiresAt: Date.now() + 60000 };
  env.kv.m.set('upload_session_' + uploadId, JSON.stringify(session));
  const ctx = () => { const form = new FormData(); form.set('file', new Blob(['image']), 'x.png'); form.set('uploadId', uploadId); form.set('chunkIndex', '0'); form.set('totalChunks', '1'); form.set('originalFileName', 'x.png'); form.set('originalFileType', 'image/png'); return context(env, req(origin + '/upload', {}, { method: 'POST', body: form }), { uploader: { id: owner }, waitUntil: () => { assert.fail('must not schedule cleanup'); } }); };
  assert.equal((await handleChunkUpload(ctx())).status, 404);
  assert.equal((await handleChunkMerge(ctx())).status, 404);
  assert.equal((await handleCleanupRequest(ctx(), uploadId, 1000)).status, 404);
  assert.ok(env.kv.m.has('upload_session_' + uploadId)); assert.equal(env.kv.writes, 0);
});
test('HF tickets bind owner and immutable paths before commit/completion or remote calls', () => asAlice(async () => {
  const env = fixture(), fullId = 'users/u_bob/test.bin';
  const ticket = { ownerId: other, fullId, filePath: 'other-storage', fileSize: 5, sha256: 'hash', channelName: 'hf', expiresAt: Date.now() + 60000 };
  env.kv.m.set('manage@viaai@hf@' + fullId, JSON.stringify(ticket));
  assert.equal(await readUploadTicket(env, fullId, { id: owner }), null);
  assert.equal((await readUploadTicket(env, fullId, { id: other })).filePath, 'other-storage');
  const request = req(origin + '/upload/huggingface/commitUpload', { Cookie: 'viaai_sid=a', Origin: origin }, { method: 'POST', body: JSON.stringify(ticket) });
  assert.equal((await commitUpload(context(env, request))).status, 404);
  assert.equal(env.kv.writes, 0);
  const complete = req(origin + '/upload/huggingface/completeMultipart?fullId=' + encodeURIComponent(fullId) + '&target=https://huggingface.co/api/complete_multipart', { Cookie: 'viaai_sid=a', Origin: origin }, { method: 'POST', body: '{}' });
  assert.equal((await completeMultipart(context(env, complete))).status, 404);
}));

test('chunk initialization persists authenticated owner and generates unguessable session IDs', async () => {
  const env = fixture(), form = new FormData();
  form.set('originalFileName', 'test.mp4'); form.set('originalFileType', 'video/mp4'); form.set('totalChunks', '2');
  const ctx = context(env, req(origin + '/upload?uploadChannel=cfr2', {}, { method: 'POST', body: form }), { uploader: { id: owner } });
  const response = await initializeChunkedUpload(ctx);
  assert.equal(response.status, 200);
  const { uploadId } = await response.json(); assert.match(uploadId, /^upload_\d+_[a-f0-9-]{36}$/);
  assert.equal(JSON.parse(await env.kv.get('upload_session_' + uploadId)).ownerId, owner);
});
test('actual generated Worker hardens legacy cached files for GET, HEAD and Range', async () => {
  const { default: worker } = await import('../../deploy/worker/index.js');
  const oldCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => new Response('<script>bad()</script>', { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': 'inline', 'Cache-Control': 'public, max-age=300' } }) } };
  try {
    for (const init of [{}, { method: 'HEAD' }, { headers: { Range: 'bytes=0-5' } }]) {
      const response = await worker.fetch(req(origin + '/file/old.svg', {}, init), {}, { waitUntil: () => {} });
      assert.match(response.headers.get('Content-Disposition'), /^attachment/);
      assert.match(response.headers.get('Content-Security-Policy'), /sandbox/);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      if (init.method === 'HEAD') assert.equal(await response.text(), '');
    }
  } finally { globalThis.caches = oldCaches; }
});
test('real SQLite through D1 adapter preserves isolation and keeps upload tickets out of file table', () => asAlice(async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../../database/init.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...args) { this.args = args.map(v => typeof v === 'boolean' ? Number(v) : v); return this; }
    async first() { return raw.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: raw.prepare(this.sql).all(...this.args) }; }
    async run() { const result = raw.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  const env = { img_d1: { prepare: sql => new Statement(sql), batch: stmts => Promise.all(stmts.map(s => s.run())) }, dev_mode: 'true' };
  const db = getDatabase(env), files = [entry('other.png', other), entry('mine.png', owner)];
  try {
    await db.put('manage@sysConfig@security', JSON.stringify(security));
    await db.put('manage@index@meta', JSON.stringify({ chunkCount: 1, totalCount: 2, lastOperationId: null, lastUpdated: 1 }));
    await db.put('manage@index_0', JSON.stringify(files));
    for (const f of files) await db.put(f.id, '', { metadata: f.metadata });
    await db.put('manage@viaai@hf@mine.bin', JSON.stringify({ ownerId: owner, expiresAt: Date.now() + 60000 }));
    assert.equal(raw.prepare('SELECT count(*) n FROM files').get().n, 2);
    const response = await personal(env); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).files.map(f => f.id), ['mine.png']);
    assert.equal((await personal(env, 'DELETE', '?id=other.png', { Origin: origin })).status, 404);
    assert.equal((await personal(env, 'DELETE', '?id=mine.png', { Origin: origin })).status, 200);
    assert.equal((await db.getWithMetadata('other.png')).metadata.uploaderId, other);
    assert.equal(await db.getWithMetadata('mine.png'), null);
  } finally { raw.close(); }
}));

test('anonymous users can still fetch public owned files; actual Worker protects active file bodies', async () => {
  const { default: worker } = await import('../../deploy/worker/index.js');
  for (const [type, disposition] of [['image/png', 'inline'], ['image/svg+xml', 'attachment'], ['text/html', 'attachment']]) {
    const id = 'users/u_alice/public-file';
    const env = fixture([entry(id, owner, { Channel: 'CloudflareR2', FileType: type })]);
    env.img_r2 = { get: async () => ({ body: 'public-data', size: 11, writeHttpMetadata: h => h.set('Content-Type', type) }) };
    const response = await worker.fetch(req(origin + '/file/' + id), env, { waitUntil: () => {} });
    assert.equal(response.status, 200); assert.equal(await response.text(), 'public-data');
    assert.match(response.headers.get('Content-Disposition'), new RegExp('^' + disposition));
    assert.match(response.headers.get('Cache-Control'), /^public/);
  }
});

test('legitimate HF direct upload completes and commits the issued path; tampering and replay fail', async () => {
  const { HuggingFaceAPI } = await load('utils/storage/huggingfaceAPI.js');
  const { onRequestPost: getUploadUrl } = await load('upload/huggingface/getUploadUrl.js');
  const originalInfo = HuggingFaceAPI.prototype.getLfsUploadInfo, originalCommit = HuggingFaceAPI.prototype.commitLfsFile;
  const hash = 'a'.repeat(64), committed = [], tasks = [];
  HuggingFaceAPI.prototype.getLfsUploadInfo = async () => ({ needsLfs: true, uploadAction: { href: 'https://huggingface.co/api/complete_multipart?uploadId=original', header: { chunk_size: '8' } } });
  HuggingFaceAPI.prototype.commitLfsFile = async (...args) => { committed.push(args); return { ok: true }; };
  const mock = mockPassport((url, init) => {
    if (url === 'https://id.viaai.si/api/v1/session') return sessionJson({ id: owner });
    assert.equal(url, 'https://huggingface.co/api/complete_multipart?uploadId=original');
    assert.equal(init.redirect, 'error'); return new Response('{}');
  });
  try {
    const env = fixture(); env.HF_TOKEN = 'fixture-only'; env.HF_REPO = 'fixture/repo'; env.HF_PRIVATE = 'true';
    const call = (handler, path, body) => handler(context(env, req(origin + path, { Cookie: 'viaai_sid=a', Origin: origin }, { method: 'POST', body: JSON.stringify(body) }), { waitUntil: task => tasks.push(task) }));
    const issued = await call(getUploadUrl, '/upload/huggingface/getUploadUrl', { fileSize: 16, fileName: 'test.bin', sha256: hash, fileSample: 'YQ==' });
    assert.equal(issued.status, 200); const info = await issued.json();
    assert.ok(info.fullId.startsWith('users/' + owner + '/'));
    const multipartPath = info.uploadAction.href.slice(origin.length);
    assert.equal((await call(completeMultipart, multipartPath, { oid: hash, parts: [{ partNumber: 1, etag: 'a' }] })).status, 200);
    const payload = { fullId: info.fullId, filePath: info.filePath, sha256: hash, fileSize: 16, channelName: info.channelName };
    assert.equal((await call(commitUpload, '/upload/huggingface/commitUpload', { ...payload, filePath: 'foreign/path' })).status, 404);
    assert.equal(committed.length, 0);
    assert.equal((await call(commitUpload, '/upload/huggingface/commitUpload', payload)).status, 200);
    await Promise.all(tasks);
    assert.equal(committed.length, 1); assert.equal(committed[0][0], info.filePath);
    assert.equal((await env.kv.getWithMetadata(info.fullId)).metadata.uploaderId, owner);
    assert.equal((await call(commitUpload, '/upload/huggingface/commitUpload', payload)).status, 404);
  } finally { mock.restore(); HuggingFaceAPI.prototype.getLfsUploadInfo = originalInfo; HuggingFaceAPI.prototype.commitLfsFile = originalCommit; }
});
