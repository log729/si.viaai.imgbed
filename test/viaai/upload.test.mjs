import test from 'node:test';
import assert from 'node:assert/strict';
import { load, makeEnv, mockPassport, sessionJson } from './setup.mjs';

const { onRequest } = await load('upload/index.js');
const { countUpload, guardUpload, withUploader, parseAllowedUsers, MINUTE_LIMIT, DAY_LIMIT } = await load('utils/auth/passportUpload.js');

const SITE = 'https://imgbed.viaai.si';
const TOKEN = { id: 't1', name: 'cli', token: 'tok-abc', permissions: ['upload'], owner: 'admin', createdAt: 1, expiresAt: null };
const security = (extra = {}) => ({
    auth: { user: { authCode: 'secret' }, admin: { adminUsername: 'admin', adminPassword: 'pw' } },
    apiTokens: { tokens: { t1: TOKEN } }, ...extra,
});

/** 发一次「鉴权通过会返回 400、不通过 401」的上传请求（初始化分块上传，缺参数；不会写任何文件） */
async function upload(env, { headers = {}, query = '?initChunked=true' } = {}) {
    const request = new Request(`${SITE}/upload${query}`, { method: 'POST', headers, body: new FormData() });
    const res = await onRequest({ request, env, params: {}, waitUntil() {}, next() {}, data: {} });
    return res;
}
const PASS = { Cookie: 'viaai_sid=tok', Origin: SITE };
function passportAs(id) {
    return mockPassport(() => sessionJson(id ? { id } : null));
}

test('匿名上传 401（配了访问码 / 没配访问码都是）', async () => {
    assert.equal((await upload(makeEnv({ security: security() }))).status, 401);
    assert.equal((await upload(makeEnv({ security: { auth: { user: { authCode: '' }, admin: { adminUsername: 'a', adminPassword: 'b' } } } }))).status, 401);
    assert.equal((await upload(makeEnv({ security: {} }))).status, 401);
});

test('通行证登录的上传：鉴权通过（走到参数校验 400，而不是 401）', async () => {
    const m = passportAs('u_abc123');
    try { assert.equal((await upload(makeEnv({ security: security() }), { headers: PASS })).status, 400); } finally { m.restore(); }
});

test('Origin 校验：伪造 Origin 403；无 Origin 放行；localhost 放行', async () => {
    const m = passportAs('u_abc123');
    try {
        const env = makeEnv({ security: security() });
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t', Origin: 'https://evil.example' } })).status, 403);
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t', Origin: 'null' } })).status, 403);
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t', Origin: 'https://imgbed.viaai.si.evil.com' } })).status, 403);
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t' } })).status, 400);
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t', Origin: 'http://localhost:8788' } })).status, 400);
        assert.equal((await upload(env, { headers: { Cookie: 'viaai_sid=t', Origin: 'http://127.0.0.1:8080' } })).status, 400);
    } finally { m.restore(); }
});

test('限流：每分钟第 11 次 429（超限那次不再写 KV）', async () => {
    const m = passportAs('u_abc123');
    try {
        const env = makeEnv({ security: security() });
        for (let i = 1; i <= MINUTE_LIMIT; i++) assert.equal((await upload(env, { headers: PASS })).status, 400, `第 ${i} 次`);
        const w = env.kv.writes;
        const r = await upload(env, { headers: PASS });
        assert.equal(r.status, 429);
        assert.equal(r.headers.get('Retry-After'), '60');
        assert.equal(env.kv.writes, w);
        // 别的用户不受影响
        m.restore();
        const m2 = passportAs('u_other');
        try { assert.equal((await upload(env, { headers: PASS })).status, 400); } finally { m2.restore(); }
    } finally { m.restore(); }
});

test('限流：每天第 101 张 429；分钟计数过一分钟清零', async () => {
    const env = makeEnv({ security: security() });
    const t0 = Date.UTC(2026, 9, 22, 8, 0, 0);
    for (let i = 0; i < DAY_LIMIT; i++) {
        // 每 5 张换一分钟，避开分钟限额
        assert.equal(await countUpload(env, 'u_day', t0 + Math.floor(i / 5) * 60000), null, `第 ${i + 1} 张`);
    }
    const msg = await countUpload(env, 'u_day', t0 + 30 * 60000);
    assert.match(msg, /100/);
    // 第二天重新计
    assert.equal(await countUpload(env, 'u_day', t0 + 24 * 3600e3), null);
    // 分钟：11 次里第 11 次拒，下一分钟又可以
    for (let i = 0; i < MINUTE_LIMIT; i++) assert.equal(await countUpload(env, 'u_min', t0), null);
    assert.match(await countUpload(env, 'u_min', t0 + 59000), /10/);
    assert.equal(await countUpload(env, 'u_min', t0 + 60000), null);
});

