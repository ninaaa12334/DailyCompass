import { createClerkClient, verifyToken } from '@clerk/backend';
import { randomBytes, randomUUID } from 'node:crypto';
import { memoryModel } from './plans.mjs';

export function clerkConfiguration(config) {
  const key = config.CLERK_PUBLISHABLE_KEY || '';
  if (!key || !config.CLERK_SECRET_KEY) return null;
  if (!/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(key)) throw new Error('Invalid Clerk publishable key. Copy it from the Clerk dashboard.');
  const host = Buffer.from(key.replace(/^pk_(test|live)_/, ''), 'base64').toString('utf8').replace(/\$$/, '');
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !host.includes('.')) throw new Error('Invalid Clerk frontend domain.');
  return { publishableKey: key, frontendOrigin: `https://${host}` };
}

export function clerkSignIn(db, config, dependencies = {}) {
  const settings = clerkConfiguration(config);
  const verifier = dependencies.verifyToken || verifyToken;
  const client = settings ? (dependencies.client || createClerkClient({ secretKey: config.CLERK_SECRET_KEY, publishableKey: settings.publishableKey })) : null;
  return {
    settings,
    async exchange(token, timeZone = 'UTC') {
      if (!settings) throw Object.assign(new Error('Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to private .env, then restart the server.'), { status: 503 });
      if (typeof token !== 'string' || token.length > 16000 || !token) throw Object.assign(new Error('Missing Clerk session token.'), { status: 401 });
      new Intl.DateTimeFormat('en', { timeZone }).format();
      let claims;
      try {
        claims = await verifier(token, { secretKey: config.CLERK_SECRET_KEY, issuer: settings.frontendOrigin, authorizedParties: [config.APP_ORIGIN] });
        if (!claims.sub || !claims.sid || claims.azp !== config.APP_ORIGIN || claims.sts === 'pending') throw new Error('Incomplete session.');
        const session = await client.sessions.getSession(claims.sid);
        if (session.status !== 'active' || session.userId !== claims.sub) throw new Error('Inactive session.');
      } catch { throw Object.assign(new Error('Clerk sign-in expired or could not be verified. Please try again.'), { status: 401 }); }
      const linked = db.prepare("SELECT users.id,users.name FROM identities JOIN users ON users.id=identities.user_id WHERE provider='clerk' AND subject=?").get(claims.sub);
      if (linked) return { ...linked, externalSessionId: claims.sid, subject: claims.sub };
      const id = randomUUID(), name = `planner_${randomBytes(6).toString('hex')}`, state = memoryModel().snapshot(); state.settings.timeZone = timeZone;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO users VALUES(?,?,?)').run(id, name, `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`);
        db.prepare('INSERT INTO documents VALUES(?,?,?)').run(id, 0, JSON.stringify(state));
        db.prepare("INSERT INTO identities VALUES('clerk',?,?)").run(claims.sub, id); db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { id, name, externalSessionId: claims.sid, subject: claims.sub };
    },
    async active(externalId, subject) {
      if (!client) return false;
      try { const session = await client.sessions.getSession(externalId); return session.status === 'active' && session.userId === subject; } catch { return false; }
    }
  };
}
