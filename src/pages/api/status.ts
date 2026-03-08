import type { APIRoute } from 'astro';
import { ghFetch } from '../../lib/github';

export const prerender = false;

function isClaudeBot(c: any): boolean {
  return c.performed_via_github_app?.slug === 'claude' || c.user?.login === 'claude[bot]';
}

function isFinished(comment: any): boolean {
  return comment.body.startsWith('**Claude finished');
}

function extractSummary(body: string): string {
  const parts = body.split('---');
  return parts.length > 1 ? parts.slice(1).join('---').trim() : body;
}

export const GET: APIRoute = async ({ url }) => {
  const issueNumber = url.searchParams.get('issue');
  const prNumber = url.searchParams.get('pr');
  const after = url.searchParams.get('after'); // ISO timestamp to find comments after

  if (!issueNumber && !prNumber) {
    return new Response(
      JSON.stringify({ error: 'Missing issue or pr query param' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Follow-up mode: poll PR for new Claude comment
  if (prNumber && after) {
    const commentsRes = await ghFetch(
      `/issues/${prNumber}/comments?since=${after}&per_page=50`
    );
    const comments = commentsRes.ok ? await commentsRes.json() : [];

    // Find Claude comments created or updated after the timestamp
    const claudeComments = comments.filter(
      (c: any) => isClaudeBot(c) && new Date(c.updated_at) > new Date(after)
    );

    const latestClaude = claudeComments[claudeComments.length - 1];

    if (!latestClaude || !isFinished(latestClaude)) {
      return new Response(
        JSON.stringify({ state: 'working' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for updated Vercel preview
    let previewUrl: string | null = null;
    const allComments = await ghFetch(`/issues/${prNumber}/comments`);
    const allPrComments = allComments.ok ? await allComments.json() : [];
    const vercelComment = [...allPrComments].reverse().find(
      (c: any) => c.user?.login === 'vercel[bot]'
    );
    if (vercelComment) {
      const match = vercelComment.body.match(/Preview\]\((https:\/\/[^)]+)\)/);
      if (match) previewUrl = match[1];
    }

    return new Response(
      JSON.stringify({
        state: 'done',
        claude_summary: extractSummary(latestClaude.body),
        preview_url: previewUrl,
        comment_created_at: latestClaude.created_at,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Initial mode: poll issue for Claude + PR + preview
  const issueRes = await ghFetch(`/issues/${issueNumber}`);
  if (!issueRes.ok) {
    return new Response(
      JSON.stringify({ error: 'Issue not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const issue = await issueRes.json();

  // Check issue comments for Claude's response
  const commentsRes = await ghFetch(`/issues/${issueNumber}/comments`);
  const comments = commentsRes.ok ? await commentsRes.json() : [];

  const claudeComment = comments.find((c: any) => isClaudeBot(c));

  const claudeFinished = claudeComment && isFinished(claudeComment);
  let claudeSummary: string | null = null;
  if (claudeFinished) {
    claudeSummary = extractSummary(claudeComment.body);
  }

  // Check for linked PR
  const prsRes = await ghFetch('/pulls?state=open&sort=created&direction=desc&per_page=10');
  const prs = prsRes.ok ? await prsRes.json() : [];

  const linkedPr = prs.find(
    (pr: any) =>
      pr.body?.includes(`#${issueNumber}`) ||
      pr.head?.ref?.includes(`issue-${issueNumber}`)
  );

  // Get Vercel preview URL from PR comments
  let previewUrl: string | null = null;
  if (linkedPr) {
    const prCommentsRes = await ghFetch(`/issues/${linkedPr.number}/comments`);
    const prComments = prCommentsRes.ok ? await prCommentsRes.json() : [];

    const vercelComment = [...prComments].reverse().find(
      (c: any) => c.user?.login === 'vercel[bot]'
    );

    if (vercelComment) {
      const match = vercelComment.body.match(/Preview\]\((https:\/\/[^)]+)\)/);
      if (match) previewUrl = match[1];
    }
  }

  let state: 'pending' | 'working' | 'done' = 'pending';
  if (claudeFinished && linkedPr) {
    state = 'done';
  } else if (claudeComment || linkedPr) {
    state = 'working';
  }

  return new Response(
    JSON.stringify({
      state,
      issue_url: issue.html_url,
      pr_url: linkedPr?.html_url ?? null,
      pr_number: linkedPr?.number ?? null,
      branch: linkedPr?.head?.ref ?? null,
      preview_url: previewUrl,
      claude_summary: claudeSummary,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
