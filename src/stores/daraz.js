/**
 * Daraz Nepal - the largest marketplace in the country.
 *
 * Daraz's search page is server-rendered from an internal JSON endpoint that
 * the same page calls with `ajax=true`. It needs no key and returns the fields
 * we care about (title, price, stock, seller, canonical URL) already parsed,
 * so no HTML scraping is required.
 */
import { getJson } from '../http.js';
import { parsePrice } from '../price.js';

async function fetchPage(query, sort, timeout) {
  const url =
    `https://www.daraz.com.np/catalog/?ajax=true&q=${encodeURIComponent(query)}` +
    (sort ? `&sort=${sort}` : '');
  const data = await getJson(url, {
    timeout,
    headers: { 'x-requested-with': 'XMLHttpRequest', Referer: 'https://www.daraz.com.np/' },
  });
  return data?.mods?.listItems ?? [];
}

export default {
  id: 'daraz',
  name: 'Daraz Nepal',
  homepage: 'https://www.daraz.com.np',
  kind: 'marketplace',

  async search(query, { limit = 24, timeout } = {}) {
    // Daraz's default ranking buries real handsets under cheap accessories
    // (searching "iPhone 14 128GB" returns pages of phone cases), so the
    // relevance page and the price-descending page are merged. Together they
    // reliably contain the actual device when the marketplace stocks it.
    const pages = await Promise.allSettled([
      fetchPage(query, '', timeout),
      fetchPage(query, 'pricedesc', timeout),
    ]);

    const items = [];
    const seen = new Set();
    for (const page of pages) {
      if (page.status !== 'fulfilled') continue;
      for (const item of page.value) {
        const key = item.itemId ?? item.nid ?? item.name;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }

    if (!items.length && pages.every((page) => page.status === 'rejected')) {
      throw pages[0].reason;
    }

    return items.slice(0, limit).map((item) => {
      const price = parsePrice(item.price ?? item.priceShow, 'NPR');

      return {
        productName: String(item.name ?? '').trim(),
        ...price,
        url: item.itemUrl?.startsWith('//') ? `https:${item.itemUrl}` : item.itemUrl,
        image: item.image ?? null,
        // Daraz only sets inStock on in-stock rows; absent means "not stated".
        availability: item.inStock === true ? 'in_stock' : item.inStock === false ? 'out_of_stock' : 'unknown',
        seller: item.sellerName?.trim() || null,
        rating: item.ratingScore ? Number(item.ratingScore) : null,
      };
    });
  },
};
