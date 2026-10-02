import { startRequestLog } from './request-log';
import type { RequestLog } from './request-log';

export function tokenFor(request: Request): string {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    || process.env.GITHUB_PAT || process.env.NEXT_PUBLIC_PAT || '';
  if (!token) throw new Error('Enter a GitHub token in Settings or set GITHUB_PAT in .env.local.');
  return token;
}

export function requireLocalMutation(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Docker's internal URL can use port 3000 while the browser uses port 3100.
  // Host preserves the public authority, including the port. Do not trust an
  // arbitrary forwarded-host header to authorize an otherwise foreign origin.
  const host = request.headers.get('host') || url.host;
  if (origin) {
    let originUrl: URL;
    try { originUrl = new URL(origin); }
    catch { throw new Error('Cross-origin requests are not allowed.'); }
    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host.toLowerCase() !== host.toLowerCase()) {
      throw new Error('Cross-origin requests are not allowed.');
    }
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected a JSON request.');
}

export function apiError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'Request failed. Try again.' }, { status: 400 });
}

export async function loggedApi(request: Request, handler: (log: RequestLog) => Promise<Response>): Promise<Response> {
  const log = startRequestLog(request);
  let response: Response;
  try { response = await handler(log); }
  catch (error) {
    log.error('request.failed', error);
    response = apiError(error);
  }
  response.headers.set('X-Request-ID', log.requestId);
  log.complete(response.status);
  return response;
}
