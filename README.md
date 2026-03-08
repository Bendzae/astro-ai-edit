# astro-ai-edit

An Astro integration that adds an AI-powered admin UI to your site. Non-technical users can describe changes in plain language, which creates GitHub issues that trigger [Claude Code Action](https://github.com/anthropics/claude-code-action) to implement the changes, open PRs, and deploy previews — all from a simple chat interface.

## How it works

1. Admin describes a change in the UI (e.g. "Add a testimonials section to the homepage")
2. A GitHub issue is created with `@claude` mention
3. Claude Code Action picks it up, writes the code, and opens a PR
4. The admin sees a preview link and can send follow-up prompts
5. When satisfied, the admin merges to production from the UI

## Setup

### 1. Install

```bash
npm install astro-ai-edit
```

### 2. Add the integration

```js
// astro.config.mjs
import astroAiEdit from 'astro-ai-edit';

export default defineConfig({
  integrations: [astroAiEdit()],
  // Requires an SSR adapter (e.g. Vercel, Netlify, Node)
  adapter: vercel(), // or your adapter of choice
});
```

The integration injects all necessary routes and middleware automatically. No other config changes needed.

### 3. Environment variables

```env
# Auth (required)
ADMIN_USERNAME=your-username
ADMIN_PASSWORD=your-password
AUTH_SECRET=a-long-random-string     # Used for signing session cookies

# GitHub (required)
GITHUB_TOKEN=ghp_...                 # PAT with repo read/write scope

# GitHub repo (optional on Vercel — auto-detected from VERCEL_GIT_REPO_OWNER/SLUG)
GITHUB_REPO=owner/repo
```

### 4. Add the Claude Code GitHub Action

The easiest way to set this up is with the Claude CLI:

```bash
claude /install-github-app
```

This automatically installs the GitHub app, configures secrets, and sets up the workflow.

Alternatively, create `.github/workflows/claude.yml` manually. A complete template is included in the package at `src/templates/claude.yml` — copy it to your repo and configure the required secret.

The workflow supports two authentication methods:

**Option A: Claude Code OAuth (recommended)**

Add `CLAUDE_CODE_OAUTH_TOKEN` as a repository secret, then use:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

**Option B: Anthropic API key**

Add `ANTHROPIC_API_KEY` as a repository secret, then use:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The workflow must trigger on issues and comments (so `@claude` mentions are picked up), and needs `contents: write`, `pull-requests: write`, and `issues: write` permissions. The bundled template also includes a step that automatically creates a PR from Claude's branch when triggered from an issue.

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

## Requirements

- Astro 5+
- An SSR adapter (Vercel, Netlify, Node, etc.)
- GitHub repository with a PAT that has repo scope
- Claude Code GitHub Action (for automated code changes)

## License

MIT
