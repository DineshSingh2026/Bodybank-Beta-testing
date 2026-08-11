/**
 * Prepares the database and makes sure the developer account (Dinesh Singh)
 * exists with the password from .env.
 *
 *   npm run db:setup
 *
 * Safe to run as often as you like: it creates only what is missing and never
 * drops a table. Re-running it after changing DEVELOPER_PASSWORD resets that
 * password, which is how you recover a forgotten one.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEV_NAME = 'Dinesh Singh';
const DEV_EMAIL = (process.env.DEVELOPER_EMAIL || 'dinesh@bodybank.fit').trim().toLowerCase();
const DEV_PASSWORD = process.env.DEVELOPER_PASSWORD;

(async () => {
  try {
    if (!DEV_PASSWORD || DEV_PASSWORD.length < 8) {
      throw new Error('Set DEVELOPER_PASSWORD in .env to at least 8 characters first.');
    }

    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await db.query(sql);
    console.log('Tables are in place.');

    const hash = await bcrypt.hash(DEV_PASSWORD, 10);
    const existing = await db.query(`SELECT id FROM users WHERE lower(email) = $1`, [DEV_EMAIL]);

    if (existing.rowCount) {
      await db.query(`UPDATE users SET name = $1, password = $2, role = 'developer' WHERE id = $3`, [
        DEV_NAME, hash, existing.rows[0].id,
      ]);
      console.log('\nDeveloper account updated:');
    } else {
      await db.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'developer')`,
        [DEV_NAME, DEV_EMAIL, hash]
      );
      console.log('\nDeveloper account created:');
    }

    console.log('  Email:    ' + DEV_EMAIL);
    console.log('  Password: ' + DEV_PASSWORD);
    console.log('\nSign in as Dinesh and add tester accounts from the Testers page.');
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
})();
