import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '5173', 10);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/config.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`window.APP_CONFIG = ${JSON.stringify({ goApiUrl: process.env.GO_API_URL ?? 'http://localhost:8080', nodeApiUrl: process.env.NODE_API_URL ?? 'http://localhost:3000' })};`);
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(root, relativePath);
  if (!filePath.startsWith(resolve(root))) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Matrix QR UI listening on :${port}`));
