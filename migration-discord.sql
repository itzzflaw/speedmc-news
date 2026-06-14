-- Migration: add Discord OAuth + verified Minecraft linking fields.
-- Only run this if you already created the `users` table from an
-- earlier version of schema.sql. If you haven't deployed yet, just
-- use the updated schema.sql instead — you don't need this file.
--
-- SQLite can't change NOT NULL/UNIQUE on existing columns directly,
-- so this rebuilds the users table.

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  discord_avatar TEXT,
  mc_username TEXT,
  mc_uuid TEXT,
  mc_verified INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL
);

INSERT INTO users_new (id, email, password_hash, mc_username, mc_uuid, role, created_at)
SELECT id, email, password_hash, mc_username, mc_uuid, role, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
