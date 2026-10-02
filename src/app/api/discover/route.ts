import { NextResponse } from 'next/server';
import { loggedApi, requireLocalMutation, tokenFor } from '@/lib/api';
import { fetchViewer } from '@/lib/github-client';
import { getPullRequestsWithMatch } from '@/services/github';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return loggedApi(request, async (log) => {
    log.action('discover');
    requireLocalMutation(request);
    const body = await request.json();
    if (typeof body.organization !== 'string' || !body.organization.trim()) throw new Error('Enter an organization.');
    if (typeof body.users !== 'string' || typeof body.groups !== 'string') throw new Error('Enter valid usernames and team slugs.');
    const users = body.users.split(',').map((s: string) => s.trim()).filter(Boolean);
    const groups = body.groups.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (!users.length && !groups.length) throw new Error('Enter at least one username or team slug.');
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) throw new Error('Choose a valid start date.');
    const pat = tokenFor(request);
    const viewer = await fetchViewer(pat);
    const result = await getPullRequestsWithMatch(body.organization, users, groups, pat, date, viewer);
    if (result.teamSearchWarning) log.error('github.discovery.partial_failure', new Error(result.teamSearchWarning));
    return NextResponse.json(result);
  });
}
