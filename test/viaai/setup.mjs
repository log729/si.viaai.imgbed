import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);

export const ROOT = new URL('../../functions/', import.meta.url).href;
export const load = (p) => import(ROOT + p);

/** 内存版 KV（只实现用到的方法），记录读写次数 */
export function fakeKV() {
    const m = new Map();
    const kv = {
        reads: 0, writes: 0, m,
        async get(k) { kv.reads++; return m.has(k) ? m.get(k) : null; },
        async getWithMetadata(k) { kv.reads++; return { value: m.get(k) ?? null, metadata: null }; },
        async put(k, v, o) { kv.writes++; m.set(k, v); kv.lastOptions = o; },
        async delete(k) { m.delete(k); },
        async list() { return { keys: [], list_complete: true }; },
    };
    return kv;
}

/** 构造 env：security 为 manage@sysConfig@security 的内容 */
export function makeEnv({ security = {}, vars = {} } = {}) {
    const kv = fakeKV();
    kv.m.set('manage@sysConfig@security', JSON.stringify(security));
    return { img_url: kv, kv, ...vars };
}

/** 替换全局 fetch 模拟通行证；返回 { calls, restore } */
export function mockPassport(handler) {
    const real = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init);
    };
    return { calls, restore() { globalThis.fetch = real; } };
}

export const sessionJson = (user) => new Response(JSON.stringify(user
    ? { ok: true, authenticated: true, user: { id: 'u_abc123', username: 'alice', displayName: 'Alice', email: 'a@b.c', lang: 'zh', ...user } }
    : { ok: true, authenticated: false }), { status: 200, headers: { 'content-type': 'application/json' } });

export const req = (url, headers = {}, init = {}) => new Request(url, { headers, ...init });
