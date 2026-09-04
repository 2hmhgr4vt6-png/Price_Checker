/**
 * Evo Store - Kathmandu Apple/electronics retailer, an authorised reseller.
 *
 * Server-rendered OpenCart storefront with its own theme: results sit in
 * `.common-item` cards holding `.name > p`, `.price > p` ("NPR 25,000") and a
 * link to the product page. No JavaScript needed, so this adapter works from
 * anywhere the site is reachable.
 */
import { getText } from '../http.js';
import { blocksWithClass, stripTags, attr } from '../html.js';
import { parsePrice } from '../price.js';

const ORIGIN = 'https://evostore.com.np';

export default {
  id: 'evostore',
  name: 'Evo Store',
  homepage: ORIGIN,
  kind: 'retailer',

  async search(query, { limit = 12, timeout } = {}) {
    const url = `${ORIGIN}/index.php?route=product/search&search=${encodeURIComponent(query)}`;
    const html = await getText(url, { timeout });

    return blocksWithClass(html, 'common-item', limit * 2)
      .map((block) => {
        const name = block.match(/<div class="name">\s*<p>([\s\S]*?)<\/p>/i);
        const price = block.match(/<div class="price">\s*<p>([\s\S]*?)<\/p>/i);
        if (!name || !price) return null;

        const parsed = parsePrice(stripTags(price[1]), 'NPR');
        const productName = stripTags(name[1]);
        if (!parsed || !productName) return null;

        const href = attr(block, 'href');
        return {
          productName,
          ...parsed,
          // Search links carry a `?search=` suffix; strip it for a clean URL.
          url: href ? href.split('?')[0] : ORIGIN,
          image: attr(block, 'src'),
          // The theme renders an "Add to Bag" action only for buyable items.
          availability: /add to bag/i.test(block) ? 'in_stock' : 'unknown',
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  },
};
