import { fetchSecurityConfig } from "../../utils/sysConfig.js";
import { verifyPassword, rehashIfNeeded } from "../../utils/auth/passwordHash.js";
import { createSession } from "../../utils/auth/sessionManager.js";
import { getDatabase } from "../../utils/databaseAdapter.js";
import { passportLoginEnabled } from "../../utils/auth/passport.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    // viaai.si 站群：网页端的访问码登录已被统一通行证（id.viaai.si）替代，不再创建会话。
    // 设环境变量 PASSPORT_LOGIN=off 可恢复上游原来的访问码登录。
    if (passportLoginEnabled(env)) {
        return new Response(JSON.stringify({
            error: 'gone',
            message: '访问码登录已停用，请使用统一通行证登录 / Access-code login is retired, please sign in with your viaai.si account.',
            login: 'https://id.viaai.si/login',
        }), {
            status: 410,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const jsonRequest = await request.json();
    const authCode = jsonRequest.authCode;

    // 读取安全设置
    let securityConfig;
    try {
        securityConfig = await fetchSecurityConfig(env, { throwOnError: true });
    } catch (error) {
        console.error('User login blocked because security config could not be loaded:', error);
        return new Response('Security config unavailable', { status: 503 });
    }
    const rightAuthCode = securityConfig.auth.user.authCode;

    // 验证 authCode（兼容明文、SHA-256 和 PBKDF2 三种存储格式）
    if (rightAuthCode !== undefined && rightAuthCode !== '') {
        const isValid = await verifyPassword(authCode, rightAuthCode);
        if (!isValid) {
            return new Response('Unauthorized', { status: 401 });
        }

        // 登录成功后，自动升级旧版哈希为 PBKDF2
        await rehashIfNeeded(getDatabase(env), authCode, rightAuthCode, 'auth.user.authCode');
    }

    // 创建会话并通过 HttpOnly Cookie 返回
    const { cookie } = await createSession(env, 'user');

    return new Response('Login success', {
        status: 200,
        headers: {
            'Set-Cookie': cookie,
        },
    });
}
