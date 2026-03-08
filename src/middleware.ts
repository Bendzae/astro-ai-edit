import { defineMiddleware } from 'astro:middleware';
import { verifySession, isConfigured } from './lib/auth';

const PROTECTED_PREFIXES = ['/admin', '/api/'];
const PUBLIC_PATHS = ['/api/auth', '/admin/login'];

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  const isProtected = PROTECTED_PREFIXES.some(p => url.pathname.startsWith(p));
  const isPublic = PUBLIC_PATHS.some(p => url.pathname === p);

  if (!isProtected || isPublic || !isConfigured()) {
    return next();
  }

  const isValid = await verifySession(request.headers.get('cookie'));

  if (!isValid) {
    // API routes get 401, pages redirect to login
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return Response.redirect(new URL('/admin/login', url.origin), 302);
  }

  return next();
});
