import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../../server/static.mjs';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const port = Number(process.env.PORT || 8027);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const page = { '/__mobile': './mobile-loading.html', '/__loading-qa': './verify-loading.html', '/__profile': './profile.html', '/__ai': './ai-combat.html', '/__bosses': './boss-combat.html', '/__hitches': './hitches.html', '/__overview': './overview.html', '/__armory': './armory-check.html' }[url.pathname];
    if (page) {
      const html = await readFile(new URL(page, import.meta.url));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
    } else await serveStatic(request, response, root, url);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Verification server error');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port}/__loading-qa to verify upfront preparation.`));
