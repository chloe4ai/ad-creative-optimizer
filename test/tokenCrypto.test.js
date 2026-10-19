import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  parseTokenKey,
  accountCredentials,
  _resetForTests,
} from '../src/services/tokenCrypto.js';

const key = randomBytes(32);
const quiet = { warn: () => {} };

test('tokenCrypto: round trip returns the original token', () => {
  for (const plain of ['EAAB-meta-token', 'ya29.google', 'ünïcödé 🔑', 'x'.repeat(4000)]) {
    const stored = encryptToken(plain, key);
    assert.ok(isEncryptedToken(stored));
    assert.notEqual(stored, plain);
    assert.ok(!stored.includes(plain), 'ciphertext must not contain the plaintext');
    assert.equal(decryptToken(stored, key), plain);
  }
});

test('tokenCrypto: the same token encrypts differently each time (fresh IV)', () => {
  const a = encryptToken('same', key);
  const b = encryptToken('same', key);
  assert.notEqual(a, b);
  assert.equal(decryptToken(a, key), decryptToken(b, key));
});

test('tokenCrypto: wrong key and tampered ciphertext both fail authentication', () => {
  const stored = encryptToken('secret', key);
  assert.throws(() => decryptToken(stored, randomBytes(32)), /authentication failed/);

  const [prefix, v, iv, tag, ct] = stored.split(':');
  const flipped = Buffer.from(ct, 'base64');
  flipped[0] ^= 0x01;
  const tampered = [prefix, v, iv, tag, flipped.toString('base64')].join(':');
  assert.throws(() => decryptToken(tampered, key), /authentication failed/);

  assert.throws(() => decryptToken('enc:v1:only-two:parts', key), /malformed/);
});

test('tokenCrypto: null and empty pass through as null', () => {
  assert.equal(encryptToken(null, key), null);
  assert.equal(encryptToken(undefined, key), null);
  assert.equal(encryptToken('', key), null);
  assert.equal(decryptToken(null, key), null);
  assert.equal(decryptToken('', key), null);
});

test('tokenCrypto: legacy plaintext rows are returned unchanged with a single warning', () => {
  _resetForTests();
  const warnings = [];
  const warn = (m) => warnings.push(m);
  assert.equal(decryptToken('plain-old-token', key, { warn }), 'plain-old-token');
  assert.equal(decryptToken('another', key, { warn }), 'another');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /encrypt-existing-tokens/);
  _resetForTests();
});

test('tokenCrypto: parseTokenKey accepts 64 hex or base64 and rejects everything else', () => {
  const hex = key.toString('hex');
  assert.deepEqual(parseTokenKey(hex), key);
  assert.deepEqual(parseTokenKey(key.toString('base64')), key);
  assert.throws(() => parseTokenKey(''), /not set/);
  assert.throws(() => parseTokenKey('too-short'), /32 bytes/);
  assert.throws(() => parseTokenKey('ab'.repeat(31)), /32 bytes/);
});

test('tokenCrypto: accountCredentials maps a DB row to adapter config with decrypted tokens', () => {
  const row = {
    id: 7,
    account_id: 'act_1',
    access_token_encrypted: encryptToken('access', key),
    refresh_token_encrypted: encryptToken('refresh', key),
  };
  assert.deepEqual(accountCredentials(row, key), {
    accountId: 'act_1',
    accessToken: 'access',
    refreshToken: 'refresh',
  });

  // A legacy plaintext row needs no key at all.
  _resetForTests();
  const legacy = { account_id: 'act_2', access_token_encrypted: 'plain', refresh_token_encrypted: null };
  const before = process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  try {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(accountCredentials(legacy), { accountId: 'act_2', accessToken: 'plain', refreshToken: null });
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    if (before !== undefined) process.env.TOKEN_ENCRYPTION_KEY = before;
    _resetForTests();
  }
});
