import type { APIRoute } from 'astro';
import { ghFetch } from '../../lib/github';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { issue_number } = await request.json();

  if (!issue_number) {
    return new Response(
      JSON.stringify({ error: 'issue_number is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch issue body to find uploaded images
  const issueGetRes = await ghFetch(`/issues/${issue_number}`);
  const issueData = issueGetRes.ok ? await issueGetRes.json() : null;

  // Close the issue
  const issueRes = await ghFetch(`/issues/${issue_number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'closed' }),
  });

  if (!issueRes.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to close issue' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Clean up uploaded images from the repo
  if (issueData?.body) {
    const uploadPaths = [...issueData.body.matchAll(/`(public\/uploads\/[^`]+)`/g)].map((m: RegExpMatchArray) => m[1]);

    // Also check PR comments for follow-up images
    const prsRes2 = await ghFetch('/pulls?state=all&per_page=100');
    if (prsRes2.ok) {
      const allPrs = await prsRes2.json();
      const linkedPr = allPrs.find(
        (pr: any) =>
          pr.body?.includes(`#${issue_number}`) ||
          pr.head?.ref?.includes(`issue-${issue_number}`)
      );
      if (linkedPr) {
        const prCommentsRes = await ghFetch(`/issues/${linkedPr.number}/comments`);
        if (prCommentsRes.ok) {
          const prComments = await prCommentsRes.json();
          for (const c of prComments) {
            const matches = [...(c.body || '').matchAll(/`(public\/uploads\/[^`]+)`/g)];
            for (const m of matches) uploadPaths.push(m[1]);
          }
        }
      }
    }

    for (const filePath of uploadPaths) {
      // Get file SHA (required for deletion)
      const fileRes = await ghFetch(`/contents/${filePath}`);
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        await ghFetch(`/contents/${filePath}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Clean up ${filePath.split('/').pop()}`,
            sha: fileData.sha,
          }),
        });
      }
    }
  }

  // Find and close any linked PRs without merging
  const prsRes = await ghFetch('/pulls?state=open&per_page=100');
  if (prsRes.ok) {
    const prs = await prsRes.json();
    const linkedPrs = prs.filter(
      (pr: any) =>
        pr.body?.includes(`#${issue_number}`) ||
        pr.head?.ref?.includes(`issue-${issue_number}`)
    );

    for (const pr of linkedPrs) {
      await ghFetch(`/pulls/${pr.number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
