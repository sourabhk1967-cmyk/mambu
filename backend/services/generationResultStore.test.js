const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const GenerationResultStore = require('./generationResultStore');

test('stores a completed generation for the same authenticated owner', () => {
  const store = new GenerationResultStore();
  const payload = {
    message: '# Exact reply\n\n- First bullet',
    messageFormat: 'backend-markdown'
  };

  store.start('request-1', 'user-a');
  store.complete('request-1', 'user-a', payload);

  assert.equal(store.get('request-1', 'user-a').status, 'completed');
  assert.deepEqual(store.get('request-1', 'user-a').payload, payload);
  assert.equal(store.get('request-1', 'user-b'), null);
});

test('expires old generation results', () => {
  const store = new GenerationResultStore({ ttlMs: 10 });

  store.start('request-1', 'user-a');
  const entry = store.entries.get('request-1');
  entry.updatedAt = Date.now() - 20;

  assert.equal(store.get('request-1', 'user-a'), null);
});

test('recovers a completed generation from disk after a process restart', () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyrovia-generation-results-'));

  try {
    const firstStore = new GenerationResultStore({ storageDir });
    const payload = {
      message: 'Recovered backend reply',
      messageFormat: 'backend-markdown'
    };

    firstStore.start('request-persisted', 'user-a');
    firstStore.complete('request-persisted', 'user-a', payload);

    const restartedStore = new GenerationResultStore({ storageDir });
    const recovered = restartedStore.get('request-persisted', 'user-a');

    assert.equal(recovered.status, 'completed');
    assert.deepEqual(recovered.payload, payload);
    assert.equal(restartedStore.get('request-persisted', 'user-b'), null);
  } finally {
    fs.rmSync(storageDir, { force: true, recursive: true });
  }
});

test('waits for a pending generation to complete for the same owner', async () => {
  const store = new GenerationResultStore();
  const payload = {
    message: 'Delivered immediately after backend completion',
    messageFormat: 'backend-markdown'
  };

  store.start('request-wait', 'user-a');
  const waiter = store.waitFor('request-wait', 'user-a', { timeoutMs: 1000 });

  setTimeout(() => {
    store.complete('request-wait', 'user-a', payload);
  }, 1);

  const result = await waiter;

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.payload, payload);
});

test('does not deliver a waited generation to a different owner', async () => {
  const store = new GenerationResultStore();

  store.start('request-private', 'user-a');
  const waiter = store.waitFor('request-private', 'user-b', { timeoutMs: 20 });
  store.complete('request-private', 'user-a', {
    message: 'Private reply'
  });

  assert.equal(await waiter, null);
});
