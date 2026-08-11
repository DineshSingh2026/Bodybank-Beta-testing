const express = require('express');
const db = require('../db');
const asyncRoute = require('../async');
const { requireLogin, requireRole } = require('../auth');
const { upload, saveFile } = require('../upload');
const { MODULES, ISSUE_TYPES, PRIORITIES } = require('../constants');

const router = express.Router();

function logHistory(ticketId, userId, action) {
  return db.query(
    'INSERT INTO ticket_history (ticket_id, user_id, action) VALUES ($1, $2, $3)',
    [ticketId, userId, action]
  );
}

function touch(ticketId) {
  return db.query('UPDATE tickets SET updated_at = now() WHERE id = $1', [ticketId]);
}

// Loads the ticket and enforces that a tester only ever reaches their own.
async function loadTicket(req, res) {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'That ticket does not exist.' });
    return null;
  }
  const { rows } = await db.query(
    `SELECT t.*, tester.name AS tester_name, tester.email AS tester_email,
            dev.name AS developer_name
       FROM tickets t
       JOIN users tester ON tester.id = t.tester_id
       LEFT JOIN users dev ON dev.id = t.developer_id
      WHERE t.id = $1`,
    [req.params.id]
  );
  const ticket = rows[0];
  if (!ticket) {
    res.status(404).json({ error: 'That ticket does not exist.' });
    return null;
  }
  if (req.user.role === 'tester' && ticket.tester_id !== req.user.id) {
    res.status(404).json({ error: 'That ticket does not exist.' });
    return null;
  }
  return ticket;
}

// ---------------------------------------------------------------- dashboards

router.get('/stats', requireLogin, asyncRoute(async (req, res) => {
  const scope = req.user.role === 'tester' ? 'WHERE tester_id = $1' : '';
  const params = req.user.role === 'tester' ? [req.user.id] : [];

  const { rows } = await db.query(
    `SELECT
       count(*)::int                                                   AS total,
       count(*) FILTER (WHERE status = 'NEW')::int                     AS new,
       count(*) FILTER (WHERE status = 'IN PROGRESS')::int             AS in_progress,
       count(*) FILTER (WHERE status = 'RETEST')::int                  AS retest,
       count(*) FILTER (WHERE status = 'REOPENED')::int                AS reopened,
       count(*) FILTER (WHERE status = 'CLOSED')::int                  AS closed
     FROM tickets ${scope}`,
    params
  );
  res.json(rows[0]);
}));

// ------------------------------------------------------------------- listing

