import test from 'node:test';
import assert from 'node:assert/strict';
import { load, makeEnv, mockPassport, sessionJson, req } from './setup.mjs';

const { authenticate, AUTH_SCOPE } = await load('utils/auth/authCore.js');
const { onRequestGet: sessionCheck } = await load('api/auth/sessionCheck.js');
const { onRequestPost: login } = await load('api/auth/login.js');

const U = 'https://imgbed.viaai.si/upload';
const PASS = { Cookie: 'viaai_sid=tok; viaai_in=1' };
const TOKEN = { id: 't1', name: 'cli', token: 'tok-abc', permissions: ['upload'], owner: 'admin', createdAt: 1, expiresAt: null };

/** 配了访问码 secret + 管理员 admin/pw + 一个 API Token */
const sec = (extra = {}) => ({
    auth: { user: { authCode: 'secret' }, admin: { adminUsername: 'admin', adminPassword: 'pw' } },
    apiTokens: { tokens: { t1: TOKEN } },
    ...extra,
});
const noCode = () => ({ auth: { user: { authCode: '' }, admin: { adminUsername: 'admin', adminPassword: 'pw' } } });

const auth = (env, request, scope = AUTH_SCOPE.USER, perm = 'upload') =>
    authenticate({ env, request, url: new URL(request.url), requiredPermission: perm, authScope: scope });

async function withPassport(user, fn) {
    const m = mockPassport(() => sessionJson(user));
    try { return await fn(m); } finally { m.restore(); }
}
function adminSession(env, token = 'adm') {
    env.kv.m.set(`manage@session@${token}`, JSON.stringify({ authType: 'admin', expiresAt: Date.now() + 3600e3 }));
    return `admin_session=${token}`;
}

test('开启：匿名 401（配了访问码）', async () => {
    const r = await auth(makeEnv({ security: sec() }), req(U));
    assert.equal(r.authorized, false);
});

test('开启：「未配置访问码」的库里匿名也是 401（不再放行）', async () => {
    const env = makeEnv({ security: noCode() });
    assert.equal((await auth(env, req(U))).authorized, false);
    assert.equal((await auth(env, req(U), AUTH_SCOPE.EITHER)).authorized, false);
    // 对照：PASSPORT_LOGIN=off 时是上游原行为（放行）
    const off = makeEnv({ security: noCode(), vars: { PASSPORT_LOGIN: 'off' } });
    assert.equal((await auth(off, req(U))).authorized, true);
});

test('开启：库里完全没有安全配置（全新实例）匿名也是 401', async () => {
    const env = makeEnv({ security: {} });
    assert.equal((await auth(env, req(U))).authorized, false);
});

test('开启：通行证已登录 → user，并带 userId / username', () => withPassport({}, async () => {
    const r = await auth(makeEnv({ security: sec() }), req(U, PASS));
    assert.deepEqual(r, { authorized: true, authType: 'user', userId: 'u_abc123', username: 'alice' });
    // 没配访问码也一样通过
    assert.equal((await auth(makeEnv({ security: noCode() }), req(U, PASS))).authorized, true);
    // EITHER 范围的用户那一支同样接受
    assert.equal((await auth(makeEnv({ security: sec() }), req(U, PASS), AUTH_SCOPE.EITHER)).authType, 'user');
}));

test('开启：通行证未登录（cookie 失效）→ 401', () => withPassport(null, async () => {
    assert.equal((await auth(makeEnv({ security: sec() }), req(U, PASS))).authorized, false);
}));

test('admin 范围不接受通行证身份', () => withPassport({}, async () => {
    const r = await auth(makeEnv({ security: sec() }), req(U, PASS), AUTH_SCOPE.ADMIN, 'manage');
    assert.equal(r.authorized, false);
}));

test('admin session 仍优先：authType admin，无 userId', () => withPassport({}, async () => {
    const env = makeEnv({ security: sec() });
    const r = await auth(env, req(U, { Cookie: adminSession(env) + '; viaai_sid=tok' }));
    assert.deepEqual(r, { authorized: true, authType: 'admin' });
}));

test('API Token 仍通过（admin 身份，无 userId），权限不够不通过', async () => {
    const env = makeEnv({ security: sec() });
    const ok = await auth(env, req(U, { Authorization: 'Bearer tok-abc' }));
    assert.deepEqual(ok, { authorized: true, authType: 'admin' });
    const no = await auth(env, req(U, { Authorization: 'Bearer tok-abc' }), AUTH_SCOPE.USER, 'delete');
    assert.equal(no.authorized, false);
});

test('老访问码客户端（脚本 / PicGo：URL 参数或 authCode 头，无 Origin）仍通过', async () => {
    const env = makeEnv({ security: sec() });
    assert.equal((await auth(env, req(U + '?authCode=secret'))).authorized, true);
    assert.equal((await auth(env, req(U, { authCode: 'secret' }))).authorized, true);
    assert.equal((await auth(env, req(U + '?authCode=wrong'))).authorized, false);
    assert.equal((await auth(env, req(U, { authCode: 'wrong' }))).authorized, false);
});

