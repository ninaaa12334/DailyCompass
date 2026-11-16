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
