import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiKey, getAllowedOrigins, getDatabaseSsl } from '../src/config.js';

test('getApiKey: required, non-placeholder, at least 16 chars', () => {
  assert.throws(() => getApiKey({}), /API_KEY is not set/);
  assert.throws(() => getApiKey({ API_KEY: '   ' }), /API_KEY is not set/);
  assert.throws(() => getApiKey({ API_KEY: 'short' }), /too short/);
  assert.throws(() => getApiKey({ API_KEY: 'change-me-openssl-rand-hex-32' }), /placeholder/);
  assert.equal(getApiKey({ API_KEY: ' 0123456789abcdef0123 ' }), '0123456789abcdef0123');
});

test('getAllowedOrigins: comma-separated bare origins; unset means none', () => {
  assert.deepEqual(getAllowedOrigins({}), []);
  assert.deepEqual(
    getAllowedOrigins({ FRONTEND_ORIGIN: 'https://app.example.com, http://localhost:3001' }),
    ['https://app.example.com', 'http://localhost:3001']
  );
  assert.throws(() => getAllowedOrigins({ FRONTEND_ORIGIN: 'app.example.com' }), /not a valid URL/);
  assert.throws(() => getAllowedOrigins({ FRONTEND_ORIGIN: 'https://app.example.com/path' }), /bare origin/);
});

test('getDatabaseSsl: verified TLS by default in production, off elsewhere', () => {
  const warnings = [];
  const opts = { warn: (m) => warnings.push(m) };

  assert.equal(getDatabaseSsl({ NODE_ENV: 'development' }, opts), false);
  assert.deepEqual(getDatabaseSsl({ NODE_ENV: 'production' }, opts), { rejectUnauthorized: true });
  assert.deepEqual(getDatabaseSsl({ NODE_ENV: 'development', DATABASE_SSL: 'true' }, opts), { rejectUnauthorized: true });
  assert.equal(getDatabaseSsl({ NODE_ENV: 'production', DATABASE_SSL: 'false' }, opts), false);
  assert.deepEqual(getDatabaseSsl({ NODE_ENV: 'production', DATABASE_SSL_CA: 'PEM' }, opts), {
    rejectUnauthorized: true,
    ca: 'PEM',
  });
  assert.equal(warnings.length, 0);

  const lax = getDatabaseSsl({ NODE_ENV: 'production', DATABASE_SSL_ALLOW_SELF_SIGNED: 'true' }, opts);
  assert.deepEqual(lax, { rejectUnauthorized: false });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /NOT verified/);
});
