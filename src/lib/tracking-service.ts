import type { TrackingStore } from './store';
import { acknowledge, applySnapshot, extractPRs, toCard } from './tracking';
import type { PRReference, PRSnapshot } from './tracking';
import { writeLog } from './request-log';

export interface TrackingAction { action: string; text?: string; key?: string; revision?: number }
export interface GitHubReader {
  viewer: () => Promise<string>;
  snapshot: (reference: PRReference) => Promise<PRSnapshot>;
}

export async function runTrackingAction(store: TrackingStore, body: TrackingAction, github: GitHubReader,
  onError: (error: unknown, reference: PRReference) => void = (error, reference) => writeLog('error', 'github.pr.failed', { key: reference.key }, error)) {
  if (!['add', 'refresh', 'seen', 'remove'].includes(body.action)) throw new Error('Unknown action.');
  let message = '';
  if (body.action === 'seen' || body.action === 'remove') {
    const index = store.pullRequests.findIndex((pr) => pr.key === body.key);
    if (index === -1) throw new Error('This PR is no longer tracked. Reload the list.');
    if (body.action === 'remove') store.pullRequests.splice(index, 1);
    else store.pullRequests[index] = acknowledge(store.pullRequests[index], body.revision ?? -1);
  } else {
    const viewer = await github.viewer();
    if (store.viewer && store.viewer.toLowerCase() !== viewer.toLowerCase() && store.pullRequests.length) {
      throw new Error(`This list belongs to ${store.viewer}. Use their token to update it.`);
    }
    store.viewer = viewer;
    if (body.action === 'add') {
      const references = extractPRs(typeof body.text === 'string' ? body.text : '');
      if (!references.length) throw new Error('No GitHub PR links found. Paste text containing https://github.com/owner/repo/pull/123.');
      let added = 0;
      let duplicates = 0;
      const failures: string[] = [];
      for (const reference of references) {
        if (store.pullRequests.some((pr) => pr.key === reference.key)) { duplicates++; continue; }
        try {
          const snapshot = await github.snapshot(reference);
          // A re-added PR must not share an acknowledgment revision with a removed copy.
          store.pullRequests.push({ ...reference, snapshot, addedAt: new Date().toISOString(), revision: Date.now(), seenRevision: 0 });
          added++;
        } catch (error) { onError(error, reference); failures.push(`${reference.owner}/${reference.repo}#${reference.number}: ${error instanceof Error ? error.message : 'Could not add PR.'}`); }
      }
      message = `${added} PR${added === 1 ? '' : 's'} added.${duplicates ? ` ${duplicates} already tracked.` : ''}${failures.length ? ` Could not add: ${failures.join(' ')}` : ''}`;
    } else {
      let failed = 0;
      for (let index = 0; index < store.pullRequests.length; index++) {
        const pr = store.pullRequests[index];
        try { store.pullRequests[index] = applySnapshot(pr, await github.snapshot(pr), viewer); }
        catch (error) {
          onError(error, pr);
          store.pullRequests[index] = { ...pr, error: error instanceof Error ? error.message : 'Could not refresh PR.' };
          failed++;
        }
      }
      message = failed ? `${failed} PR${failed === 1 ? '' : 's'} could not be refreshed. Saved activity was preserved.` : 'List refreshed.';
    }
  }
  return { viewer: store.viewer, pullRequests: store.pullRequests.map(toCard), message };
}
