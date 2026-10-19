/**
 * Runtime configuration read from the environment, validated once at startup.
 *
 * Every function takes an `env` object (defaults to process.env) so the rules can be
 * unit-tested without mutating the real environment.
 */

const PLACEHOLDER_RE = /^(change[-_]?me|your[-_]|xxx+$|todo$)/i;

/** The shared secret clients must send as `x-api-key`. Required; no default. */
export function getApiKey(env = process.env) {
  const key = (env.API_KEY || '').trim();
  if (!key) {
    throw new Error('API_KEY is not set. Every /api route requires it; generate one with `openssl rand -hex 32`.');
  }
  if (key.length < 16 || PLACEHOLDER_RE.test(key)) {
    throw new Error('API_KEY is too short or still a placeholder. Use at least 16 characters.');
  }
  return key;
}

/**
 * Browser origins allowed to call the API, from a comma-separated FRONTEND_ORIGIN.
 * Returns an array of origins; an empty array means no browser origin is allowed
 * (non-browser clients such as curl are unaffected by CORS).
 */
export function getAllowedOrigins(env = process.env) {
  const raw = env.FRONTEND_ORIGIN || '';
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`FRONTEND_ORIGIN entry "${origin}" is not a valid URL`);
    }
    if (url.origin !== origin) {
      throw new Error(`FRONTEND_ORIGIN entry "${origin}" must be a bare origin (scheme://host[:port], no path)`);
    }
  }
  return origins;
}

/**
 * pg `ssl` option for the database pool.
 *
 * - DATABASE_SSL=true|false       force TLS on or off (default: on in production, off otherwise)
 * - DATABASE_SSL_ALLOW_SELF_SIGNED=true   skip certificate verification. This disables
 *   protection against man-in-the-middle attacks and is logged loudly; use it only for a
 *   managed Postgres whose CA you cannot install, and prefer DATABASE_SSL_CA when you can.
 * - DATABASE_SSL_CA               PEM text of the CA certificate to trust
 */
export function getDatabaseSsl(env = process.env, { warn = console.warn } = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const sslEnabled = env.DATABASE_SSL === undefined ? isProduction : env.DATABASE_SSL === 'true';
  if (!sslEnabled) return false;

  const ssl = { rejectUnauthorized: true };
  if (env.DATABASE_SSL_CA) ssl.ca = env.DATABASE_SSL_CA;

  if (env.DATABASE_SSL_ALLOW_SELF_SIGNED === 'true') {
    ssl.rejectUnauthorized = false;
    warn(
      'WARNING: DATABASE_SSL_ALLOW_SELF_SIGNED=true. The database certificate is NOT verified, ' +
        'so the connection is encrypted but not authenticated. Set DATABASE_SSL_CA instead when possible.'
    );
  }
  return ssl;
}
