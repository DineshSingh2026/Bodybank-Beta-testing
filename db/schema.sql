-- bodybank.fit beta tracker schema
--
-- This file is safe to run repeatedly. It only ever creates what is missing,
-- so it runs on every boot and never touches data that is already there.

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('tester', 'developer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email is matched case-insensitively at login, so the uniqueness rule has to
-- be case-insensitive too, or two accounts could differ only by capitals.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

-- Screenshots live in the database rather than on disk: Render replaces the
-- container's filesystem on every deploy, which would silently lose them.
CREATE TABLE IF NOT EXISTS files (
  id         SERIAL PRIMARY KEY,
  data       BYTEA NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id              SERIAL PRIMARY KEY,
  ticket_number   TEXT NOT NULL UNIQUE
                  DEFAULT ('BUG-' || lpad(nextval('ticket_number_seq')::text, 4, '0')),
  title           TEXT NOT NULL,
  issue_type      TEXT NOT NULL,
  module          TEXT NOT NULL,
  priority        TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  description     TEXT,
  steps           TEXT,
  expected_result TEXT,
  actual_result   TEXT,
  screenshot      TEXT,
  device          TEXT,
  app_version     TEXT,
  status          TEXT NOT NULL DEFAULT 'NEW'
                  CHECK (status IN ('NEW', 'IN PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'CLOSED')),
  tester_id       INTEGER NOT NULL REFERENCES users(id),
  developer_id    INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_tester  ON tickets(tester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status  ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  comment    TEXT NOT NULL,
  screenshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_history (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_ticket ON ticket_history(ticket_id);
