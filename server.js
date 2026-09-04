/**
 * Nepali Price Checker - HTTP server.
 *
 * Zero runtime dependencies: node:http serves the static front-end from
 * public/ and exposes a small JSON API that the page calls on every search.
 *
 *   GET /api/search?q=<product>[&fresh=1]  live multi-store comparison
 *   GET /api/stores                        registry + why a store is skipped
 *   GET /api/health                         liveness probe
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchAllStores } from './src/search.js';
import { stores, enabledStores } from './src/stores/index.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
};

async function serveStatic(res, pathname) {
  // normalize() + the prefix check keep "../" out of the served path.
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=300',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, stores: enabledStores().length, uptime: process.uptime() });
  }

  if (url.pathname === '/api/stores') {
    const active = new Set(enabledStores().map((store) => store.id));
    return sendJson(res, 200, {
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        homepage: store.homepage,
        kind: store.kind ?? 'retailer',
        enabled: active.has(store.id),
        requiresCredentials: store.requiresCredentials ?? null,
      })),
    });
  }

  if (url.pathname === '/api/search') {
    const query = url.searchParams.get('q') ?? '';
    try {
      const payload = await searchAllStores(query, { fresh: url.searchParams.get('fresh') === '1' });
      return sendJson(res, 200, payload);
    } catch (error) {
      const status = error.statusCode ?? 500;
      if (status >= 500) console.error('[search] failed:', error);
      return sendJson(res, status, { error: error.message });
    }
  }

  return serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Nepali Price Checker running at http://localhost:${PORT}`);
  console.log(`Live stores: ${enabledStores().map((store) => store.name).join(', ')}`);
});
