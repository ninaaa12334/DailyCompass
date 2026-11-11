import { parseEnv } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { generateVAPIDKeys } from 'web-push';

export function configurePushEnvironment(source, contact, generate = generateVAPIDKeys) {
  const email = String(contact).trim().replace(/^mailto:/i, '');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Enter a valid contact email address.');
  const env = parseEnv(source);
  if (Boolean(env.VAPID_PUBLIC_KEY) !== Boolean(env.VAPID_PRIVATE_KEY)) throw new Error('Only one notification key exists. Restore the matching pair before continuing; existing keys were not replaced.');
  const keys = env.VAPID_PUBLIC_KEY ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY } : generate();
  let text = source;
  for (const [name, value] of Object.entries({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: `mailto:${email}` })) {
    const line = `${name}=${value}`, pattern = new RegExp(`^${name}\\s*=.*$`, 'gm');
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const contact = await input.question('Contact email for browser push services (not an email reminder): ');
    const source = await readFile('.env', 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return readFile('.env.example', 'utf8'); });
    await writeFile('.env', configurePushEnvironment(source, contact), { mode: 0o600 });
    console.log('Notification keys saved in private .env. Existing key pairs were preserved. Restart npm.cmd start, then enable your device in Settings > Notifications.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { input.close(); }
}
