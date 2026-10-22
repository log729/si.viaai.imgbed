import test from 'node:test';
import assert from 'node:assert/strict';
import { load, mockPassport, sessionJson, req } from './setup.mjs';

const { getPassportUser, passportLoginEnabled, PASSPORT_SESSION_URL } = await load('utils/auth/passport.js');
const URL_ = 'https://imgbed.viaai.si/upload';

test('没有 viaai_sid cookie：匿名，不发请求', async () => {
    const m = mockPassport(() => sessionJson({}));
    try {
        assert.equal(await getPassportUser(req(URL_)), null);
        assert.equal(await getPassportUser(req(URL_, { Cookie: 'other=1; viaai_in=1' })), null);
        assert.equal(m.calls.length, 0);
    } finally { m.restore(); }
});

test('有 cookie：原样转发 Cookie 头到通行证，返回 id / username', async () => {
    const m = mockPassport(() => sessionJson({}));
    try {
        const cookie = 'a=1; viaai_sid=tok123; viaai_in=1';
        const u = await getPassportUser(req(URL_, { Cookie: cookie }));
        assert.deepEqual(u, { id: 'u_abc123', username: 'alice' });
        assert.equal(m.calls.length, 1);
        assert.equal(m.calls[0].url, PASSPORT_SESSION_URL);
        assert.equal(m.calls[0].init.headers.Cookie, cookie);
        assert.ok(m.calls[0].init.signal, '带超时信号');
    } finally { m.restore(); }
});

test('同一个请求只问一次（并发也是）', async () => {
    const m = mockPassport(() => sessionJson({}));
    try {
        const r = req(URL_, { Cookie: 'viaai_sid=t' });
        await Promise.all([getPassportUser(r), getPassportUser(r)]);
        await getPassportUser(r);
        assert.equal(m.calls.length, 1);
    } finally { m.restore(); }
});

test('异常一律匿名且不抛错：非 200 / 未登录 / 坏 JSON / id 形态不对 / 抛错', async () => {
    const cases = [
        () => new Response('x', { status: 500 }),
        () => new Response('{}', { status: 401 }),
        () => sessionJson(null),
        () => new Response('not json', { status: 200 }),
        () => new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200 }),
        () => sessionJson({ id: 'x_abc' }),
        () => sessionJson({ id: 12 }),
        () => sessionJson({ id: 'u_' }),
        () => sessionJson({ id: 'u_a b' }),
        () => { throw new Error('network'); },
    ];
    for (const h of cases) {
        const m = mockPassport(h);
        try { assert.equal(await getPassportUser(req(URL_, { Cookie: 'viaai_sid=t' })), null); } finally { m.restore(); }
    }
});

test('超时（1.8 秒）按匿名', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    try {
        const t0 = Date.now();
        assert.equal(await getPassportUser(req(URL_, { Cookie: 'viaai_sid=t' })), null);
        const dt = Date.now() - t0;
        assert.ok(dt >= 1700 && dt < 3000, `耗时 ${dt}ms`);
    } finally { globalThis.fetch = real; }
});

test('PASSPORT_LOGIN 开关：默认开，仅 off 关闭', () => {
    assert.equal(passportLoginEnabled({}), true);
    assert.equal(passportLoginEnabled({ PASSPORT_LOGIN: 'on' }), true);
    assert.equal(passportLoginEnabled({ PASSPORT_LOGIN: '' }), true);
    assert.equal(passportLoginEnabled({ PASSPORT_LOGIN: 'off' }), false);
    assert.equal(passportLoginEnabled({ PASSPORT_LOGIN: ' OFF ' }), false);
});
