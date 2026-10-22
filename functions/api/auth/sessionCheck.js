import { validateAnySession, validateSession } from "../../utils/auth/sessionManager.js";
import { getPassportUser, passportLoginEnabled } from "../../utils/auth/passport.js";
import { fetchSecurityConfig } from "../../utils/sysConfig.js";

/**
 * 会话检查接口
 * 用于前端路由守卫检查当前会话是否有效
 * 同时返回各端是否需要认证
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    // 读取安全配置，判断是否需要认证
    let securityConfig;
    try {
        securityConfig = await fetchSecurityConfig(env, { throwOnError: true });
    } catch (error) {
        console.error('Session check failed because security config could not be loaded:', error);
        return new Response(JSON.stringify({ error: 'Security config unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const adminUsername = securityConfig.auth.admin.adminUsername;
    const adminPassword = securityConfig.auth.admin.adminPassword;
    const userAuthCode = securityConfig.auth.user.authCode;

    const adminRequired = !!(adminUsername && adminUsername.trim()) || !!(adminPassword && adminPassword.trim());
    const userRequired = !!(userAuthCode && userAuthCode.trim());

    // viaai.si 站群：用户端登录由统一通行证承担（PASSPORT_LOGIN=off 才走下面上游的逻辑）。
    // 管理员会话照旧；通行证身份只算 user，管理后台的路由守卫要求 authType === 'admin'，不会放行。
    // 旧的 user_session 不再认；userRequired 恒为 true，前端路由守卫会把未登录的人带到登录页（overlay 再转到通行证）。
    if (passportLoginEnabled(env)) {
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
        const admin = await validateSession(env, request, 'admin');
        if (admin.valid) {
            return new Response(JSON.stringify({
                valid: true, authType: 'admin', adminRequired, userRequired: true, passportLogin: true,
            }), { status: 200, headers });
        }
        const user = await getPassportUser(request);
        if (user) {
            return new Response(JSON.stringify({
                valid: true, authType: 'user', adminRequired, userRequired: true, passportLogin: true,
                passport: { id: user.id, username: user.username },
            }), { status: 200, headers });
        }
        return new Response(JSON.stringify({
            valid: false, adminRequired, userRequired: true, passportLogin: true,
        }), { status: 200, headers });
    }

    // 检查会话
    const sessionResult = await validateAnySession(env, request);
    if (sessionResult.valid) {
        return new Response(JSON.stringify({
            valid: true,
            authType: sessionResult.session.authType,
            adminRequired,
            userRequired,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({
        valid: false,
        adminRequired,
        userRequired,
    }), {
        status: 200, // 不再返回 401，让前端根据字段判断
        headers: { 'Content-Type': 'application/json' },
    });
}
