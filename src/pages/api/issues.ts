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

function extractImages(body: string): string[] {
  const matches = [...body.matchAll(/!\[[^\]]*\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+\/public\/uploads\/[^)]+)\)/g)];
  return matches.map(m => m[1]);
}

function stripImageSection(text: string): string {
  return text.replace(/\n*### Attached images\n[\s\S]*$/, '').trim();
}

export interface FollowUp {
  prompt: string;
  claude_summary: string | null;
  state: 'pending' | 'working' | 'done';
  created_at: string;
  images?: string[];
}

export const GET: APIRoute = async () => {
  const issuesRes = await ghFetch('/issues?labels=admin-prompt&state=all&sort=created&direction=desc&per_page=50');
  if (!issuesRes.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch issues' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const issues = await issuesRes.json();

  const prsRes = await ghFetch('/pulls?state=all&sort=created&direction=desc&per_page=50');
  const prs = prsRes.ok ? await prsRes.json() : [];

  const results = await Promise.all(
    issues.map(async (issue: any) => {
      const issueNumber = issue.number;

      const linkedPr = prs.find(
        (pr: any) =>
          pr.body?.includes(`#${issueNumber}`) ||
          pr.head?.ref?.includes(`issue-${issueNumber}`)
      );

      // Get Claude's comment on the issue
      const commentsRes = await ghFetch(`/issues/${issueNumber}/comments`);
      const comments = commentsRes.ok ? await commentsRes.json() : [];

      const claudeComment = comments.find((c: any) => isClaudeBot(c));
      const claudeFinished = claudeComment && isFinished(claudeComment);

      let claudeSummary: string | null = null;
      if (claudeFinished) {
        claudeSummary = extractSummary(claudeComment.body);
      }

      // Get preview URL and follow-up exchanges from PR comments
      let previewUrl: string | null = null;
      const followups: FollowUp[] = [];

      if (linkedPr) {
        const prCommentsRes = await ghFetch(`/issues/${linkedPr.number}/comments`);
        const prComments = prCommentsRes.ok ? await prCommentsRes.json() : [];

        // Get latest Vercel preview URL
        const vercelComment = [...prComments].reverse().find(
          (c: any) => c.user?.login === 'vercel[bot]'
        );
        if (vercelComment) {
          const match = vercelComment.body.match(/Preview\]\((https:\/\/[^)]+)\)/);
          if (match) previewUrl = match[1];
        }

        // Build follow-up exchanges from PR comments
        // User comments containing @claude are follow-up prompts
        // Claude[bot] comments are responses
        const userFollowups = prComments.filter(
          (c: any) => !isClaudeBot(c) && c.user?.login !== 'vercel[bot]' && c.body?.includes('@claude')
        );

        for (const userComment of userFollowups) {
          const rawFollowupPrompt = userComment.body.replace(/@claude\s*/g, '').trim();
          const prompt = stripImageSection(rawFollowupPrompt);
          const followupImages = extractImages(userComment.body);
          const userCommentTime = new Date(userComment.created_at);

          // Find the next Claude response after this comment
          const claudeResponse = prComments.find(
            (c: any) => isClaudeBot(c) && new Date(c.created_at) > userCommentTime
          );

          let followupSummary: string | null = null;
          let followupState: 'pending' | 'working' | 'done' = 'pending';

          if (claudeResponse) {
            if (isFinished(claudeResponse)) {
              followupSummary = extractSummary(claudeResponse.body);
              followupState = 'done';
            } else {
              followupState = 'working';
            }
          }

          followups.push({
            prompt,
            claude_summary: followupSummary,
            state: followupState,
            created_at: userComment.created_at,
            images: followupImages.length ? followupImages : undefined,
          });
        }
      }

      let state: 'pending' | 'working' | 'done' = 'pending';
      if (claudeFinished && linkedPr) {
        state = 'done';
      } else if (claudeComment || linkedPr) {
        state = 'working';
      }

      const rawPrompt = issue.body?.replace(/@claude\s*$/, '').trim() ?? issue.title;
      const prompt = stripImageSection(rawPrompt);
      const promptImages = issue.body ? extractImages(issue.body) : [];

      return {
        issue_number: issueNumber,
        issue_url: issue.html_url,
        prompt,
        images: promptImages.length ? promptImages : undefined,
        state,
        pr_url: linkedPr?.html_url ?? null,
        pr_number: linkedPr?.number ?? null,
        branch: linkedPr?.head?.ref ?? null,
        preview_url: previewUrl,
        claude_summary: claudeSummary,
        followups,
        created_at: issue.created_at,
        archived: issue.state === 'closed' && !linkedPr?.merged_at,
        merged: !!linkedPr?.merged_at,
      };
    })
  );

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
