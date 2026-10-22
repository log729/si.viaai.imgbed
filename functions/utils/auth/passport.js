/**
 * 统一通行证（id.viaai.si）登录态
 *
 * - 没有 viaai_sid cookie 就直接判匿名，不发请求；
 * - 有就把 Cookie 头原样转发给通行证的 /api/v1/session（1.8 秒超时）；
 * - 超时 / 非 200 / 内容异常 / user.id 不是 u_ 形态 → 一律按匿名，不抛错；
 * - 同一个请求对象只问一次（WeakMap 缓存）。
 *
 * 环境变量 PASSPORT_LOGIN=off 时回到上游原来的访问码登录（回滚开关），其余值 / 未设置 = 开启。
 */

export const PASSPORT_SESSION_URL = 'https://id.viaai.si/api/v1/session';
export const PASSPORT_TIMEOUT_MS = 1800;
export const PASSPORT_SITE_ORIGIN = 'https://imgbed.viaai.si';

const USER_ID_RE = /^u_[A-Za-z0-9_-]{1,64}$/;
const SID_RE = /(?:^|;\s*)viaai_sid=([^;]+)/;

const cache = new WeakMap();

/** 通行证登录是否开启（默认开，PASSPORT_LOGIN=off 才关） */
export function passportLoginEnabled(env) {
    return String(env?.PASSPORT_LOGIN ?? '').trim().toLowerCase() !== 'off';
}

/**
 * @param {Request} request
 * @returns {Promise<{id: string, username: string}|null>} 已登录返回用户，否则 null
 */
export function getPassportUser(request) {
    if (cache.has(request)) return cache.get(request);
    const p = lookup(request).catch(() => null);
    cache.set(request, p);
    return p;
}

async function lookup(request) {
    const cookie = request.headers.get('Cookie');
    if (!cookie || !SID_RE.test(cookie)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PASSPORT_TIMEOUT_MS);
    try {
        const res = await fetch(PASSPORT_SESSION_URL, {
            method: 'GET',
            headers: { Cookie: cookie, Accept: 'application/json' },
            redirect: 'manual',
            signal: ctrl.signal,
        });
        if (res.status !== 200) return null;
        const data = await res.json();
        const user = data && data.ok === true && data.authenticated === true ? data.user : null;
        if (!user || typeof user.id !== 'string' || !USER_ID_RE.test(user.id)) return null;
        return {
            id: user.id,
            username: typeof user.username === 'string' ? user.username.slice(0, 64) : '',
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
