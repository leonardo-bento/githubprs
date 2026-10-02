import { NextResponse } from 'next/server';
import { loggedApi } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return loggedApi(request, async () => NextResponse.json({
    hasToken: Boolean(process.env.GITHUB_PAT || process.env.NEXT_PUBLIC_PAT),
    organization: process.env.GITHUB_ORGANIZATION || process.env.NEXT_PUBLIC_ORGANIZATION || '',
    users: process.env.GITHUB_USERS || process.env.NEXT_PUBLIC_USERS || '',
    groups: process.env.GITHUB_GROUPS || process.env.NEXT_PUBLIC_GROUPS || '',
  }));
}
