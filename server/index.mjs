import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { COOP_HEALTH_PATH, COOP_PATH, COOP_PROTOCOL_VERSION, COOP_SERVICE } from '../dist/coop-protocol.mjs';
import { CoopRooms } from './rooms.mjs';
import { serveStatic } from './static.mjs';

const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const maxConnections = 128;

function matchesOrigin(request, origin) {
  if (!request.headers.origin) return true;
  try {
    const source = new URL(request.headers.origin);
    return (source.protocol === 'http:' || source.protocol === 'https:') &&
      (source.host === request.headers.host || source.origin === origin);
  } catch {
    return false;
  }
}

export function createCoopServer(options = {}) {
  const rooms = new CoopRooms(options);
  const websocket = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: {
      // Each state packet repeats most of the last one, so the server keeps its compression window
      // between messages: about 1.5 KB a packet instead of 3.3 KB, for ~256 KB of memory a socket.
      serverNoContextTakeover: false,
      clientNoContextTakeover: true,
      concurrencyLimit: 4,
      threshold: 1024,
      zlibDeflateOptions: { level: 1 },
    },
  });
  const http = createServer((request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
      response.writeHead(400).end();
      return;
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === COOP_HEALTH_PATH) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ok: true, service: COOP_SERVICE, protocol: COOP_PROTOCOL_VERSION }));
      return;
    }
    serveStatic(request, response, staticRoot, url).catch(() => {
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
  });

  http.on('upgrade', (request, socket, head) => {
    if (request.url?.split('?')[0] !== COOP_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!matchesOrigin(request, options.origin ?? process.env.RENDER_EXTERNAL_URL)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (websocket.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    websocket.handleUpgrade(request, socket, head, client => rooms.connect(client));
  });
  const heartbeat = setInterval(() => {
    for (const client of websocket.clients) {
      if (client.alive === false) client.terminate();
      else {
        client.alive = false;
        client.ping();
      }
    }
  }, 12_000).unref();

  async function close() {
    clearInterval(heartbeat);
    rooms.close();
    for (const client of websocket.clients) client.terminate();
    websocket.close();
    await new Promise(resolve => http.close(resolve));
  }
  return { http, close };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const port = Number(process.env.PORT ?? 8017);
  const host = process.env.HOST ?? (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  const server = createCoopServer();
  server.http.listen(port, host, () => console.log(`Immune Protocol listening on http://${host}:${server.http.address().port}`));
  process.once('SIGINT', () => server.close());
  process.once('SIGTERM', () => server.close());
}
