const jwt = require('jsonwebtoken');

const PRODUCTION = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET;
const COOKIE = 'bb_session';

// A guessable signing key lets anyone mint a developer session, so in
// production a missing or placeholder secret stops the boot rather than
// quietly running wide open.
if (!SECRET || SECRET.length < 32 || /replace|change-me/i.test(SECRET)) {
  if (PRODUCTION) {
    console.error('JWT_SECRET must be set to a random string of at least 32 characters.');
    process.exit(1);
  }
  console.warn('Warning: JWT_SECRET is weak or unset. This is only tolerated outside production.');
}

const SIGNING_KEY = SECRET || 'insecure-development-only-secret';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION, // HTTPS-only once deployed; plain HTTP still works locally
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function issueToken(res, user) {
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    SIGNING_KEY,
    { expiresIn: '30d' }
  );
  res.cookie(COOKIE, token, cookieOptions());
}

function clearToken(res) {
  // clearCookie only matches when the flags match the ones it was set with.
  const { maxAge: _ignored, ...options } = cookieOptions();
  res.clearCookie(COOKIE, options);
}

function readUser(req, _res, next) {
  const token = req.cookies[COOKIE];
  if (token) {
    try {
      req.user = jwt.verify(token, SIGNING_KEY);
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have access to this action.' });
    }
    next();
  };
}

module.exports = { issueToken, clearToken, readUser, requireLogin, requireRole, COOKIE };
