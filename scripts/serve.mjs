import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.') || part === 'node_modules') || !mime[path.extname(file)]) throw new Error('Not found');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(Number(process.argv[2] || 8080), '127.0.0.1', () => console.log(`Day Compass: http://127.0.0.1:${process.argv[2] || 8080}`));
