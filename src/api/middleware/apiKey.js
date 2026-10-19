import { timingSafeEqual } from 'node:crypto';

/**
 * Express middleware that requires a shared secret in the `x-api-key` header.
 *
 * The comparison is constant-time so response timing does not leak how many leading
 * bytes of a guess were correct. Missing and wrong keys get the same 401 body.
 */
export function requireApiKey(expectedKey) {
  if (typeof expectedKey !== 'string' || expectedKey.length === 0) {
    throw new Error('requireApiKey: an expected key is required');
  }
  const expected = Buffer.from(expectedKey, 'utf8');

  return function apiKeyMiddleware(req, res, next) {
    const header = req.get('x-api-key');
    const provided = typeof header === 'string' ? Buffer.from(header, 'utf8') : Buffer.alloc(0);

    const matches = provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!matches) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing or invalid x-api-key' });
    }
    next();
  };
}

export default requireApiKey;
