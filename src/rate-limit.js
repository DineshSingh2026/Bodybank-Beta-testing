/**
 * Small in-memory limiter for the sign-in endpoint. Passwords are the only
 * thing standing between the internet and the tracker, so unlimited guesses
 * against a public URL are worth closing off.
 *
 * One process holds one counter set; that is the right scale here, since the
 * app runs as a single Render instance.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map();

// Expired buckets would otherwise accumulate for the life of the process.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of attempts) {
    if (now > bucket.resetAt) attempts.delete(key);
  }
}, WINDOW_MS).unref();

function loginLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = attempts.get(key);

  if (!bucket || now > bucket.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    const minutes = Math.ceil((bucket.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }
  next();
}

// A successful sign-in clears the counter so a real user is never held back.
function clearAttempts(req) {
  attempts.delete(req.ip || 'unknown');
}

module.exports = { loginLimiter, clearAttempts, sweeper };
