const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { AUTO_REFRESH_INTERVAL_MS, scheduleRefresh, refreshTracked, startAutoRefresh } = require(path.join(process.env.TEST_BUILD_DIR, 'auto-refresh.js'));
const { serverToken, saveSessionToken } = require(path.join(process.env.TEST_BUILD_DIR, 'server-token.js'));
const { tokenFor } = require(path.join(process.env.TEST_BUILD_DIR, 'api.js'));
const { readStore, mutateStore, storePath } = require(path.join(process.env.TEST_BUILD_DIR, 'store.js'));
const { runTrackingAction } = require(path.join(process.env.TEST_BUILD_DIR, 'tracking-service.js'));
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('scheduler waits ten minutes, skips overlapping ticks and recovers after errors', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  let release;
  const timer = scheduleRefresh(async () => {
    calls++;
    if (calls === 1) await new Promise((resolve) => { release = resolve; });
    if (calls === 2) throw new Error('GitHub unavailable');
  });
  t.after(() => clearInterval(timer));
  t.mock.timers.tick(AUTO_REFRESH_INTERVAL_MS - 1);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
  t.mock.timers.tick(AUTO_REFRESH_INTERVAL_MS);
  assert.equal(calls, 1);
  release(); await flush();
  t.mock.timers.tick(AUTO_REFRESH_INTERVAL_MS); await flush();
  assert.equal(calls, 2);
  assert.equal(console.error.mock.callCount(), 1);
  t.mock.timers.tick(AUTO_REFRESH_INTERVAL_MS); await flush();
  assert.equal(calls, 3);
});

test('startup registers only one timer across module reloads', () => {
  startAutoRefresh();
  const timer = globalThis.autoRefreshTimer;
  startAutoRefresh();
  assert.equal(globalThis.autoRefreshTimer, timer);
  clearInterval(timer);
  delete globalThis.autoRefreshTimer;
});

test('backend refresh uses a session token without a browser and never persists the credential', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'githubprs-auto-refresh-'));
  for (const key of ['GITHUB_PAT', 'NEXT_PUBLIC_PAT', 'PR_DATA_DIR']) {
    const original = process.env[key];
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
    delete process.env[key];
  }
  t.after(async () => { saveSessionToken(''); await rm(directory, { recursive: true, force: true }); });
  process.env.PR_DATA_DIR = directory;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests++;
    assert.equal(init.headers.Authorization, 'Bearer session-secret');
    const connection = { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    const query = JSON.parse(init.body).query;
    const data = query.includes('repository(owner:') ? { viewer: { login: 'me' }, repository: { pullRequest: {
      id: 'pr', title: 'Updated', author: { login: 'other' }, state: 'OPEN', isDraft: false, headRefOid: 'new',
      viewerLatestReviewRequest: null, comments: connection, reviews: connection, reviewThreads: connection,
    } } } : { viewer: { login: 'me' } };
    return Response.json({ data });
  });
  await mutateStore((store) => runTrackingAction(store, { action: 'add', text: 'https://github.com/org/repo/pull/1' }, {
    viewer: async () => 'me', snapshot: async () => ({ title: 'Old', author: 'other', status: 'Open', headSha: 'old', comments: [], threads: [], retrievedAt: '2026-10-01T12:00:00Z' }),
  }));
  await refreshTracked();
  assert.equal(requests, 0);
  saveSessionToken('session-secret');
  assert.equal(tokenFor(new Request('http://localhost')), 'session-secret');
  await refreshTracked();
  assert.equal(requests, 2);
  const saved = await readStore();
  assert.equal(saved.pullRequests[0].snapshot.headSha, 'new');
  assert.ok(saved.activityRevision > 0);
  const revision = saved.activityRevision;
  await refreshTracked();
  assert.equal((await readStore()).activityRevision, revision);
  assert.equal((await readFile(storePath(), 'utf8')).includes('session-secret'), false);
  process.env.GITHUB_PAT = 'configured-secret';
  saveSessionToken('replacement-secret');
  assert.equal(serverToken(), 'configured-secret');
});
