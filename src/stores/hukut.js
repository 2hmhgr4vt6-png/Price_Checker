/**
 * Hukut - large Nepali electronics retailer.
 *
 * The storefront is a Next.js SPA whose search page ships no prices, so this
 * looked like it needed headless rendering. It does not: the app talks to a
 * public, unauthenticated endpoint that its own bundle names -
 *
 *   POST https://hukut.com/api-server/v1/product/list-elastic  { searchText }
 *
 * which returns clean rows with name, slug, price and stock status. Using it
 * means Hukut works over plain HTTP, with no browser and no 30-second render.
 */
import { postJson } from '../http.js';

const ORIGIN = 'https://hukut.com';
const SEARCH_API = `${ORIGIN}/api-server/v1/product/list-elastic`;

// Hukut's own vocabulary for stock state.
const AVAILABILITY = {
  inStock: 'in_stock',
  outOfStock: 'out_of_stock',
  preOrder: 'unknown',
};

export default {
  id: 'hukut',
  name: 'Hukut',
  homepage: ORIGIN,
  kind: 'retailer',

  async search(query, { limit = 12, timeout } = {}) {
    const payload = await postJson(
      SEARCH_API,
      { searchText: query, pagination: { limit, offset: 0 } },
      { timeout, headers: { Referer: `${ORIGIN}/` } },
    );

    const rows = payload?.data?.rows ?? [];

    return rows.slice(0, limit).map((row) => {
      const variant = row.defaultVariant ?? {};
      // sellingPrice / salePrice are set only while a discount is running;
      // price is the standing figure.
      const amount = Number(variant.sellingPrice ?? variant.salePrice ?? variant.price ?? row.sortablePrice);
      const status = variant.marketStatus ?? row.marketStatus;

      if (!Number.isFinite(amount) || amount <= 0) return null;

      return {
        productName: row.name,
        amount,
        currency: 'NPR',
        url: row.slug ? `${ORIGIN}/product/${row.slug}` : ORIGIN,
        image: row.image ?? null,
        availability: AVAILABILITY[status] ?? 'unknown',
        rating: row.averageRating ? Number(row.averageRating) : null,
        note: status === 'preOrder' ? 'Pre-order' : null,
      };
    }).filter(Boolean);
  },
};
