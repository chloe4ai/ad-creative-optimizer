/**
 * AES-256-GCM encryption for ad-platform tokens stored in `ad_accounts`.
 *
 * Stored format:  enc:v1:<iv base64>:<auth tag base64>:<ciphertext base64>
 *
 * The `enc:v1:` prefix lets `decryptToken` recognise ciphertext. A stored value without
 * it is treated as a legacy plaintext row written before encryption existed and returned
 * unchanged (with a one-time warning), so existing deployments keep working until
 * `scripts/encrypt-existing-tokens.js` has rewritten them.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const PREFIX = 'enc:v1:';

/**
 * Parse a 32-byte key given as 64 hex characters or as base64.
 * Generate one with `openssl rand -hex 32`.
 */
export function parseTokenKey(raw) {
  const value = (raw || '').trim();
  if (!value) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.');
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, 'hex');
  } else {
    key = Buffer.from(value, 'base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes: 64 hex characters or 44 base64 characters.');
  }
  return key;
}

let cachedKey = null;
/** The key from TOKEN_ENCRYPTION_KEY, parsed once. */
export function getTokenKey(env = process.env) {
  if (!cachedKey) cachedKey = parseTokenKey(env.TOKEN_ENCRYPTION_KEY);
  return cachedKey;
}

/** True when a stored value is in the encrypted format. */
export function isEncryptedToken(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Encrypt a plaintext token. `null`/`undefined`/'' pass through as `null`. */
export function encryptToken(plaintext, key) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  if (typeof plaintext !== 'string') throw new TypeError('encryptToken expects a string');
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error('encryptToken: key must be 32 bytes');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

let warnedLegacy = false;

/**
 * Decrypt a stored token. Throws if the ciphertext was tampered with or the key is wrong.
 * Legacy plaintext (no `enc:v1:` prefix) is returned as-is.
 */
export function decryptToken(stored, key, { warn = console.warn } = {}) {
  if (stored === null || stored === undefined || stored === '') return null;
  if (typeof stored !== 'string') throw new TypeError('decryptToken expects a string');

  if (!isEncryptedToken(stored)) {
    if (!warnedLegacy) {
      warnedLegacy = true;
      warn('WARNING: ad_accounts holds an unencrypted token. Run `node scripts/encrypt-existing-tokens.js` to encrypt existing rows.');
    }
    return stored;
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error('decryptToken: key must be 32 bytes');

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('decryptToken: malformed ciphertext');
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  if (iv.length !== IV_BYTES) throw new Error('decryptToken: malformed ciphertext');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('decryptToken: authentication failed (wrong key or tampered ciphertext)');
  }
}

/**
 * The adapter credentials for an `ad_accounts` row, with both tokens decrypted.
 * Every place that turns a DB row into an adapter config goes through here.
 */
export function accountCredentials(row, key) {
  const { access_token_encrypted: access, refresh_token_encrypted: refresh } = row;
  // Only resolve the key when something is actually encrypted, so legacy plaintext rows
  // (and tests that use them) do not require TOKEN_ENCRYPTION_KEY.
  const resolvedKey = key || (isEncryptedToken(access) || isEncryptedToken(refresh) ? getTokenKey() : null);
  return {
    accountId: row.account_id,
    accessToken: decryptToken(access, resolvedKey),
    refreshToken: decryptToken(refresh, resolvedKey),
  };
}

/** Test hook: forget the cached key and the legacy warning. */
export function _resetForTests() {
  cachedKey = null;
  warnedLegacy = false;
}
