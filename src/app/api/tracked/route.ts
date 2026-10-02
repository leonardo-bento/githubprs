import { NextResponse } from 'next/server';
import { loggedApi, requireLocalMutation, tokenFor } from '@/lib/api';
import { fetchSnapshot, fetchViewer } from '@/lib/github-client';
import { mutateStore, readStore } from '@/lib/store';
import { toCard } from '@/lib/tracking';
import { runTrackingAction } from '@/lib/tracking-service';
import type { TrackingAction } from '@/lib/tracking-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return loggedApi(request, async () => {
    const store = await readStore();
    return NextResponse.json({ viewer: store.viewer, pullRequests: store.pullRequests.map(toCard) });
  });
}

export async function POST(request: Request) {
  return loggedApi(request, async (log) => {
    requireLocalMutation(request);
    const body = await request.json() as TrackingAction;
    if (body && typeof body.action === 'string') {
      log.action(body.action, typeof body.key === 'string' ? body.key : undefined,
        typeof body.revision === 'number' ? body.revision : undefined);
    }
    const result = await mutateStore((store) => runTrackingAction(store, body, {
      viewer: () => fetchViewer(tokenFor(request)),
      snapshot: (reference) => fetchSnapshot(reference, tokenFor(request)),
    }, (error, reference) => log.error('github.pr.failed', error, { key: reference.key })));
    return NextResponse.json(result);
  });
}
