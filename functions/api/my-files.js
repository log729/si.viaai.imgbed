import { authenticate, AUTH_SCOPE } from '../utils/auth/authCore.js';
import { isOriginAllowed } from '../utils/auth/passportUpload.js';
import { validFileId } from '../utils/auth/fileOwnership.js';
import { getDatabase } from '../utils/databaseAdapter.js';
import { readIndex, removeFileFromIndex } from '../utils/indexManager.js';
import { deleteFile } from './manage/delete/[[path]].js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization' },
});
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!['GET', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  const auth = await authenticate({ env, request, url, authScope: AUTH_SCOPE.USER, requiredPermission: request.method === 'GET' ? 'list' : 'delete' });
  if (!auth.authorized) return json({ error: 'Unauthorized' }, 401);
  // Shared access codes and API tokens have no individual owner. Administrators use /dashboard.
  if (!auth.userId) return json({ error: 'Individual passport account required' }, 403);
  if (!isOriginAllowed(request) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Forbidden' }, 403);
  try {
    if (request.method === 'GET') {
      const start = Math.max(0, Number.parseInt(url.searchParams.get('start'), 10) || 0);
      const count = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('count'), 10) || 30));
      const result = await readIndex(context, { ownerId: auth.userId, start, count, includeSubdirFiles: true });
      if (!result.success) return json({ error: 'File index unavailable' }, 503);
      // Do not expose channel internals, uploader identities, IP addresses or other metadata.
      const files = [];
      for (const file of result.files) {
        const current = await getDatabase(env).getWithMetadata(file.id);
        if (current?.metadata?.uploaderId !== auth.userId) continue;
        const m = current.metadata;
        files.push({ id: file.id, name: m.FileName || file.id, type: m.FileType || '', size: m.FileSizeBytes ?? null, uploadedAt: m.TimeStamp || null,
          url: '/file/' + file.id.split('/').map(encodeURIComponent).join('/') });
      }
      return json({ files, totalCount: result.totalCount, start, count });
    }
    // Destructive cookie-authenticated actions require the exact origin, even for non-browser requests.
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'Origin required' }, 403);
    const id = url.searchParams.get('id');
    if (!validFileId(id)) return json({ error: 'Invalid file id' }, 400);
    const record = await getDatabase(env).getWithMetadata(id);
    // Hide the existence of other users' files and unowned legacy files.
    if (!record?.metadata || record.metadata.uploaderId !== auth.userId) return json({ error: 'Not found' }, 404);
    const cdnUrl = url.origin + '/file/' + id.split('/').map(encodeURIComponent).join('/');
    if (!await deleteFile(env, id, cdnUrl, url)) return json({ error: 'Delete failed' }, 502);
    await removeFileFromIndex(context, id);
    return json({ success: true });
  } catch {
    return json({ error: 'File operation failed' }, 500);
  }
}
