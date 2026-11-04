import { fetchOthersConfig } from './sysConfig.js';
import { checkDatabaseConfig as checkDbConfig } from './databaseAdapter.js';

// Never hand the live Request, context, exceptions or environment to a telemetry SDK.
// Only these fixed, non-user-controlled fields can leave this application.
export function telemetryEvent(request, status, duration) {
  const path = new URL(request.url).pathname;
  const route = path.startsWith('/upload') ? 'upload' : path.startsWith('/api/manage/') ? 'manage' : 'other';
  return {
    event_id: crypto.randomUUID().replaceAll('-', ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: status >= 500 ? 'error' : 'info',
    message: 'Image host request completed',
    tags: { route, method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(request.method) ? request.method : 'OTHER', status: String(status) },
    extra: { duration_ms: Math.max(0, Math.round(duration)) },
  };
}

export function telemetryDestination(raw) {
  try {
    const u = new URL(raw);
    const match = /^\/(?:.*\/)?(\d+)$/.exec(u.pathname);
    if (u.protocol !== 'https:' || !u.username || u.password || u.search || u.hash || !match) return null;
    const key = u.username;
    u.username = '';
    u.pathname = u.pathname.replace(/\/\d+$/, '/api/' + match[1] + '/envelope/');
    return { url: u.href, key };
  } catch { return null; }
}

export async function errorHandling(context) {
  const config = await fetchOthersConfig(context.env);
  const destination = config.telemetry?.enabled && context.env.disable_telemetry !== 'true'
    ? telemetryDestination(context.env.SENTRY_DSN) : null;
  if (!destination) return context.next();
  const rate = Number(context.env.sampleRate ?? 0.001);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1 || Math.random() >= rate) return context.next();
  const started = Date.now();
  let status = 500;
  try {
    const response = await context.next();
    status = response.status;
    return response;
  } finally {
    const event = telemetryEvent(context.request, status, Date.now() - started);
    const body = JSON.stringify({ event_id: event.event_id }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(event);
    const task = fetch(destination.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': 'Sentry sentry_version=7,sentry_key=' + destination.key },
      body,
    }).then(() => {}).catch(() => {});
    context.waitUntil(task);
  }
}

// Kept for compatibility with existing middleware chains; no credential capture.
export async function telemetryData(context) { return context.next(); }
export async function traceData() {}

// 检查数据库是否配置
export async function checkDatabaseConfig(context) {
  var env = context.env;

  var dbConfig = checkDbConfig(env);

  if (!dbConfig.configured) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "数据库未配置 / Database not configured",
        message: "请配置 KV 存储 (env.img_url) 或 D1 数据库 (env.img_d1)。 / Please configure KV storage (env.img_url) or D1 database (env.img_d1)."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // 继续执行
  return await context.next();
}