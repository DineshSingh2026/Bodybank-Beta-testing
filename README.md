# bodybank.fit — Beta Testing & Bug Tracker

A small ticketing app for the bodybank.fit beta. Testers report issues, Dinesh Singh
fixes them, testers retest, tickets close.

```
Tester reports  →  Dinesh fixes  →  Tester retests  →  Closed
                        ↑                  │
                        └──── Reopened ────┘  (if the retest fails)
```

**Stack:** HTML / CSS / vanilla JavaScript · Node.js + Express · PostgreSQL ·
email + password login · screenshot upload.

---

## What each person can do

**Tester** — signs in, sees only their own tickets, reports issues, comments,
retests fixes and marks them PASS or FAIL.

**Dinesh Singh** (the only developer) — signs in, sees every ticket, searches and
filters, comments, starts work, marks tickets fixed, and creates tester accounts.

There is no public signup. Dinesh adds each tester from the **Testers** page and
sends them their password.

---

## Ticket workflow

```
NEW  →  IN PROGRESS  →  FIXED  →  RETEST  →  CLOSED
                                    │
                                    └─ FAIL →  REOPENED  →  IN PROGRESS
```

"Mark as fixed" records the FIXED step and hands the ticket straight to the tester
as **RETEST** in one action, so nothing sits waiting to be forwarded. Every step is
written to the ticket's activity history.

---

## Run it locally

### 1. Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer

### 2. Install dependencies

```bash
cd bodybank-tracker
npm install
```

### 3. Create the database

macOS / Linux:

```bash
sudo -u postgres psql -c "CREATE USER bodybank WITH PASSWORD 'bodybank';"
sudo -u postgres psql -c "CREATE DATABASE bodybank_tracker OWNER bodybank;"
```

Windows (from the SQL Shell / psql prompt):

```sql
CREATE USER bodybank WITH PASSWORD 'bodybank';
CREATE DATABASE bodybank_tracker OWNER bodybank;
```

### 4. Configure

```bash
cp .env.example .env
```

Then edit `.env`:

```
DATABASE_URL=postgresql://bodybank:bodybank@localhost:5432/bodybank_tracker
JWT_SECRET=some-long-random-string
NODE_ENV=development
PORT=3000
DEVELOPER_EMAIL=dinesh@bodybank.fit
DEVELOPER_PASSWORD=pick-a-real-password
```

Generate a real secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 5. Create Dinesh's account

```bash
npm run db:setup
```

This creates the tables (if they are not already there) and the single developer
account from `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD`, then prints them.

> Safe to re-run. It never drops a table. Running it again after changing
> `DEVELOPER_PASSWORD` resets that password — that is how you recover a
> forgotten one.

### 6. Start the server

```bash
npm start
```

Open **http://localhost:3000** and sign in as Dinesh.

For development with auto-restart on file changes:

```bash
npm run dev
```

To let testers reach it from their phones on the same Wi-Fi, share your machine's
LAN address instead — for example `http://192.168.1.20:3000`. The interface is
built for phones as well as desktop.

---

## Deploying to Render

The repository ships with [`render.yaml`](render.yaml), so Render can build the
web service and the database together.

1. In Render, choose **New → Blueprint** and select this repository.
2. Render reads `render.yaml` and proposes a web service plus a PostgreSQL
   instance. `DATABASE_URL` is wired to the database automatically and
   `JWT_SECRET` is generated for you.
3. Fill in the one value it asks for: **`DEVELOPER_PASSWORD`**. Pick something
   long — it is the password for the only account that can see every ticket.
4. Click **Apply** and wait for the first deploy.
5. Open the service URL and sign in as `DEVELOPER_EMAIL` with that password.

There is no setup command to run. The server creates the tables and Dinesh's
account on startup, which matters because Render's free plan gives you no shell
to run one from.

Deploying again later needs no extra steps: pushing to the default branch
rebuilds, re-applies the schema harmlessly, and keeps all existing data.

### Forgotten the developer password?

Change `DEVELOPER_PASSWORD` in the service's **Environment** settings and save.
Render restarts the service, and the new password takes effect — the account is
reconciled against these environment variables on every boot. Changing
`DEVELOPER_EMAIL` renames the existing account rather than creating a second one.

### What makes it production-ready

- **`NODE_ENV=production` is set by the blueprint.** That turns on `Secure`
  session cookies and HSTS, and makes a weak or missing `JWT_SECRET` stop the
  boot rather than run wide open.
- **`trust proxy` is enabled**, because Render terminates HTTPS at its edge and
  forwards plain HTTP to the app.
- **TLS to the database** is switched on automatically for any non-local
  `DATABASE_URL`.
- **Screenshots live in PostgreSQL, not on disk.** Render replaces the
  container filesystem on every deploy, so anything written to a folder is
  gone the next time you ship. Storing them in the database also means one
  backup covers everything.
