const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ActivityNotifications, notificationPermission } = require(path.join(process.env.TEST_BUILD_DIR, 'notifications.js'));

function browser(t) {
  const delivered = [];
  const storage = new Map();
  let lock = Promise.resolve();
  class Notification {
    static permission = 'granted';
    constructor(title, options) { this.title = title; this.options = options; delivered.push(this); }
    close() { this.closed = true; }
  }
  const values = {
    Notification,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    navigator: { locks: { request: (_name, operation) => { const result = lock.then(operation); lock = result.catch(() => {}); return result; } } },
    window: { focus: t.mock.fn() },
  };
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  return { delivered, storage, Notification };
}

test('opening establishes a silent baseline; only new batches notify, including repeated unseen activity', async (t) => {
  const { delivered } = browser(t);
  const page = new ActivityNotifications();
  await page.observe(10);
  assert.equal(delivered.length, 0);
  await page.observe(11);
  await page.observe(11); // No news in the next slot.
  await page.observe(12);
  assert.equal(delivered.length, 2);
  assert.equal(delivered[0].title, 'GitHub PRs: News from your PRs.');
  const reopened = new ActivityNotifications();
  await reopened.observe(13);
  assert.equal(delivered.length, 2);
  await page.observe(11); // A stale response cannot reannounce old activity.
  assert.equal(delivered.length, 2);
  delivered[0].onclick();
  assert.equal(globalThis.window.focus.mock.callCount(), 1);
  assert.equal(delivered[0].closed, true);
});

test('concurrent tabs deliver one notification per batch', async (t) => {
  const { delivered } = browser(t);
  const tabs = Array.from({ length: 3 }, () => new ActivityNotifications());
  await Promise.all(tabs.map((tab) => tab.observe(0)));
  await Promise.all(tabs.map((tab) => tab.observe(1)));
  assert.equal(delivered.length, 1);
  await Promise.all(tabs.map((tab) => tab.observe(2)));
  assert.equal(delivered.length, 2);
});

test('permission denial is silent and enabling later does not announce old activity', async (t) => {
  const { Notification, delivered } = browser(t);
  Notification.permission = 'denied';
  const page = new ActivityNotifications();
  await page.observe(0);
  await page.observe(1);
  Notification.permission = 'granted';
  await page.observe(1);
  assert.equal(delivered.length, 0);
  await page.observe(2);
  assert.equal(delivered.length, 1);
});

test('notifications tolerate missing APIs and blocked storage', async (t) => {
  const { delivered } = browser(t);
  globalThis.navigator = {};
  globalThis.localStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const page = new ActivityNotifications();
  await page.observe(0);
  await page.observe(1);
  assert.equal(delivered.length, 1);
  delete globalThis.Notification;
  assert.equal(notificationPermission(), 'unsupported');
  await page.observe(2);
  assert.equal(delivered.length, 1);
});
