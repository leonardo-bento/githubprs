// Shared by route bundles and the startup scheduler; never persisted to disk.
const state = globalThis as typeof globalThis & { githubSessionToken?: string };

export function configuredToken(): string {
  return process.env.GITHUB_PAT || process.env.NEXT_PUBLIC_PAT || '';
}

export function serverToken(): string {
  return configuredToken() || state.githubSessionToken || '';
}

export function saveSessionToken(token: string) {
  if (!configuredToken()) state.githubSessionToken = token;
}
