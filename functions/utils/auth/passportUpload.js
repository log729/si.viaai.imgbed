/**
 * 上传入口的鉴权 + 通行证用户防滥用（viaai.si 站群）
 *
 * 通行证注册是开放的，所以用通行证 cookie 上传的用户要额外受限：
 *   1. Origin 校验：请求带 Origin 时必须是 https://imgbed.viaai.si（本机开发的 localhost / 127.0.0.1 放行）；
 *   2. 白名单：环境变量 UPLOAD_ALLOWED_USERS（逗号分隔的通行证用户 id），设置了才限制；
 *   3. 限流：每用户每分钟最多 10 次上传请求、每天最多 100 张（每次上传 1 读 1 写，见 countUpload）。
 * admin / API Token / 访问码客户端（没有 userId）不受 1~3 影响。
 */

import { authenticate, AUTH_SCOPE } from './authCore.js';
import { PASSPORT_SITE_ORIGIN } from './passport.js';
import { getDatabase } from '../databaseAdapter.js';
import { UnauthorizedResponse } from './userAuth.js';

export const MINUTE_LIMIT = 10;
export const DAY_LIMIT = 100;

const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function text(message, status) {
    return new Response(message, {
        status,
        headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Cache-Control': 'no-store',
        },
    });
}

/** 解析 UPLOAD_ALLOWED_USERS；未设置 / 空 → null（不限制） */
export function parseAllowedUsers(env) {
    const raw = String(env?.UPLOAD_ALLOWED_USERS ?? '').trim();
    if (!raw) return null;
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    return ids.length ? new Set(ids) : null;
}

/** 通行证用户是否在上传白名单内（没设置白名单 = 都可以） */
export function isUploadAllowed(env, userId) {
    const allowed = parseAllowedUsers(env);
    return !allowed || allowed.has(userId);
}

export function isOriginAllowed(request) {
    const origin = request.headers.get('Origin');
    if (origin === null) return true; // 非浏览器请求：按其鉴权方式处理
    return origin === PASSPORT_SITE_ORIGIN || LOCAL_ORIGIN_RE.test(origin);
}

/**
 * 计数并检查限额。每个用户一个 key：manage@viaai@upload@<userId>，值 {day, d, m, mc}（UTC 日期、日计数、当前分钟、分钟计数），换天自动清零。
 * 用 manage@ 前缀是因为图床的 D1 适配器把 manage@ 开头的键存进 settings 表（其余键会被当成文件记录写进 files 表，污染文件列表）；
 * 每用户只有一行，不会随天数增长；KV 模式下另带 2 天 TTL。
 * 每次上传 1 次读 + 1 次写；超限（429）时只读不写。
 * 读后写不是原子的，并发请求可能少算几次，对防滥用够用。
 * @returns {Promise<string|null>} 超限返回说明文字，否则 null
 */
export async function countUpload(env, userId, now = Date.now()) {
    const db = getDatabase(env);
    const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
    const minute = Math.floor(now / 60000);
    const key = `manage@viaai@upload@${userId}`;

    let rec = { day, d: 0, m: minute, mc: 0 };
    try {
        const raw = await db.get(key);
        if (raw) {
            const p = JSON.parse(raw);
            if (p.day === day) rec = { day, d: Number(p.d) || 0, m: Number(p.m) || 0, mc: Number(p.mc) || 0 };
        }
    } catch { /* 计数损坏按 0 处理 */ }
    if (rec.m !== minute) { rec.m = minute; rec.mc = 0; }

    if (rec.mc >= MINUTE_LIMIT) return `Too many uploads: at most ${MINUTE_LIMIT} per minute. 上传过于频繁，每分钟最多 ${MINUTE_LIMIT} 次，请稍后再试。`;
    if (rec.d >= DAY_LIMIT) return `Daily upload limit reached: at most ${DAY_LIMIT} per day. 今日上传已达上限（每天最多 ${DAY_LIMIT} 张），请明天再试。`;

    rec.d += 1;
    rec.mc += 1;
    await db.put(key, JSON.stringify(rec), { expirationTtl: 172800 });
    return null;
}

/**
 * 上传鉴权（替代 userAuthCheck）。
 * @param {Object} o
 * @param {boolean} [o.count=true] 本次请求是否算一次上传（分块上传的中间分块 / 合并不算）
 * @returns {Promise<{response: Response}|{uploader: {id: string, name: string}|null}>}
 */
export async function guardUpload({ env, url, request, requiredPermission = 'upload', count = true }) {
    const auth = await authenticate({ env, request, url, requiredPermission, authScope: AUTH_SCOPE.USER });
    if (!auth.authorized) {
        return { response: UnauthorizedResponse('Unauthorized') };
    }
    if (!auth.userId) {
        return { uploader: null };
    }

    if (!isOriginAllowed(request)) {
        return { response: text('Forbidden: origin not allowed', 403) };
    }
    if (!isUploadAllowed(env, auth.userId)) {
        return { response: text('Forbidden: this account has no upload permission (whitelisted accounts only). 当前账号没有上传权限（仅限白名单使用）。', 403) };
    }
    if (count) {
        const msg = await countUpload(env, auth.userId);
        if (msg) {
            return { response: new Response(msg, { status: 429, headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': 'no-store', 'Retry-After': '60' } }) };
        }
    }
    return { uploader: { id: auth.userId, name: auth.username || '' } };
}

/** 往文件元数据里加上传者（仅通行证登录上传时），不改变现有字段 */
export function withUploader(metadata, uploader) {
    if (uploader) {
        metadata.uploaderId = uploader.id;
        metadata.uploaderName = uploader.name;
    }
    return metadata;
}
