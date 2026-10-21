import { NextResponse } from 'next/server';
import { loggedApi, requireLocalMutation, tokenFor } from '@/lib/api';
import { fetchViewer } from '@/lib/github-client';
import { configuredToken, saveSessionToken, serverToken } from '@/lib/server-token';
import { readStore } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return loggedApi(request, async () => NextResponse.json({
    hasToken: Boolean(serverToken()),
    organization: process.env.GITHUB_ORGANIZATION || process.env.NEXT_PUBLIC_ORGANIZATION || '',
    users: process.env.GITHUB_USERS || process.env.NEXT_PUBLIC_USERS || '',
    groups: process.env.GITHUB_GROUPS || process.env.NEXT_PUBLIC_GROUPS || '',
  }));
}

export async function POST(request: Request) {
  return loggedApi(request, async () => {
    requireLocalMutation(request);
    if (!configuredToken()) {
      const token = tokenFor(request);
      const viewer = await fetchViewer(token);
      const store = await readStore();
      if (store.pullRequests.length && store.viewer.toLowerCase() !== viewer.toLowerCase()) {
        throw new Error(`This list belongs to ${store.viewer}. Use their token to update it.`);
      }
      saveSessionToken(token);
    }
    return NextResponse.json({ hasToken: Boolean(serverToken()), message: configuredToken()
      ? 'Automatic refresh uses the token configured on the server.'
      : 'Token saved for automatic refresh until the server restarts.' });
  });
}
