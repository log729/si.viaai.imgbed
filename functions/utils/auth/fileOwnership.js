import { getDatabase } from '../databaseAdapter.js';

export const sessionOwner = context => context.uploader?.id || null;
export function ownsUploadSession(context, session) {
  return !!session && (session.ownerId ?? null) === sessionOwner(context);
}
export function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
export function validUploadId(id) { return typeof id === 'string' && /^upload_[A-Za-z0-9_-]{1,120}$/.test(id); }
export function validFileId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 1024 &&
    !/[\u0000-\u0020\u007f\\%?#]/.test(id) && !id.includes('@') &&
    !id.startsWith('/') && !id.split('/').some(p => !p || p === '.' || p === '..') &&
    !/^(?:chunk_|upload_session_|multipart_)/.test(id);
}
export async function readUploadTicket(env, id, uploader) {
  if (!validFileId(id)) return null;
  const raw = await getDatabase(env).get('manage@viaai@hf@' + id);
  if (!raw) return null;
  const ticket = JSON.parse(raw);
  return ticket.ownerId === (uploader?.id || null) && ticket.expiresAt > Date.now() ? ticket : null;
}
