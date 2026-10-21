import { fetchSnapshot, fetchViewer } from './github-client';
import { writeLog } from './request-log';
import { serverToken } from './server-token';
import { mutateStore } from './store';
import { runTrackingAction } from './tracking-service';

export const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export async function refreshTracked() {
  const token = serverToken();
  if (!token) return;
  await mutateStore(async (store) => {
    if (!store.pullRequests.length) return;
    await runTrackingAction(store, { action: 'refresh' }, {
      viewer: () => fetchViewer(token),
      snapshot: (reference) => fetchSnapshot(reference, token),
    });
  });
}

export function scheduleRefresh(refresh: () => Promise<void>, intervalMs = AUTO_REFRESH_INTERVAL_MS) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void refresh().catch((error) => writeLog('error', 'auto-refresh.failed', {}, error))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  return timer;
}

export function startAutoRefresh() {
  const state = globalThis as typeof globalThis & { autoRefreshTimer?: ReturnType<typeof setInterval> };
  state.autoRefreshTimer ??= scheduleRefresh(refreshTracked);
}
