const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fetchSnapshot, fetchViewer } = require(path.join(process.env.TEST_BUILD_DIR, 'github-client.js'));
const { extractPRs } = require(path.join(process.env.TEST_BUILD_DIR, 'tracking.js'));
const reference = extractPRs('https://github.com/org/repo/pull/1')[0];
const page = (nodes, more = false) => ({ nodes, pageInfo: { hasNextPage: more, endCursor: more ? 'cursor' : null } });
const comment = (id) => ({ id, author: { login: 'me' }, createdAt: '2026-10-01T12:00:00Z' });
const thread = (id, more = false) => ({ id, isResolved: false, resolvedBy: null, comments: page([comment(`${id}-comment`)], more) });
const pull = (overrides = {}) => ({ id: 'pull', title: 'Feature', author: { login: 'me' }, state: 'OPEN', isDraft: false, headRefOid: 'sha',
  comments: page([]), reviews: page([]), reviewThreads: page([]), ...overrides });

function response(data, status = 200) { return new Response(JSON.stringify(data), { status }); }

test('retrieves all pages of comments, review summaries, threads and nested replies', async () => {
  const original = global.fetch;
  const requests = [];
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.cache, 'no-store');
    const { query, variables } = JSON.parse(init.body);
    requests.push(variables);
    if (query.includes('repository(owner:')) return response({ data: { repository: { pullRequest: pull({
      comments: page([comment('c1')], true), reviews: page([{ ...comment('r1'), body: '', state: 'APPROVED' }], true),
      reviewThreads: page([thread('t1', true)], true),
    }) } } });
    if (query.includes('reviewThreads(first:')) return response({ data: { node: { reviewThreads: page([thread('t2')]) } } });
    if (query.includes('reviews(first:')) return response({ data: { node: { reviews: page([
      { ...comment('r2'), body: 'Please change this', state: 'CHANGES_REQUESTED' },
      { ...comment('r3'), body: 'Not published', state: 'PENDING' },
    ]) } } });
    if (variables.id === 'pull') return response({ data: { node: { comments: page([comment('c2')]) } } });
    if (variables.id === 't1') return response({ data: { node: { comments: page([comment('reply')]) } } });
    throw new Error('Unexpected request');
  };
  try {
    const snapshot = await fetchSnapshot(reference, 'test-token');
    assert.deepEqual(snapshot.comments.map((c) => c.id), ['c1', 'c2', 'r2']);
    assert.deepEqual(snapshot.threads.map((t) => t.id), ['t1', 't2']);
    assert.deepEqual(snapshot.threads[0].comments.map((c) => c.id), ['t1-comment', 'reply']);
    assert.equal(requests.length, 5);
    assert.equal(snapshot.status, 'Open');
    assert.ok(!Number.isNaN(Date.parse(snapshot.retrievedAt)));
  } finally { global.fetch = original; }
});
test('maps draft, closed and merged states correctly', async () => {
  const original = global.fetch;
  try {
    for (const [state, isDraft, status] of [['OPEN', true, 'Draft'], ['CLOSED', true, 'Closed'], ['MERGED', false, 'Merged']]) {
      global.fetch = async () => response({ data: { repository: { pullRequest: pull({ state, isDraft }) } } });
      assert.equal((await fetchSnapshot(reference, 'token')).status, status);
    }
  } finally { global.fetch = original; }
});
test('fails on partial GraphQL errors rather than storing incomplete snapshots', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => response({ data: { repository: { pullRequest: pull() } }, errors: [{ message: 'Rate limited' }] });
    await assert.rejects(fetchSnapshot(reference, 'token'), /Rate limited/);
    global.fetch = async () => response({ message: 'Bad credentials' }, 401);
    await assert.rejects(fetchSnapshot(reference, 'token'), /Bad credentials/);
    global.fetch = async () => response({ data: { repository: null } });
    await assert.rejects(fetchSnapshot(reference, 'token'), /not found/);
  } finally { global.fetch = original; }
});
test('uses the authenticated GitHub identity', async () => {
  const original = global.fetch;
  global.fetch = async () => response({ data: { viewer: { login: 'actual-user' } } });
  try { assert.equal(await fetchViewer('token'), 'actual-user'); } finally { global.fetch = original; }
});
