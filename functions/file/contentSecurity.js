// Public file links remain public. Only inert media may render inline on this origin.
const INLINE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac',
]);
export function secureFileHeaders(headers) {
  const mime = (headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
  headers.delete('Set-Cookie');
  if (!INLINE_TYPES.has(mime)) {
    const disposition = headers.get('Content-Disposition') || '';
    headers.set('Content-Disposition', /^\w+;/.test(disposition) ? disposition.replace(/^\w+/, 'attachment') : 'attachment');
    if (!mime) headers.set('Content-Type', 'application/octet-stream');
  }
  return headers;
}
export function secureFileResponse(response) {
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: secureFileHeaders(new Headers(response.headers)) });
}
export async function fileContentSecurity(context) { return secureFileResponse(await context.next()); }