router.get('/', requireLogin, asyncRoute(async (req, res) => {
  const where = [];
  const params = [];

  if (req.user.role === 'tester') {
    params.push(req.user.id);
    where.push(`t.tester_id = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`t.status = $${params.length}`);
  }
  if (req.query.priority) {
    params.push(req.query.priority);
    where.push(`t.priority = $${params.length}`);
  }
  if (req.query.module) {
    params.push(req.query.module);
    where.push(`t.module = $${params.length}`);
  }
  if (req.query.q) {
    // The wildcards belong to the search, so any the user typed are escaped.
    const term = String(req.query.q).trim().replace(/[\\%_]/g, '\\$&');
    params.push('%' + term + '%');
    const i = params.length;
    where.push(`(t.title ILIKE $${i} OR t.ticket_number ILIKE $${i} OR tester.name ILIKE $${i})`);
  }

  const { rows } = await db.query(
    `SELECT t.id, t.ticket_number, t.title, t.priority, t.status, t.module,
            t.created_at, t.updated_at, tester.name AS tester_name
       FROM tickets t
       JOIN users tester ON tester.id = t.tester_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.updated_at DESC
      LIMIT 500`,
    params
  );
  res.json({ tickets: rows });
}));

// ------------------------------------------------------------------ creation

router.post('/', requireRole('tester'), upload.single('screenshot'), asyncRoute(async (req, res) => {
  const b = req.body;
  const title = (b.title || '').trim();

  if (!title) return res.status(400).json({ error: 'Give the issue a title.' });
  if (title.length > 200) return res.status(400).json({ error: 'Keep the title under 200 characters.' });
  if (!MODULES.includes(b.module)) return res.status(400).json({ error: 'Choose a module.' });
  if (!ISSUE_TYPES.includes(b.issue_type)) return res.status(400).json({ error: 'Choose an issue type.' });
  if (!PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'Choose a priority.' });

  const dev = await db.query(`SELECT id FROM users WHERE role = 'developer' ORDER BY id LIMIT 1`);
  const developerId = dev.rows[0] ? dev.rows[0].id : null;
  const screenshot = await saveFile(req.file);

  const { rows } = await db.query(
    `INSERT INTO tickets
       (title, issue_type, module, priority, description, steps, expected_result,
        actual_result, screenshot, device, app_version, tester_id, developer_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, ticket_number`,
    [
      title,
      b.issue_type,
      b.module,
      b.priority,
      (b.description || '').trim(),
      (b.steps || '').trim(),
      (b.expected_result || '').trim(),
      (b.actual_result || '').trim(),
      screenshot,
      (b.device || '').trim(),
      (b.app_version || '').trim(),
      req.user.id,
      developerId,
    ]
  );

  const ticket = rows[0];
  await logHistory(ticket.id, req.user.id, 'Ticket created');
  await logHistory(ticket.id, null, 'Assigned to Dinesh Singh');

  res.status(201).json({ id: ticket.id, ticket_number: ticket.ticket_number });
}));

// -------------------------------------------------------------------- detail

router.get('/:id', requireLogin, asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  const comments = await db.query(
    `SELECT c.id, c.comment, c.screenshot, c.created_at, u.name AS author, u.role
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.ticket_id = $1 ORDER BY c.created_at`,
    [ticket.id]
  );
  const history = await db.query(
    `SELECT h.id, h.action, h.created_at, u.name AS actor
       FROM ticket_history h LEFT JOIN users u ON u.id = h.user_id
      WHERE h.ticket_id = $1 ORDER BY h.created_at`,
    [ticket.id]
  );

  res.json({ ticket, comments: comments.rows, history: history.rows });
}));

// ------------------------------------------------------------------ comments

router.post('/:id/comments', requireLogin, upload.single('screenshot'), asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  const text = (req.body.comment || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a comment before posting.' });

  const screenshot = await saveFile(req.file);
  await db.query(
    'INSERT INTO comments (ticket_id, user_id, comment, screenshot) VALUES ($1, $2, $3, $4)',
    [ticket.id, req.user.id, text, screenshot]
  );
  await touch(ticket.id);
  res.status(201).json({ ok: true });
}));

// ------------------------------------------------------------------ workflow

// Dinesh starts work: NEW / REOPENED -> IN PROGRESS
router.post('/:id/start', requireRole('developer'), asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  if (!['NEW', 'REOPENED'].includes(ticket.status)) {
    return res.status(400).json({ error: `A ticket in ${ticket.status} cannot be started.` });
  }

  await db.query(`UPDATE tickets SET status = 'IN PROGRESS', updated_at = now() WHERE id = $1`, [ticket.id]);
  await logHistory(ticket.id, req.user.id, 'Dinesh started working');
  res.json({ status: 'IN PROGRESS' });
}));

// Dinesh marks fixed: -> FIXED -> RETEST (handed straight back to the tester)
router.post('/:id/fix', requireRole('developer'), asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  if (!['NEW', 'IN PROGRESS', 'REOPENED'].includes(ticket.status)) {
    return res.status(400).json({ error: `A ticket in ${ticket.status} cannot be marked as fixed.` });
  }

  const note = (req.body.comment || '').trim();
  if (note) {
    await db.query('INSERT INTO comments (ticket_id, user_id, comment) VALUES ($1, $2, $3)', [
      ticket.id, req.user.id, note,
    ]);
  }

  await db.query(`UPDATE tickets SET status = 'RETEST', updated_at = now() WHERE id = $1`, [ticket.id]);
  await logHistory(ticket.id, req.user.id, 'Ticket marked Fixed');
  await logHistory(ticket.id, req.user.id, 'Sent for Retest');
  res.json({ status: 'RETEST' });
}));

// Tester passes the retest: RETEST -> CLOSED
router.post('/:id/pass', requireRole('tester'), asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  if (ticket.status !== 'RETEST') {
    return res.status(400).json({ error: 'This ticket is not waiting for a retest.' });
  }

  await db.query(`UPDATE tickets SET status = 'CLOSED', updated_at = now() WHERE id = $1`, [ticket.id]);
  await logHistory(ticket.id, req.user.id, 'Tester passed retest');
  await logHistory(ticket.id, null, 'Ticket closed');
  res.json({ status: 'CLOSED' });
}));

// Tester fails the retest: RETEST -> REOPENED, with what is still wrong
router.post('/:id/fail', requireRole('tester'), upload.single('screenshot'), asyncRoute(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;

  if (ticket.status !== 'RETEST') {
    return res.status(400).json({ error: 'This ticket is not waiting for a retest.' });
  }

  const text = (req.body.comment || '').trim();
  if (!text) return res.status(400).json({ error: 'Tell Dinesh what is still wrong.' });

  const screenshot = await saveFile(req.file);
  await db.query(
    'INSERT INTO comments (ticket_id, user_id, comment, screenshot) VALUES ($1, $2, $3, $4)',
    [ticket.id, req.user.id, text, screenshot]
  );
  await db.query(`UPDATE tickets SET status = 'REOPENED', updated_at = now() WHERE id = $1`, [ticket.id]);
  await logHistory(ticket.id, req.user.id, 'Tester failed retest');
  await logHistory(ticket.id, null, 'Ticket reopened');
  res.json({ status: 'REOPENED' });
}));

module.exports = router;
