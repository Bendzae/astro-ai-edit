import type { APIRoute } from 'astro';
import { validateCredentials, createSessionCookie, clearSessionCookie } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password || !validateCredentials(username, password)) {
    // Delay to slow brute force
    await new Promise(r => setTimeout(r, 1000));
    return new Response(
      JSON.stringify({ error: 'Invalid credentials' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cookie = await createSessionCookie();

  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    }
  );
};

export const DELETE: APIRoute = async () => {
  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(),
      },
    }
  );
};
