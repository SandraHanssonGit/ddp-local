// Same verifyToken/checkRole pattern as routes/api.js (which already
// works against v2's `users` table via /api/login - DB_VERSION
// defaults to v2, so that login already issues valid JWTs for real v2
// users). Kept as its own module rather than importing from
// routes/api.js since that file doesn't export these and is v1/legacy
// code we shouldn't need to touch to add a v2 feature.
//
// This is the FIRST v2 route to enforce auth (ROADMAP.md "Security
// note") - scoped deliberately to just the new authority passport
// route, not a blanket lockdown of /admin-v2.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const checkRole = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Browser-facing variant of verifyToken+checkRole: redirects to /login
// (with ?redirect= back to the page they wanted) instead of returning
// a bare JSON error, since this guards an HTML page a person navigates
// to directly, not an API call a script makes.
const requireRole = (allowedRoles) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  const loginRedirect = () => res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));

  if (!token) return loginRedirect();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return loginRedirect();
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).send('Your account does not have access to this view.');
  }
  next();
};

module.exports = { verifyToken, checkRole, requireRole };
