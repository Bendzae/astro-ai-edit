function resolveRepo(): string {
  const raw =
    import.meta.env.GITHUB_REPO ||
    `${import.meta.env.VERCEL_GIT_REPO_OWNER}/${import.meta.env.VERCEL_GIT_REPO_SLUG}`;

  // Handle full URLs like "https://github.com/owner/repo"
  try {
    const url = new URL(raw);
    return url.pathname.replace(/^\//, '').replace(/\.git$/, '');
  } catch {
    return raw;
  }
}

export const GITHUB_TOKEN = import.meta.env.GITHUB_TOKEN;
export const GITHUB_REPO = resolveRepo();

export async function ghFetch(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      ...init?.headers,
    },
  });
}
