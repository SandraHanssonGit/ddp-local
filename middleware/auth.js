// JWT verification for v2. Mirrors routes/api.js's existing pattern
// (same JWT_SECRET, same v2 `users` table via /api/login, which
// already worked against v2 data - DB_VERSION defaults to v2) rather
// than importing from that file, since it doesn't export these and is
// v1/legacy code not worth touching for a v2 feature.
//
// getUser() is a plain lookup (no response side effects) rather than
// Express middleware, because the passport route's auth requirement is
// decided at render time per the requested role's `requires_auth` flag
// (Settings > Digital Access) - not fixed per route, so it can't be a
// static middleware chain.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function getUser(req) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { getUser };
