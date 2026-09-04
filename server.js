/**
 * Nepali Price Checker - HTTP server.
 *
 * Zero runtime dependencies: node:http serves the static front-end from
 * public/ and exposes a small JSON API that the page calls on every search.
 *
 *   GET /api/search?q=<product>[&fresh=1]  live multi-store comparison
 *   GET /api/stores                        registry + why a store is skipped
 *   GET /api/airports?q=<term>             airport autocomplete for flights
 *   GET /api/flights?from=&to=&date=       live flight fare comparison
 *   GET /api/health                        liveness probe
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchAllStores } from './src/search.js';
import { searchFlights } from './src/flightsearch.js';
import { searchAirports, searchAirportsLive } from './src/airports.js';
import { flightProviders } from './src/flights/index.js';
import { stores, enabledStores } from './src/stores/index.js';
import { closeBrowser } from './src/browser.js';

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
    return sendJson(res, 200, {
      ok: true,
      stores: enabledStores().length,
      flightProviders: flightProviders.length,
      uptime: process.uptime(),
    });
  }

  // Airport autocomplete for the flight form's From/To fields.
  //
  // The default answers from the bundled dataset only, so suggestions appear
  // as fast as they can be typed. `live=1` additionally queries an upstream
  // airport directory, which can take a second - the front-end asks for that
  // only when the bundled list came back empty, so a slow upstream call can
  // never delay the common case.
  if (url.pathname === '/api/airports') {
    const term = url.searchParams.get('q') ?? '';
    const airports = url.searchParams.get('live') === '1'
      ? await searchAirportsLive(term, 8)
      : searchAirports(term, 8);
    return sendJson(res, 200, { airports });
  }

  if (url.pathname === '/api/flights') {
    try {
      const payload = await searchFlights(Object.fromEntries(url.searchParams), {
        fresh: url.searchParams.get('fresh') === '1',
      });
      return sendJson(res, 200, payload);
    } catch (error) {
      const status = error.statusCode ?? 500;
      if (status >= 500) console.error('[flights] failed:', error);
      return sendJson(res, status, { error: error.message });
    }
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

// The shared headless browser outlives individual requests, so shut it down
// with the server rather than leaking a Chromium process.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await closeBrowser();
    process.exit(0);
  });
}

// A stale `npm start` in another terminal is the usual cause here, and the
// raw EADDRINUSE stack trace tells nobody that.
server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error;

  console.error(`\nPort ${PORT} is already in use — most likely an earlier "npm start" is still running.`);
  console.error('That old process serves the previous version of the code, so reusing it hides your changes.');
  console.error('\nStop it, then start again:');
  console.error(`  lsof -ti:${PORT} | xargs kill      # macOS / Linux`);
  console.error('  npm start');
  console.error(`\nOr run this one somewhere else:  PORT=${PORT + 1} npm start\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Nepali Price Checker running at http://localhost:${PORT}`);
  console.log(`Live stores: ${enabledStores().map((store) => store.name).join(', ')}`);
  console.log(`Flight providers: ${flightProviders.map((provider) => provider.name).join(', ')}`);
});
