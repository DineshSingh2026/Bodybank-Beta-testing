require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const asyncRoute = require('./async');
const { readUser, requireLogin } = require('./auth');
const { getFile } = require('./upload');
const { ensureDeveloper } = require('./ensure-developer');
const constants = require('./constants');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');

const app = express();
const PORT = process.env.PORT || 3000;
const PRODUCTION = process.env.NODE_ENV === 'production';

// Render terminates TLS at its edge and forwards over HTTP. Without this the
// app sees an insecure connection and refuses to set the `secure` cookie,
// which would make signing in impossible.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(readUser);

// Render polls this to decide whether the instance is healthy.
app.get('/healthz', asyncRoute(async (_req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok' });
}));

// Screenshots are private to the people working the ticket, so they are served
// through the app rather than as public static files.
app.get('/files/:id', requireLogin, asyncRoute(async (req, res) => {
  const file = await getFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'That file does not exist.' });

  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(file.data);
}));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  // The markup, styles, and scripts are revalidated on every request so a
  // deploy is never served as new HTML against a stale stylesheet. ETags make
  // that a 304 in the normal case, so it costs a round trip and no body.
  // Images and fonts change far less often and are held for a day.
  setHeaders: (res, filePath) => {
    const longLived = /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(filePath);
    res.setHeader('Cache-Control', longLived ? 'public, max-age=86400' : 'no-cache');
  },
}));

app.get('/api/meta', (_req, res) => res.json(constants));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

// Anything else is a mistyped URL; send people to the sign-in page.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Errors (including multer upload failures) come back as JSON the UI can show.
app.use((err, _req, res, _next) => {
  console.error(err);
  const tooBig = err.code === 'LIMIT_FILE_SIZE';
  const badUpload = tooBig || /image|screenshot/i.test(err.message || '');
  const status = tooBig ? 413 : badUpload ? 400 : 500;
  res.status(status).json({
    error: tooBig
      ? 'That screenshot is larger than 8 MB.'
      : badUpload
        ? err.message
        : PRODUCTION
          ? 'Something went wrong. Please try again.'
          : err.message || 'Something went wrong.',
  });
});

/**
 * Applies the schema before accepting traffic. Every statement is written to
 * create only what is missing, so this is a no-op once the tables exist and a
 * deploy never risks the data.
 */
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Database schema is up to date.');
}

(async () => {
  try {
    await migrate();
    await ensureDeveloper();
  } catch (err) {
    console.error('Could not prepare the database:', err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`bodybank beta tracker running on port ${PORT}`);
    if (!PRODUCTION) console.log(`  http://localhost:${PORT}`);
  });

  // Render sends SIGTERM on redeploy; finishing in-flight requests and closing
  // the pool avoids dropped responses and leaked connections.
  const shutdown = (signal) => () => {
    console.log(`${signal} received, shutting down.`);
    server.close(() => db.pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
})();
