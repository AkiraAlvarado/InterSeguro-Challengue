import { createServer, request as createRequest } from 'node:http';
import { request as createHttpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '5173', 10);
const goApiURL = normalizeServiceURL(process.env.GO_API_URL ?? 'http://localhost:8080');
const nodeApiURL = normalizeServiceURL(process.env.NODE_API_URL ?? 'http://localhost:3000');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function normalizeServiceURL(serviceURL) {
  return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(serviceURL) ? serviceURL : `http://${serviceURL}`);
}

function proxyRequest(request, response, apiName, targetURL) {
  const prefix = `/api/${apiName}`;
  const targetPath = request.url.slice(prefix.length) || '/';
  const transport = targetURL.protocol === 'https:' ? createHttpsRequest : createRequest;
  const upstream = transport(new URL(targetPath, targetURL), {
    method: request.method,
    headers: { ...request.headers, host: targetURL.host },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', (error) => {
    console.error(`Fallo al conectar con ${apiName}:`, error.message);
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'El servicio solicitado no está disponible.' }));
  });
  request.pipe(upstream);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"status":"ok","service":"frontend"}');
    return;
  }
  if (pathname.startsWith('/api/go/')) {
    proxyRequest(request, response, 'go', goApiURL);
    return;
  }
  if (pathname.startsWith('/api/node/')) {
    proxyRequest(request, response, 'node', nodeApiURL);
    return;
  }
  if (pathname === '/config.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('window.APP_CONFIG = {};');
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
