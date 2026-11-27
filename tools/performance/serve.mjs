import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../../server/static.mjs';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const port = Number(process.env.PORT || 8027);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const fixtures = { '/__hud': './hud-check.mjs', '/__ui': './ui-check.mjs', '/__keys': './keys-check.mjs', '/__play': './play-check.mjs', '/__look': './look-check.mjs' };
    if (fixtures[url.pathname]) {
      const html = (await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8'))
        .replace(/<script src="intro\/[^\"]+"><\/script>/g, '')
        .replace('src="boot.mjs"', `src="${url.pathname}.mjs"`);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
      return;
    }
    const script = fixtures[url.pathname.replace(/\.mjs$/, '')];
    if (url.pathname.endsWith('.mjs') && script) {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(await readFile(new URL(script, import.meta.url)));
      return;
    }
    const page = { '/__rogue-bot': './rogue-bot.html', '/__nanonaut': './nanonaut.html', '/__mobile': './mobile-loading.html', '/__loading-qa': './verify-loading.html', '/__profile': './profile.html', '/__ai': './ai-combat.html', '/__bosses': './boss-combat.html', '/__hitches': './hitches.html', '/__overview': './overview.html', '/__armory': './armory-check.html', '/__deaths': './deaths.html', '/__hazards': './hazards.html', '/__abilities': './abilities.html' }[url.pathname];
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
