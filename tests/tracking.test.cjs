const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { extractPRs, hasRelevantChanges, applySnapshot, acknowledge, toCard } = require(path.join(process.env.TEST_BUILD_DIR, 'tracking.js'));

const comment = (id, author = 'teammate', createdAt = '2026-10-01T10:00:00Z') => ({ id, author, createdAt });
const snapshot = (overrides = {}) => ({ title: 'Feature', author: 'teammate', status: 'Open', headSha: 'abc',
  comments: [], threads: [], retrievedAt: '2026-10-01T12:00:00Z', ...overrides });
const reference = extractPRs('https://github.com/org/repo/pull/123')[0];
const pr = (overrides = {}) => ({ ...reference, snapshot: snapshot(), revision: 1, seenRevision: 0,
  addedAt: '2026-10-01T12:00:00Z', ...overrides });

test('extracts Slack and Markdown links, trailing punctuation, files tabs, duplicates and mixed case', () => {
  const result = extractPRs('Ready: <https://github.com/Org/Repo/pull/123|feature>\n[PR](https://github.com/org/repo/pull/123/files). Also https://github.com/org/other/pull/45?foo=1 and https://github.com/org/other/pull/46#discussion.');
  assert.deepEqual(result.map((pr) => pr.key), ['org/repo/123', 'org/other/45', 'org/other/46']);
  assert.equal(result[0].url, 'https://github.com/org/repo/pull/123');
});
test('rejects non-GitHub URLs, issue links, malformed numbers and unsafe numbers', () => {
  assert.deepEqual(extractPRs('https://evilgithub.com/org/repo/pull/1 https://github.com/org/repo/issues/1 https://github.com/org/repo/pull/12abc https://github.com/org/repo/pull/99999999999999999999'), []);
});
test('newly added PRs start unseen; acknowledge persists the displayed revision', () => {
  assert.equal(toCard(pr()).unseen, true);
  assert.equal(toCard(acknowledge(pr(), 1)).unseen, false);
});
test('My PRs detect new comments from others but ignore own comments and commits', () => {
  const before = snapshot({ author: 'ME' });
  assert.equal(hasRelevantChanges(before, snapshot({ author: 'ME', comments: [comment('1')] }), 'me'), true);
  assert.equal(hasRelevantChanges(before, snapshot({ author: 'ME', comments: [comment('1', 'Me')], headSha: 'def' }), 'me'), false);
});
test('new inline comments on My PRs are relevant, unrelated threads on Others PRs are not', () => {
  const thread = { id: 't', resolved: false, resolvedBy: '', comments: [comment('1')] };
  assert.equal(hasRelevantChanges(snapshot({ author: 'me' }), snapshot({ author: 'me', threads: [thread] }), 'me'), true);
  assert.equal(hasRelevantChanges(snapshot(), snapshot({ threads: [thread] }), 'me'), false);
});
test('Others PRs detect new commits and general comments', () => {
  assert.equal(hasRelevantChanges(snapshot(), snapshot({ headSha: 'def' }), 'me'), true);
  assert.equal(hasRelevantChanges(snapshot(), snapshot({ comments: [comment('1')] }), 'me'), true);
});
test('replies after the viewer joins a thread and its resolution are relevant', () => {
  const thread = { id: 't', resolved: false, resolvedBy: '', comments: [comment('question', 'me')] };
  const before = snapshot({ threads: [thread] });
  assert.equal(hasRelevantChanges(before, snapshot({ threads: [{ ...thread, comments: [...thread.comments, comment('answer', 'teammate', '2026-10-01T11:00:00Z')] }] }), 'me'), true);
  assert.equal(hasRelevantChanges(before, snapshot({ threads: [{ ...thread, resolved: true, resolvedBy: 'teammate' }] }), 'me'), true);
  assert.equal(hasRelevantChanges(before, snapshot({ threads: [{ ...thread, resolved: true, resolvedBy: 'Me' }] }), 'me'), false);
});
test('own replies and older comments preceding the viewer question do not create activity', () => {
  const thread = { id: 't', resolved: false, resolvedBy: '', comments: [comment('question', 'me', '2026-10-01T11:00:00Z')] };
  const before = snapshot({ threads: [thread] });
  assert.equal(hasRelevantChanges(before, snapshot({ threads: [{ ...thread, comments: [comment('old', 'teammate'), ...thread.comments, comment('own', 'me', '2026-10-01T12:00:00Z')] }] }), 'me'), false);
});
test('only agreed forward status transitions create activity', () => {
  for (const [from, to, expected] of [['Draft','Open',true], ['Open','Draft',false], ['Closed','Open',false],
    ['Draft','Closed',true], ['Open','Closed',true], ['Open','Merged',true], ['Closed','Merged',true], ['Open','Open',false]]) {
    assert.equal(hasRelevantChanges(snapshot({ status: from }), snapshot({ status: to }), 'me'), expected, `${from} -> ${to}`);
  }
});
test('irrelevant refresh updates last retrieval but keeps acknowledgment; relevant refresh makes it unseen', () => {
  const seen = acknowledge(pr(), 1);
  const refreshed = applySnapshot(seen, snapshot({ retrievedAt: '2026-10-01T13:00:00Z' }), 'me');
  assert.equal(toCard(refreshed).unseen, false);
  assert.equal(refreshed.snapshot.retrievedAt, '2026-10-01T13:00:00Z');
  assert.equal(toCard(applySnapshot(refreshed, snapshot({ headSha: 'new' }), 'me')).unseen, true);
});
test('a stale acknowledgment cannot clear more recent events or move the baseline backwards', () => {
  const updated = applySnapshot(pr(), snapshot({ headSha: 'new' }), 'me');
  assert.equal(toCard(acknowledge(updated, 1)).unseen, true);
  assert.equal(toCard(acknowledge(updated, 2)).unseen, false);
  assert.equal(acknowledge(acknowledge(updated, 2), 1).seenRevision, 2);
  assert.throws(() => acknowledge(updated, 3), /Invalid activity revision/);
});
test('unseen activity remains latched through ignored rollbacks and unchanged refreshes', () => {
  let value = pr({ snapshot: snapshot({ status: 'Draft' }), seenRevision: 1 });
  value = applySnapshot(value, snapshot({ status: 'Open' }), 'me');
  value = applySnapshot(value, snapshot({ status: 'Draft' }), 'me');
  value = applySnapshot(value, snapshot({ status: 'Draft' }), 'me');
  assert.equal(toCard(value).unseen, true);
  assert.equal(value.revision, 2);
});
test('public cards omit stored conversation and acknowledgment internals', () => {
  const card = toCard(pr());
  assert.equal('snapshot' in card, false);
  assert.equal('seenRevision' in card, false);
});

test('a reply in the same timestamp second as the viewer question is detected by thread order', () => {
  const thread = { id: 't', resolved: false, resolvedBy: '', comments: [comment('question', 'me')] };
  assert.equal(hasRelevantChanges(snapshot({ threads: [thread] }), snapshot({ threads: [{ ...thread, comments: [...thread.comments, comment('answer')] }] }), 'me'), true);
});
