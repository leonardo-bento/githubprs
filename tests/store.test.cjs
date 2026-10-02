const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { readStore, mutateStore, storePath } = require(path.join(process.env.TEST_BUILD_DIR, 'store.js'));

test('JSON persistence serializes writes, survives reloads, preserves failed mutations and refuses corrupt files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'githubprs-store-'));
  process.env.PR_DATA_DIR = directory;
  try {
    assert.deepEqual(await readStore(), { version: 1, viewer: '', pullRequests: [] });
    await Promise.all(Array.from({ length: 10 }, (_, index) => mutateStore(async (store) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      store.pullRequests.push({ key: String(index) });
      store.viewer = 'me';
    })));
    const saved = await readStore();
    assert.equal(saved.pullRequests.length, 10);
    assert.equal(saved.viewer, 'me');
    const before = await readFile(storePath(), 'utf8');
    await assert.rejects(mutateStore((store) => { store.pullRequests = []; throw new Error('Failed'); }), /Failed/);
    assert.equal(await readFile(storePath(), 'utf8'), before);
    await mutateStore((store) => { store.pullRequests.splice(0, 1); });
    assert.equal((await readStore()).pullRequests.length, 9);
    await writeFile(storePath(), '{broken');
    await assert.rejects(mutateStore((store) => { store.pullRequests = []; }));
    assert.equal(await readFile(storePath(), 'utf8'), '{broken');
  } finally { delete process.env.PR_DATA_DIR; await rm(directory, { recursive: true, force: true }); }
});
