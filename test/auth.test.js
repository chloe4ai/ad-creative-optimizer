// The x-api-key middleware, driven through a real Express app over HTTP so header
// handling (case, absence, wrong length) is the production path, not a mocked req.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireApiKey } from '../src/api/middleware/apiKey.js';

const KEY = 'test-key-0123456789abcdef';

async function withServer(fn) {
  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', requireApiKey(KEY));
  app.get('/api/thing', (req, res) => res.json({ success: true }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('requireApiKey: refuses to build without a key', () => {
  assert.throws(() => requireApiKey(''), /expected key is required/);
  assert.throws(() => requireApiKey(undefined), /expected key is required/);
});

test('requireApiKey: /api without the header is 401 and the body does not echo anything', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/thing`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(body, { success: false, error: 'Unauthorized: missing or invalid x-api-key' });
  });
});

test('requireApiKey: wrong key, prefix of the key, and key with trailing byte are all 401', async () => {
  await withServer(async (base) => {
    for (const bad of ['nope', KEY.slice(0, -1), `${KEY}x`, KEY.toUpperCase()]) {
      const res = await fetch(`${base}/api/thing`, { headers: { 'x-api-key': bad } });
      assert.equal(res.status, 401, `expected 401 for ${JSON.stringify(bad)}`);
    }
  });
});

test('requireApiKey: the right key passes, header name is case-insensitive', async () => {
  await withServer(async (base) => {
    for (const name of ['x-api-key', 'X-API-KEY', 'X-Api-Key']) {
      const res = await fetch(`${base}/api/thing`, { headers: { [name]: KEY } });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { success: true });
    }
  });
});

test('requireApiKey: /health is outside /api and needs no key', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});
