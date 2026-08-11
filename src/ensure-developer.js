const bcrypt = require('bcryptjs');
const db = require('./db');

/**
 * Makes sure the single developer account exists and matches the credentials
 * in the environment.
 *
 * This runs on every boot because Render's free plan has no shell, so there is
 * no other way to create the account on a deployed instance. It also means
 * DEVELOPER_PASSWORD is the way to recover a forgotten password: change it in
 * the dashboard, redeploy, and the new one takes effect.
 *
 * The account is found by role rather than by email, so changing
 * DEVELOPER_EMAIL renames the existing account instead of leaving an
 * unreachable one behind.
 */
async function ensureDeveloper() {
  const email = (process.env.DEVELOPER_EMAIL || 'dinesh@bodybank.fit').trim().toLowerCase();
  const password = process.env.DEVELOPER_PASSWORD;
  const name = (process.env.DEVELOPER_NAME || 'Dinesh Singh').trim();

  if (!password) {
    console.warn('DEVELOPER_PASSWORD is not set, so the developer account cannot be created.');
    return { status: 'skipped' };
  }
  if (password.length < 8) {
    console.warn('DEVELOPER_PASSWORD is shorter than 8 characters and was ignored.');
    return { status: 'skipped' };
  }

  const { rows } = await db.query(
    `SELECT id, email, password FROM users WHERE role = 'developer' ORDER BY id LIMIT 1`
  );
  const existing = rows[0];

  try {
    if (!existing) {
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'developer')`,
        [name, email, hash]
      );
      console.log(`Developer account created for ${email}.`);
      return { status: 'created', email };
    }

    // Only write when something actually differs, so a normal restart is a
    // read and nothing more.
    const samePassword = await bcrypt.compare(password, existing.password);
    const sameEmail = existing.email.toLowerCase() === email;
    if (samePassword && sameEmail) {
      return { status: 'unchanged', email };
    }

    const hash = samePassword ? existing.password : await bcrypt.hash(password, 10);
    await db.query(`UPDATE users SET name = $1, email = $2, password = $3 WHERE id = $4`, [
      name, email, hash, existing.id,
    ]);
    console.log(`Developer account updated for ${email}.`);
    return { status: 'updated', email };
  } catch (err) {
    // A clash with a tester's address must not stop the app from starting.
    if (err.code === '23505') {
      console.error(`Cannot use ${email} for the developer account: another account already has it.`);
      return { status: 'conflict', email };
    }
    throw err;
  }
}

module.exports = { ensureDeveloper };