- **The developer account is created on boot** from `DEVELOPER_EMAIL` and
  `DEVELOPER_PASSWORD`, so a fresh deploy is signed into straight away and a
  forgotten password is recovered by editing an environment variable.
- **`/healthz`** runs a real query, so Render only routes traffic to an
  instance that can actually reach its database.
- **SIGTERM is handled**, so a redeploy finishes in-flight requests and closes
  the connection pool instead of dropping them.

### Free-plan notes

Render's free web services sleep after 15 minutes of inactivity, so the first
request after a quiet spell takes a few seconds to wake up. The free database
also expires after 90 days — move both to a paid plan if the beta runs longer
than that.

The free plan also has no **Shell** tab, which is why nothing here depends on
running a command against the deployed instance. Everything the app needs is
done at startup or through environment variables.

---

## Project layout

```
bodybank-tracker/
├── db/
│   └── schema.sql          tables, ticket-number sequence, indexes
├── src/
│   ├── server.js           Express app, static hosting, schema migration
│   ├── db.js               PostgreSQL pool
│   ├── auth.js             cookie session helpers and role guards
│   ├── async.js            wrapper that routes async failures to the error handler
│   ├── rate-limit.js       sign-in throttling
│   ├── upload.js           screenshot validation and database storage
│   ├── constants.js        modules, issue types, priorities, statuses
│   ├── setup-db.js         schema + developer account
│   └── routes/
│       ├── auth.js         login, logout, tester accounts
│       └── tickets.js      tickets, comments, workflow actions
├── public/
│   ├── index.html          sign in
│   ├── dashboard.html      tester dashboard
│   ├── report.html         report an issue
│   ├── ticket.html         ticket detail (both roles)
│   ├── developer.html      all tickets
│   ├── testers.html        manage tester accounts
│   ├── css/app.css
│   └── js/                 common, login, dashboard, report, ticket, developer, testers
└── render.yaml             Render blueprint
```

---

## Database

Five tables: `users`, `tickets`, `comments`, `ticket_history`, `files`.

Ticket numbers come from a PostgreSQL sequence, formatted as `BUG-0001`, so they
never collide and never repeat.

`comments` has its own `screenshot` column: when a tester fails a retest they can
attach an image showing what is still wrong, and it is stored with the comment.

`files` holds the screenshot bytes themselves. A ticket or comment stores the
path `/files/12`, which the server serves from the database — only to signed-in
users, since a bug report can show private account data.

`db/schema.sql` is written so that every statement creates only what is missing.
The server runs it on startup, which keeps a fresh deploy and a long-running one
on exactly the same schema without a migration tool.

---

## API

| Method | Path | Who | What it does |
| ------ | ---- | --- | ------------ |
| GET | `/healthz` | anyone | Health check used by Render |
| POST | `/api/auth/login` | anyone | Sign in (rate limited) |
| POST | `/api/auth/logout` | signed in | Sign out |
| GET | `/api/auth/me` | signed in | Current account |
| GET | `/api/auth/testers` | Dinesh | List testers |
| POST | `/api/auth/testers` | Dinesh | Create a tester account |
| GET | `/api/tickets` | signed in | List tickets — testers get only their own |
| GET | `/api/tickets/stats` | signed in | Dashboard counts |
| POST | `/api/tickets` | tester | Report an issue (multipart) |
| GET | `/api/tickets/:id` | signed in | Ticket, comments, history |
| POST | `/api/tickets/:id/comments` | signed in | Add a comment (multipart) |
| POST | `/api/tickets/:id/start` | Dinesh | NEW / REOPENED → IN PROGRESS |
| POST | `/api/tickets/:id/fix` | Dinesh | → FIXED → RETEST |
| POST | `/api/tickets/:id/pass` | tester | RETEST → CLOSED |
| POST | `/api/tickets/:id/fail` | tester | RETEST → REOPENED (multipart) |
| GET | `/files/:id` | signed in | A stored screenshot |

A tester requesting another tester's ticket gets a 404, not a 403 — the app does
not confirm that other people's tickets exist.

---

## Security notes

- Sessions are signed JWTs in an `httpOnly` cookie, marked `Secure` and
  `SameSite=Lax` in production. Passwords are hashed with bcrypt.
- Sign-in allows 10 attempts per IP per 15 minutes. A successful sign-in clears
  the counter.
- Sign-in takes the same time whether or not the email exists, so the response
  cannot be used to find out who has an account.
- Uploads are capped at 8 MB and accepted only when the leading bytes of the
  file really are a PNG, JPEG, GIF, or WebP — the browser's declared type is not
  trusted on its own.
- Screenshots require a session to view, and are served with a restrictive
  `Content-Security-Policy` so a crafted file cannot execute in the page.
- Back up the database. Everything, screenshots included, lives there.
