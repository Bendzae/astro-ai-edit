import type { APIRoute } from 'astro';
import { GITHUB_REPO, ghFetch } from '../../lib/github';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { name, data } = await request.json();

  if (!name || !data) {
    return new Response(
      JSON.stringify({ error: 'name and data (base64) are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${Date.now()}-${sanitized}`;
  const path = `public/uploads/${filename}`;

  const res = await ghFetch(`/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Upload ${sanitized}`,
      content: data,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(
      JSON.stringify({ error: `Upload failed: ${err}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const result = await res.json();
  const url = result.content?.download_url
    || `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${path}`;

  return new Response(
    JSON.stringify({ url, path }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
