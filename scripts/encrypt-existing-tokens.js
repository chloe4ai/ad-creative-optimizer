#!/usr/bin/env node
/**
 * One-off migration: encrypt the plaintext tokens that `ad_accounts` held before
 * AES-256-GCM encryption was introduced.
 *
 *   TOKEN_ENCRYPTION_KEY=... DATABASE_URL=... node scripts/encrypt-existing-tokens.js
 *
 * Idempotent: rows whose tokens already start with `enc:v1:` are skipped, so it is safe
 * to run more than once. Rows are rewritten one at a time inside a transaction.
 */
import { config } from 'dotenv';
import { Pool } from 'pg';
import { getDatabaseSsl } from '../src/config.js';
import { encryptToken, getTokenKey, isEncryptedToken } from '../src/services/tokenCrypto.js';

config();

const key = getTokenKey();
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: getDatabaseSsl() });

const client = await db.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    'SELECT id, access_token_encrypted, refresh_token_encrypted FROM ad_accounts ORDER BY id FOR UPDATE'
  );

  let updated = 0;
  for (const row of rows) {
    const access = row.access_token_encrypted;
    const refresh = row.refresh_token_encrypted;
    const needsAccess = access && !isEncryptedToken(access);
    const needsRefresh = refresh && !isEncryptedToken(refresh);
    if (!needsAccess && !needsRefresh) continue;

    await client.query(
      'UPDATE ad_accounts SET access_token_encrypted = $2, refresh_token_encrypted = $3 WHERE id = $1',
      [row.id, needsAccess ? encryptToken(access, key) : access, needsRefresh ? encryptToken(refresh, key) : refresh]
    );
    updated += 1;
  }

  await client.query('COMMIT');
  console.log(`ad_accounts: ${rows.length} rows checked, ${updated} encrypted.`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed, nothing was changed:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
