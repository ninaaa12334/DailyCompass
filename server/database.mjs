import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function database(filename = 'data/compass.sqlite', secret = process.env.TOKEN_ENCRYPTION_KEY) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  if (!secret) {
    if (filename === ':memory:') secret = randomBytes(32).toString('base64');
    else { const file = path.join(path.dirname(filename), 'token.key'); if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' }); secret = readFileSync(file, 'utf8').trim(); }
  }
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64.');
  const db = new DatabaseSync(filename); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, version INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, service TEXT NOT NULL, tokens TEXT NOT NULL, PRIMARY KEY(user_id,service));
    CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_hash TEXT NOT NULL, service TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(user_id,endpoint));
    CREATE TABLE IF NOT EXISTS deliveries(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, body TEXT NOT NULL, due INTEGER NOT NULL, start INTEGER NOT NULL, status TEXT NOT NULL, error TEXT, PRIMARY KEY(user_id,key));
    CREATE TABLE IF NOT EXISTS push_tests(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(user_id,key));
    CREATE TABLE IF NOT EXISTS push_receipts(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, received INTEGER NOT NULL, display_requested INTEGER, error TEXT, PRIMARY KEY(user_id,key));
    CREATE TABLE IF NOT EXISTS history(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mail_reviews(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS login_oauth(state TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, time_zone TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS clerk_sessions(hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE, external_id TEXT NOT NULL, subject TEXT NOT NULL);`);
  return {
    db,
    seal(value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64'); },
    open(value) { const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString()); }
  };
}
