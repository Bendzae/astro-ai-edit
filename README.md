# astro-ai-edit

An Astro integration that adds an AI-powered admin UI to your site. Non-technical users can describe changes in plain language, which creates GitHub issues that trigger [Claude Code Action](https://github.com/anthropics/claude-code-action) to implement the changes, open PRs, and deploy previews — all from a simple chat interface.

## How it works

1. Admin describes a change in the UI (e.g. "Add a testimonials section to the homepage")
2. A GitHub issue is created with `@claude` mention
3. Claude Code Action picks it up, writes the code, and opens a PR
4. Vercel deploys a preview — the admin sees the link in the UI
5. The admin can send follow-up prompts to iterate
6. When satisfied, the admin merges to production from the UI

## Prerequisites

- **Astro 5+** project with an SSR adapter
- **Vercel** project connected to your GitHub repo (for preview deployments and serverless routes)
- **GitHub PAT** with `repo` scope (read/write access)
- **Claude Code Action** configured on the repo (see step 4 below)

## Setup

### 1. Install

```bash
npm install astro-ai-edit
```

### 2. Astro config

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import astroAiEdit from 'astro-ai-edit';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [astroAiEdit()],
});
```

**Important config notes:**
- An **SSR adapter** is required — the admin routes run as serverless functions
- `output: 'static'` works fine — the integration marks its own routes as `prerender = false` so they run server-side while the rest of your site stays static
- No additional route or middleware config is needed — the integration injects everything automatically

### 3. Environment variables

Set these in your **Vercel project settings** (Settings → Environment Variables):

```env
# Auth (required)
ADMIN_USERNAME=your-username
ADMIN_PASSWORD=your-password
AUTH_SECRET=a-long-random-string       # HMAC secret for signing session cookies

# GitHub (required)
GITHUB_TOKEN=ghp_...                   # PAT with repo read/write scope

# GitHub repo (optional on Vercel — auto-detected from VERCEL_GIT_REPO_OWNER/SLUG)
GITHUB_REPO=owner/repo
```

For local development, pull the env vars from Vercel and use `vercel dev`:

```bash
vercel pull                            # Downloads env vars to .vercel/.env
vercel dev                             # Runs dev server with env vars
```

### 4. Add the Claude Code GitHub Action

First, install the Claude GitHub app on your repo:

```bash
claude /install-github-app
```

Then add the workflow file. The default workflow installed by the CLI won't include the PR auto-creation step that `astro-ai-edit` needs, so create `.github/workflows/claude.yml` with the following (a template is also included in the package at `src/templates/claude.yml`):

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@v1
        with:
          # Use ONE of these auth methods:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Create PR from Claude's branch
        if: steps.claude.outputs.branch_name != '' && github.event_name == 'issues'
        uses: actions/github-script@v7
        with:
          script: |
            const branch = '${{ steps.claude.outputs.branch_name }}';
            const issueNumber = ${{ github.event.issue.number }};

            // Check if PR already exists
            const { data: prs } = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo: context.repo.repo,
              head: `${context.repo.owner}:${branch}`,
              state: 'open'
            });
            if (prs.length > 0) {
              console.log(`PR #${prs[0].number} already exists`);
              return;
            }

            // Get issue title
            const { data: issue } = await github.rest.issues.get({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issueNumber
            });

            // Create PR
            const { data: pr } = await github.rest.pulls.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              head: branch,
              base: 'main',
              title: issue.title,
              body: `Closes #${issueNumber}`
            });
            console.log(`Created PR #${pr.number}: ${pr.html_url}`);
```

The **"Create PR" step is important** — when Claude works on an issue, it creates a branch but not a PR. This step automatically opens a PR linking back to the issue, which is how the admin UI tracks progress and shows preview URLs.

Add `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` as a repository secret (Settings → Secrets and variables → Actions).

See the [Claude Code Action docs](https://github.com/anthropics/claude-code-action) for full configuration options.

## Features

- **Chat-style UI** — describe changes in plain language, see Claude's progress and responses
- **Follow-up prompts** — iterate on changes by sending additional instructions on the same PR
- **Image attachments** — upload images that get committed to the repo and referenced in prompts
- **Preview links** — automatic Vercel preview URL detection from PR comments
- **Merge to production** — one-click merge from the admin UI
- **Archive threads** — close issues/PRs and clean up uploaded images
- **Auth** — simple username/password login with HMAC-signed session cookies

## Injected routes

| Route | Description |
|---|---|
| `/admin` | Main dashboard (protected) |
| `/admin/login` | Login page |
| `/api/auth` | Session create/destroy |
| `/api/prompt` | Create issues or post follow-up comments |
| `/api/issues` | List all admin-created threads with status |
| `/api/status` | Poll issue/PR progress |
| `/api/upload` | Upload images to the repo |
| `/api/archive` | Close issue + PRs, clean up images |
| `/api/merge` | Squash-merge PR to main |

All `/admin` and `/api` routes (except login and auth) are protected by middleware that validates the session cookie.

## License

MIT