test('开启：浏览器来的访问码不再有效（带 Origin / Sec-Fetch-*、Referer、Cookie 里的 authCode）', async () => {
    const env = makeEnv({ security: sec() });
    assert.equal((await auth(env, req(U + '?authCode=secret', { Origin: 'https://imgbed.viaai.si' }))).authorized, false);
    assert.equal((await auth(env, req(U, { authCode: 'secret', 'Sec-Fetch-Site': 'same-origin' }))).authorized, false);
    assert.equal((await auth(env, req(U, { Referer: 'https://imgbed.viaai.si/?authCode=secret' }))).authorized, false);
    assert.equal((await auth(env, req(U, { Cookie: 'authCode=secret' }))).authorized, false);
});

test('开启：旧的 user_session 不再被认', async () => {
    const env = makeEnv({ security: sec() });
    env.kv.m.set('manage@session@old', JSON.stringify({ authType: 'user', expiresAt: Date.now() + 3600e3 }));
    assert.equal((await auth(env, req(U, { Cookie: 'user_session=old' }))).authorized, false);
    const off = makeEnv({ security: sec(), vars: { PASSPORT_LOGIN: 'off' } });
    off.kv.m.set('manage@session@old', JSON.stringify({ authType: 'user', expiresAt: Date.now() + 3600e3 }));
    assert.equal((await auth(off, req(U, { Cookie: 'user_session=old' }))).authorized, true);
});

test('PASSPORT_LOGIN=off 恢复旧行为：通行证 cookie 不再算数，Referer / Cookie 访问码可用，不发通行证请求', () => withPassport({}, async (m) => {
    const env = makeEnv({ security: sec(), vars: { PASSPORT_LOGIN: 'off' } });
    assert.equal((await auth(env, req(U, PASS))).authorized, false);
    assert.equal((await auth(env, req(U, { Cookie: 'authCode=secret', Origin: 'https://x' }))).authorized, true);
    assert.equal(m.calls.length, 0);
}));

// ---- /api/auth/sessionCheck ----
const check = async (env, request) => {
    const res = await sessionCheck({ request, env });
    return { status: res.status, body: await res.json() };
};

test('sessionCheck：匿名 valid:false, userRequired:true（即使没配访问码）', async () => {
    const a = await check(makeEnv({ security: sec() }), req('https://imgbed.viaai.si/api/auth/sessionCheck'));
    assert.deepEqual(a.body, { valid: false, adminRequired: true, userRequired: true, passportLogin: true });
    const b = await check(makeEnv({ security: noCode() }), req('https://imgbed.viaai.si/api/auth/sessionCheck'));
    assert.equal(b.body.valid, false);
    assert.equal(b.body.userRequired, true);
});

test('sessionCheck：通行证已登录 valid:true authType:user + passport', () => withPassport({}, async () => {
    const r = await check(makeEnv({ security: sec() }), req('https://imgbed.viaai.si/api/auth/sessionCheck', PASS));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
        valid: true, authType: 'user', adminRequired: true, userRequired: true, passportLogin: true,
        passport: { id: 'u_abc123', username: 'alice' },
    });
}));

test('sessionCheck：admin session 仍返回 authType admin（通行证不能当管理员）', () => withPassport({}, async () => {
    const env = makeEnv({ security: sec() });
    const r = await check(env, req('https://imgbed.viaai.si/api/auth/sessionCheck', { Cookie: adminSession(env) + '; viaai_sid=tok' }));
    assert.equal(r.body.valid, true);
    assert.equal(r.body.authType, 'admin');
}));

test('sessionCheck：PASSPORT_LOGIN=off 回到上游结构（没有 passportLogin 字段）', async () => {
    const r = await check(makeEnv({ security: sec(), vars: { PASSPORT_LOGIN: 'off' } }), req('https://imgbed.viaai.si/api/auth/sessionCheck'));
    assert.deepEqual(r.body, { valid: false, adminRequired: true, userRequired: true });
});

// ---- /api/auth/login ----
test('login：开启时 410，不创建会话、不设置 cookie（即使访问码正确）', async () => {
    const env = makeEnv({ security: sec() });
    const res = await login({ env, request: req('https://imgbed.viaai.si/api/auth/login', {}, { method: 'POST', body: JSON.stringify({ authCode: 'secret' }) }) });
    assert.equal(res.status, 410);
    assert.equal(res.headers.get('Set-Cookie'), null);
    const j = await res.json();
    assert.match(j.message, /通行证/);
    assert.ok(![...env.kv.m.keys()].some(k => k.startsWith('manage@session@')));
});

test('login：PASSPORT_LOGIN=off 时仍是访问码登录（正确 200 + cookie，错误 401）', async () => {
    const env = makeEnv({ security: sec(), vars: { PASSPORT_LOGIN: 'off' } });
    const mk = (code) => ({ env, request: req('https://imgbed.viaai.si/api/auth/login', {}, { method: 'POST', body: JSON.stringify({ authCode: code }) }) });
    const ok = await login(mk('secret'));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('Set-Cookie'), /^user_session=/);
    assert.equal((await login(mk('bad'))).status, 401);
});
