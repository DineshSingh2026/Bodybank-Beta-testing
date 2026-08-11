const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const asyncRoute = require('../async');
const { issueToken, clearToken, requireRole } = require('../auth');
const { loginLimiter, clearAttempts } = require('../rate-limit');

const router = express.Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Comparing against a throwaway hash when no account matches keeps the reply
// time the same either way, so the response cannot be used to discover which
// email addresses exist.
const DUMMY_HASH = bcrypt.hashSync('no-account-with-this-email', 10);

// Sign in
router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

  if (!user || !ok) {
    return res.status(401).json({ error: 'That email and password do not match an account.' });
  }

  clearAttempts(req);
  issueToken(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  res.json({ user: req.user });
});

// Dinesh creates tester accounts (there is no public signup)
router.post('/testers', requireRole('developer'), asyncRoute(async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: 'Name, email, and a password of at least 6 characters are required.' });
  }
  if (!EMAIL.test(email)) {
    return res.status(400).json({ error: 'That does not look like an email address.' });
  }

  const exists = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  if (exists.rowCount) {
    return res.status(409).json({ error: 'An account already uses that email.' });
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'tester')
       RETURNING id, name, email, created_at`,
      [name, email, hash]
    );
    res.status(201).json({ tester: rows[0] });
  } catch (err) {
    // Two submissions racing past the check above land here instead of a 500.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account already uses that email.' });
    }
    throw err;
  }
}));

router.get('/testers', requireRole('developer'), asyncRoute(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.created_at,
            count(t.id)::int AS ticket_count
       FROM users u
       LEFT JOIN tickets t ON t.tester_id = u.id
      WHERE u.role = 'tester'
      GROUP BY u.id
      ORDER BY u.name`
  );
  res.json({ testers: rows });
}));

module.exports = router;
