/**
 * Small HTTP helper shared by every store adapter.
 *
 * Adapters must never crash the whole search, so everything here either
 * resolves with data or throws a plain Error that the orchestrator catches
 * and turns into a "store skipped" status.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * fetch() with a hard timeout, a browser-ish User-Agent and one retry on
 * transient network failures. Nepali store front-ends sit behind CDNs that
 * reset connections at random, so a single retry meaningfully improves the
 * hit rate without slowing the page down.
 */
export async function request(url, { timeout = 9000, headers = {}, retries = 2, method = 'GET', body } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        body,
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept-Language': 'en-US,en;q=0.9,ne;q=0.8',
          ...headers,
        },
      });

      if (!res.ok) throw new HttpError(res.status, url);
      return res;
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error(`Timed out after ${timeout}ms`) : err;

      // 4xx (other than rate limiting) is a definitive answer - retrying is
      // pointless. 429/5xx and dropped connections are worth one more go:
      // the big Nepali storefronts sit behind CDNs that shed load at random.
      const retryable = !(lastError instanceof HttpError)
        || lastError.status === 429
        || lastError.status >= 500;
      if (!retryable || attempt === retries) break;

      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export async function getJson(url, options = {}) {
  const res = await request(url, {
    ...options,
    headers: { Accept: 'application/json, text/plain, */*', ...(options.headers || {}) },
  });
  return res.json();
}

/** POST a JSON body and parse a JSON response. */
export async function postJson(url, body, options = {}) {
  const res = await request(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      ...(options.headers || {}),
    },
  });
  return res.json();
}

export async function getText(url, options = {}) {
  const res = await request(url, {
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(options.headers || {}),
    },
  });
  return res.text();
}
