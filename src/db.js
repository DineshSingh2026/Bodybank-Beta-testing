require('dotenv').config();
const { Pool } = require('pg');

const CONNECTION = process.env.DATABASE_URL;
if (!CONNECTION) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Hosted Postgres (Render, Neon, Supabase) requires TLS and presents a
// certificate signed by its own internal CA, so verification is turned off
// while the transport itself stays encrypted. A local database needs neither.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(CONNECTION);
const useSsl = process.env.PGSSL ? process.env.PGSSL === 'true' : !isLocal;

const pool = new Pool({
  connectionString: CONNECTION,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// A dropped backend arrives as an error on an idle client, not on a query.
// Without this listener it is an unhandled 'error' event, which kills Node.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
