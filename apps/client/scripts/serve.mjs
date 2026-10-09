// Serves the built client (dist/) in production, e.g. on Railway.
//
//   pnpm --filter @pirate/client build
//   PORT=8080 pnpm --filter @pirate/client start
//
// Plain Node, no dependencies, so it behaves the same on every OS. Listens on
// $PORT (Railway sets it) and on all interfaces. Unknown paths fall back to
// index.html so the single-page app can handle them.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number.parseInt(process.env.PORT ?? '4173', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(join(root, normalize(decoded)));
  // Never serve anything outside dist/.
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  try {
    const info = await stat(candidate);
    if (info.isFile()) {
      return candidate;
    }
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      if ((await stat(index)).isFile()) {
        return index;
      }
    }
  } catch {
    // Not found: fall through to the single-page-app fallback.
  }
  return null;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  try {
    let file = await fileFor(request.url ?? '/');
    const isAsset = file !== null;
    // A missing file with an extension is a real 404; anything else is an app route.
    if (!file) {
      if (extname(request.url?.split('?')[0] ?? '') !== '') {
        response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      file = join(root, 'index.html');
    }

    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Vite names build output like index-DuF7oGfp.js: the hash changes with the
    // content, so those files can be cached forever. Other files (e.g. the art
    // in assets/kenney) keep their names and must be revalidated.
    const hashed = isAsset && /-[\w-]{8,}\.\w+$/.test(file);
    response.writeHead(200, {
      'Content-Type': type,
      // Hashed build output never changes; the page itself must stay fresh.
      'Cache-Control': hashed
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
    console.error(error);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} on http://0.0.0.0:${port}`);
});
