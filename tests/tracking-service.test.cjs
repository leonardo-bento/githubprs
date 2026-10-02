const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTrackingAction } = require(path.join(process.env.TEST_BUILD_DIR, 'tracking-service.js'));
const { mutateStore, readStore } = require(path.join(process.env.TEST_BUILD_DIR, 'store.js'));
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const state = () => ({ version: 1, viewer: '', pullRequests: [] });
const snapshot = (author = 'me', overrides = {}) => ({ title: 'PR', author, status: 'Open', headSha: 'sha', comments: [], threads: [], retrievedAt: '2026-10-01T12:00:00Z', ...overrides });
const github = { viewer: async () => 'me', snapshot: async (ref) => snapshot(ref.number === 1 ? 'me' : 'teammate') };
const links = 'Slack message: <https://github.com/org/repo/pull/1|my PR> https://github.com/org/repo/pull/2';

test('add, deduplicate, mark seen, refresh and remove complete lifecycle', async () => {
  const store = state();
  let result = await runTrackingAction(store, { action: 'add', text: links }, github);
  assert.equal(result.pullRequests.length, 2);
  assert.ok(result.pullRequests.every((pr) => pr.unseen));
  assert.deepEqual(result.pullRequests.map((pr) => pr.author), ['me', 'teammate']);
  result = await runTrackingAction(store, { action: 'add', text: links }, github);
  assert.equal(result.pullRequests.length, 2);
  assert.match(result.message, /2 already tracked/);
  await runTrackingAction(store, { action: 'seen', key: store.pullRequests[1].key, revision: store.pullRequests[1].revision }, github);
  result = await runTrackingAction(store, { action: 'refresh' }, { ...github, snapshot: async (ref) => snapshot(ref.number === 1 ? 'me' : 'teammate', { headSha: 'new', retrievedAt: '2026-10-01T13:00:00Z' }) });
  assert.equal(result.pullRequests[1].unseen, true);
  result = await runTrackingAction(store, { action: 'remove', key: store.pullRequests[0].key }, github);
  assert.equal(result.pullRequests.length, 1);
  assert.equal(result.pullRequests[0].number, 2);
});
test('partial add succeeds and reports inaccessible links', async () => {
  const store = state();
  const result = await runTrackingAction(store, { action: 'add', text: links }, { ...github, snapshot: async (ref) => {
    if (ref.number === 2) throw new Error('No access'); return snapshot();
  } });
  assert.equal(result.pullRequests.length, 1);
  assert.match(result.message, /Could not add: org\/repo#2: No access/);
});
test('failed refresh preserves snapshot, retrieval time and seen state; recovery clears error', async () => {
  const store = state();
  await runTrackingAction(store, { action: 'add', text: links }, github);
  await runTrackingAction(store, { action: 'seen', key: store.pullRequests[0].key, revision: store.pullRequests[0].revision }, github);
  const before = JSON.parse(JSON.stringify(store.pullRequests));
  const result = await runTrackingAction(store, { action: 'refresh' }, { ...github, snapshot: async () => { throw new Error('Rate limited'); } });
  assert.equal(result.pullRequests[0].unseen, false);
  assert.equal(result.pullRequests[1].unseen, true);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(store.pullRequests[i].snapshot, before[i].snapshot);
    assert.equal(store.pullRequests[i].revision, before[i].revision);
    assert.equal(store.pullRequests[i].seenRevision, before[i].seenRevision);
    assert.equal(result.pullRequests[i].error, 'Rate limited');
  }
  await runTrackingAction(store, { action: 'refresh' }, github);
  assert.equal(store.pullRequests[0].error, undefined);
});
test('rejects identity switches without changing the existing list', async () => {
  const store = state();
  await runTrackingAction(store, { action: 'add', text: links }, github);
  await assert.rejects(runTrackingAction(store, { action: 'refresh' }, { ...github, viewer: async () => 'other-user' }), /belongs to me/);
  assert.equal(store.viewer, 'me');
});
test('seen and remove work offline without contacting GitHub', async () => {
  const store = state();
  await runTrackingAction(store, { action: 'add', text: links }, github);
  const offline = { viewer: async () => { throw new Error('Offline'); }, snapshot: async () => { throw new Error('Offline'); } };
  await runTrackingAction(store, { action: 'seen', key: store.pullRequests[0].key, revision: store.pullRequests[0].revision }, offline);
  await runTrackingAction(store, { action: 'remove', key: store.pullRequests[0].key }, offline);
  assert.equal(store.pullRequests.length, 1);
});
test('invalid actions, missing links and missing cards are rejected', async () => {
  await assert.rejects(runTrackingAction(state(), { action: 'wat' }, github), /Unknown action/);
  await assert.rejects(runTrackingAction(state(), { action: 'add', text: 'no links' }, github), /No GitHub PR links/);
  await assert.rejects(runTrackingAction(state(), { action: 'seen', key: 'missing' }, github), /no longer tracked/);
});
test('persisted actions survive a reload and stale acknowledgment during refresh leaves new activity unseen', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'githubprs-actions-'));
  process.env.PR_DATA_DIR = directory;
  try {
    const added = await mutateStore((store) => runTrackingAction(store, { action: 'add', text: links }, github));
    const old = added.pullRequests[1];
    const refreshed = mutateStore((store) => runTrackingAction(store, { action: 'refresh' }, { ...github, snapshot: async (ref) => snapshot('teammate', { headSha: 'new' }) }));
    const marked = mutateStore((store) => runTrackingAction(store, { action: 'seen', key: old.key, revision: old.revision }, github));
    await refreshed;
    assert.equal((await marked).pullRequests[1].unseen, true);
    const persisted = await readStore();
    assert.equal(persisted.pullRequests[1].revision > persisted.pullRequests[1].seenRevision, true);
    assert.equal(persisted.pullRequests[1].snapshot.headSha, 'new');
  } finally { delete process.env.PR_DATA_DIR; await rm(directory, { recursive: true, force: true }); }
});

test('partial GitHub failures are logged for both add and refresh even when the response succeeds', async () => {
  const store = state();
  const failures = [];
  const onError = (error, reference) => failures.push({ message: error.message, key: reference.key });
  await runTrackingAction(store, { action: 'add', text: links }, { ...github, snapshot: async (ref) => {
    if (ref.number === 2) throw new Error('No access'); return snapshot();
  } }, onError);
  assert.deepEqual(failures, [{ message: 'No access', key: 'org/repo/2' }]);
  await runTrackingAction(store, { action: 'refresh' }, { ...github, snapshot: async () => { throw new Error('Rate limited'); } }, onError);
  assert.deepEqual(failures[1], { message: 'Rate limited', key: 'org/repo/1' });
});
