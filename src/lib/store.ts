import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TrackedPR } from './tracking';

export interface TrackingStore {
  version: 1;
  viewer: string;
  pullRequests: TrackedPR[];
}

// Share the mutation queue across route modules and development reloads.
const globalStore = globalThis as typeof globalThis & { trackingQueue?: Promise<unknown> };
export const storePath = () => path.join(process.env.PR_DATA_DIR || path.join(process.cwd(), 'data'), 'tracked-prs.json');

export async function readStore(): Promise<TrackingStore> {
  try {
    const store = JSON.parse(await readFile(storePath(), 'utf8')) as TrackingStore;
    if (store.version !== 1 || typeof store.viewer !== 'string' || !Array.isArray(store.pullRequests)) {
      throw new Error('Unsupported tracking file. Restore a valid data/tracked-prs.json file.');
    }
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, viewer: '', pullRequests: [] };
    throw error;
  }
}

export function mutateStore<T>(operation: (store: TrackingStore) => Promise<T> | T): Promise<T> {
  const task = (globalStore.trackingQueue ?? Promise.resolve()).then(async () => {
    const store = await readStore();
    const result = await operation(store);
    const filename = storePath();
    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, filename);
    return result;
  });
  globalStore.trackingQueue = task.catch(() => undefined);
  return task;
}
