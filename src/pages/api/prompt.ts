import type { APIRoute } from 'astro';
import { GITHUB_TOKEN, GITHUB_REPO, ghFetch } from '../../lib/github';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return new Response(
      JSON.stringify({ error: 'Missing GITHUB_TOKEN or GITHUB_REPO env vars' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json();
  const { prompt, issue_number, pr_number, images } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid prompt' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build image markdown section
  const imageSection = images?.length
    ? '\n\n### Attached images\n' + images.map((img: { url: string; path: string }) =>
        `![${img.path.split('/').pop()}](${img.url})\n\nFile available in repo at \`${img.path}\``
      ).join('\n\n')
    : '';

  // Follow-up: comment on existing PR
  if (pr_number) {
    const commentRes = await ghFetch(`/issues/${pr_number}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: `${prompt}${imageSection}\n\n@claude`,
      }),
    });

    if (!commentRes.ok) {
      const err = await commentRes.text();
      return new Response(
        JSON.stringify({ error: `GitHub API error: ${err}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ issue_number, pr_number }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // New request: create issue
  const issueRes = await ghFetch('/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''),
      body: `${prompt}${imageSection}\n\n@claude`,
      labels: ['admin-prompt'],
    }),
  });

  if (!issueRes.ok) {
    const err = await issueRes.text();
    return new Response(
      JSON.stringify({ error: `GitHub API error: ${err}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const issue = await issueRes.json();

  return new Response(
    JSON.stringify({
      issue_number: issue.number,
      issue_url: issue.html_url,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
