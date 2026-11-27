-- One row per browser/device that turned notifications on.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,          -- SHA-256 of the device's secret token (the token itself is only on the device)
  endpoint TEXT NOT NULL UNIQUE,     -- the browser's push address
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
-- Upcoming reminders for each device. Rows are deleted once sent.
CREATE TABLE IF NOT EXISTS reminders (
  device_id TEXT NOT NULL,
  key TEXT NOT NULL,
  due INTEGER NOT NULL,              -- when to send (milliseconds since 1970, UTC)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (device_id, key)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (due);

-- Google Calendar (read-only): one connection per Day Compass account, refresh token encrypted.
CREATE TABLE IF NOT EXISTS google_links (
  user_id TEXT PRIMARY KEY,          -- Supabase user id
  email TEXT NOT NULL DEFAULT '',
  refresh_enc TEXT NOT NULL,
  iv TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
-- Short-lived "who started this connection" records for the Google redirect.
CREATE TABLE IF NOT EXISTS google_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- Sign-in with Google through this service (added later; run once on existing databases):
-- ALTER TABLE google_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'connect';
-- ALTER TABLE google_states ADD COLUMN nonce TEXT NOT NULL DEFAULT '';

-- How often each person used the AI photo reader (rate limit). Also created automatically on first use.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  last INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);
