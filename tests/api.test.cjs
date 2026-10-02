const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { requireLocalMutation, loggedApi } = require(path.join(process.env.TEST_BUILD_DIR, 'api.js'));
const { writeLog } = require(path.join(process.env.TEST_BUILD_DIR, 'request-log.js'));

function mutation(origin, host = 'localhost:3100') {
  return new Request('http://0.0.0.0:3000/api/tracked', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Host: host, ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ action: 'seen' }),
  });
}

test('accepts the browser-facing Docker host and port for mark-as-seen requests', () => {
  assert.doesNotThrow(() => requireLocalMutation(mutation('http://localhost:3100')));
  assert.doesNotThrow(() => requireLocalMutation(mutation('http://127.0.0.1:3100', '127.0.0.1:3100')));
  assert.doesNotThrow(() => requireLocalMutation(mutation('https://reviews.example.com', 'reviews.example.com')));
});
test('still rejects foreign origins, incorrect ports, invalid origins and spoofed forwarded hosts', () => {
  for (const origin of ['http://evil.example', 'http://localhost:9999', 'null', 'file://localhost:3100']) {
    assert.throws(() => requireLocalMutation(mutation(origin)), /Cross-origin/);
  }
  const request = mutation('http://evil.example');
  request.headers.set('x-forwarded-host', 'evil.example');
  assert.throws(() => requireLocalMutation(request), /Cross-origin/);
});
test('falls back to the URL without Host; accepts CLI requests without Origin and requires JSON', () => {
  const request = mutation('http://0.0.0.0:3000');
  request.headers.delete('host');
  assert.doesNotThrow(() => requireLocalMutation(request));
  assert.doesNotThrow(() => requireLocalMutation(mutation()));
  const invalid = mutation(); invalid.headers.set('content-type', 'text/plain');
  assert.throws(() => requireLocalMutation(invalid), /Expected a JSON/);
});
test('logs successful API calls with request ID, action, status and duration; excludes request bodies and authorization', async () => {
  const originalInfo = console.info;
  const originalError = console.error;
  const lines = [];
  console.info = console.error = (line) => lines.push(JSON.parse(line));
  try {
    const request = mutation('http://localhost:3100');
    request.headers.set('Authorization', 'Bearer secret-token');
    const response = await loggedApi(request, async (log) => {
      log.action('seen', 'org/repo/123', 42);
      requireLocalMutation(request);
      return Response.json({ ok: true });
    });
    assert.equal(response.status, 200);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, 'request.started');
    assert.equal(lines[1].event, 'request.completed');
    assert.equal(lines[1].status, 200);
    assert.equal(lines[1].action, 'seen');
    assert.equal(lines[1].key, 'org/repo/123');
    assert.equal(lines[1].revision, 42);
    assert.equal(lines[1].requestId, response.headers.get('X-Request-ID'));
    assert.equal(typeof lines[1].durationMs, 'number');
    assert.equal(JSON.stringify(lines).includes('secret-token'), false);
    assert.equal('body' in lines[1], false);
  } finally { console.info = originalInfo; console.error = originalError; }
});
test('logs rejected requests with error message and stack, and returns matching request ID', async () => {
  const originalInfo = console.info;
  const originalError = console.error;
  const lines = [];
  console.info = console.error = (line) => lines.push(JSON.parse(line));
  try {
    const response = await loggedApi(mutation('http://evil.example'), async () => {
      requireLocalMutation(mutation('http://evil.example'));
      return Response.json({ ok: true });
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Cross-origin requests are not allowed.');
    assert.deepEqual(lines.map((line) => line.event), ['request.started', 'request.failed', 'request.completed']);
    assert.equal(lines[1].level, 'error');
    assert.match(lines[1].stack, /Cross-origin/);
    assert.equal(lines[2].status, 400);
    assert.equal(lines[1].requestId, response.headers.get('X-Request-ID'));
  } finally { console.info = originalInfo; console.error = originalError; }
});
test('redacts tokens even if an upstream error includes them', () => {
  const originalError = console.error;
  const originalToken = process.env.GITHUB_PAT;
  process.env.GITHUB_PAT = 'custom-configured-secret';
  const lines = [];
  console.error = (line) => lines.push(line);
  try {
    writeLog('error', 'github.pr.failed', {}, new Error('Bearer secret-override ghp_example123 github_pat_example123 custom-configured-secret'));
    const line = lines[0];
    for (const token of ['secret-override', 'ghp_example123', 'github_pat_example123', 'custom-configured-secret']) {
      assert.equal(line.includes(token), false);
    }
    assert.ok(line.includes('[redacted]'));
  } finally {
    console.error = originalError;
    if (originalToken === undefined) delete process.env.GITHUB_PAT; else process.env.GITHUB_PAT = originalToken;
  }
});
