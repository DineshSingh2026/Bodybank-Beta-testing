/**
 * Prepares the database and makes sure the developer account (Dinesh Singh)
 * exists with the password from .env.
 *
 *   npm run db:setup
 *
 * The server does both of these on startup as well, so this is only a way to
 * run them by hand and see the result. Safe to run as often as you like: it
 * creates only what is missing and never drops a table.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { ensureDeveloper } = require('./ensure-developer');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await db.query(sql);
    console.log('Tables are in place.');

    const result = await ensureDeveloper();
    if (result.status === 'skipped') {
      throw new Error('Set DEVELOPER_PASSWORD in .env to at least 8 characters first.');
    }
    if (result.status === 'conflict') {
      throw new Error(`${result.email} is already used by a tester account.`);
    }

    console.log('\nSign in as the developer with:');
    console.log('  Email:    ' + result.email);
    console.log('  Password: ' + process.env.DEVELOPER_PASSWORD);
    console.log('\nThen add tester accounts from the Testers page.');
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
})();
