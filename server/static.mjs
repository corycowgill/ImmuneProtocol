import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'], ['.wav', 'audio/wav'], ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'], ['.woff2', 'font/woff2'],
]);

function readRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && start <= end ? { start, end } : null;
}

export async function serveStatic(request, response, root, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const filePath = resolve(root, '.' + pathname);
  const fromRoot = relative(root, filePath);
  if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep) ||
      /[\\\x00]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
    response.writeHead(404).end();
    return;
  }

  let file = filePath;
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      response.writeHead(308, { Location: url.pathname + '/' + url.search }).end();
      return;
    }
    file = resolve(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  const type = CONTENT_TYPES.get(extname(file));
  if (!info?.isFile() || !type) {
    response.writeHead(404).end('Not found');
    return;
  }

  const headers = {
    'Content-Type': type,
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache',
    'ETag': `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
    'Accept-Ranges': 'bytes',
  };
  if (request.headers['if-none-match'] === headers.ETag && !request.headers.range) {
    response.writeHead(304, headers).end();
    return;
  }
  const range = request.headers.range ? readRange(request.headers.range, info.size) : null;
  if (request.headers.range && !range) {
    response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    return;
  }
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
  headers['Content-Length'] = range ? range.end - range.start + 1 : info.size;
  if (response.destroyed) return;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file, range ?? {});
  response.on('close', () => stream.destroy());
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}
