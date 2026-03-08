import type { APIRoute } from 'astro';
import { ghFetch } from '../../lib/github';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { pr_number, issue_number } = await request.json();

  if (!pr_number) {
    return new Response(
      JSON.stringify({ error: 'pr_number is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Merge the PR
  const mergeRes = await ghFetch(`/pulls/${pr_number}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: 'squash' }),
  });

  if (!mergeRes.ok) {
    const err = await mergeRes.text();
    return new Response(
      JSON.stringify({ error: `Failed to merge PR: ${err}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Close the linked issue if provided
  if (issue_number) {
    await ghFetch(`/issues/${issue_number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