test('每次计数的 KV 开销：1 读 1 写；key 为 manage@viaai@upload@<userId>（D1 下进 settings 表），带 TTL', async () => {
    const env = makeEnv({ security: {} });
    const r0 = env.kv.reads, w0 = env.kv.writes;
    await countUpload(env, 'u_cost', Date.UTC(2026, 9, 22, 8, 0, 0));
    assert.equal(env.kv.reads - r0, 1);
    assert.equal(env.kv.writes - w0, 1);
    assert.ok(env.kv.m.has('manage@viaai@upload@u_cost'));
    assert.equal(JSON.parse(env.kv.m.get('manage@viaai@upload@u_cost')).day, '20261022');
    assert.ok(env.kv.lastOptions.expirationTtl >= 86400);
});

test('管理员 session / API Token / 访问码客户端：不限流、不查 Origin、不看白名单', async () => {
    const m = passportAs('u_abc123');
    try {
        const env = makeEnv({ security: security(), vars: { UPLOAD_ALLOWED_USERS: 'u_nobody' } });
        env.kv.m.set('manage@session@adm', JSON.stringify({ authType: 'admin', expiresAt: Date.now() + 3600e3 }));
        const w0 = env.kv.writes;
        for (let i = 0; i < MINUTE_LIMIT + 5; i++) {
            assert.equal((await upload(env, { headers: { Cookie: 'admin_session=adm; viaai_sid=t', Origin: 'https://evil.example' } })).status, 400);
            assert.equal((await upload(env, { headers: { Authorization: 'Bearer tok-abc' } })).status, 400);
            assert.equal((await upload(env, { query: '?initChunked=true&authCode=secret' })).status, 400);
        }
        assert.equal(env.kv.writes, w0, '这些途径不写计数');
    } finally { m.restore(); }
});

test('白名单 UPLOAD_ALLOWED_USERS：设置了才限制；不在名单 403，在名单通过', async () => {
    const m = passportAs('u_abc123');
    try {
        const listed = makeEnv({ security: security(), vars: { UPLOAD_ALLOWED_USERS: ' u_x , u_abc123 ' } });
        assert.equal((await upload(listed, { headers: PASS })).status, 400);
        const notListed = makeEnv({ security: security(), vars: { UPLOAD_ALLOWED_USERS: 'u_x,u_y' } });
        assert.equal((await upload(notListed, { headers: PASS })).status, 403);
        assert.equal(notListed.kv.writes, 0, '被白名单挡掉的不计数');
        const unset = makeEnv({ security: security() });
        assert.equal((await upload(unset, { headers: PASS })).status, 400);
        const blank = makeEnv({ security: security(), vars: { UPLOAD_ALLOWED_USERS: '  ' } });
        assert.equal((await upload(blank, { headers: PASS })).status, 400);
    } finally { m.restore(); }
});

test('分块上传的中间分块 / 合并 / 清理不计数，初始化计一次', async () => {
    const m = passportAs('u_abc123');
    try {
        const env = makeEnv({ security: security() });
        await upload(env, { headers: PASS, query: '?chunked=true' });
        await upload(env, { headers: PASS, query: '?chunked=true&merge=true' });
        await upload(env, { headers: PASS, query: '?cleanup=true' });
        assert.equal(env.kv.writes, 0);
        await upload(env, { headers: PASS, query: '?initChunked=true' });
        assert.equal(env.kv.writes, 1);
    } finally { m.restore(); }
});

test('guardUpload 返回上传者；withUploader 只加两个字段，访问码 / token / admin 不加', async () => {
    const m = passportAs('u_abc123');
    try {
        const env = makeEnv({ security: security() });
        const url = new URL(`${SITE}/upload`);
        const g = await guardUpload({ env, url, request: new Request(url, { headers: PASS }) });
        assert.deepEqual(g.uploader, { id: 'u_abc123', name: 'alice' });
        const md = withUploader({ FileName: 'a.png', Tags: [] }, g.uploader);
        assert.deepEqual(md, { FileName: 'a.png', Tags: [], uploaderId: 'u_abc123', uploaderName: 'alice' });
        assert.deepEqual(withUploader({ FileName: 'a.png' }, null), { FileName: 'a.png' });
        const t = await guardUpload({ env, url, request: new Request(url, { headers: { Authorization: 'Bearer tok-abc' } }) });
        assert.equal(t.uploader, null);
    } finally { m.restore(); }
});

test('PASSPORT_LOGIN=off：上传回到旧行为（通行证 cookie 无效，访问码有效）', async () => {
    const env = makeEnv({ security: security(), vars: { PASSPORT_LOGIN: 'off' } });
    assert.equal((await upload(env, { headers: PASS })).status, 401);
    assert.equal((await upload(env, { query: '?initChunked=true&authCode=secret' })).status, 400);
});

test('parseAllowedUsers', () => {
    assert.equal(parseAllowedUsers({}), null);
    assert.equal(parseAllowedUsers({ UPLOAD_ALLOWED_USERS: ',' }), null);
    assert.deepEqual([...parseAllowedUsers({ UPLOAD_ALLOWED_USERS: 'a, b' })], ['a', 'b']);
});
