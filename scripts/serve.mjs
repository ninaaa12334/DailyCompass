import { createApplication } from '../server/app.mjs';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.argv[2] || process.env.PORT || 8080);
const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
const app = createApplication({ config: { APP_ORIGIN: origin } });
app.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Day Compass: ${origin}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.close(); process.exit(0); }));
