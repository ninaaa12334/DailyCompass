import { createApplication } from '../server/app.mjs';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.argv[2] || process.env.PORT || 8080);
const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
const app = createApplication({ config: { APP_ORIGIN: origin } });
const host = process.env.HOST || '127.0.0.1';
app.server.listen(port, host, () => {
  console.log(`Day Compass: ${origin}`);
  if (host !== '0.0.0.0') return;
  const allowed = String(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  for (const address of Object.values(networkInterfaces()).flat()) {
    if (address.family !== 'IPv4' || address.internal) continue;
    const lan = `http://${address.address}:${port}`;
    console.log(`  Home network: ${lan}${allowed.includes(lan) ? '' : '  (add to ALLOWED_ORIGINS in .env to allow saving from this address)'}`);
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.close(); process.exit(0); }));
