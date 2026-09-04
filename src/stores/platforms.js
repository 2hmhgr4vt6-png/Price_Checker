/**
 * Reusable search routines for the three e-commerce platforms most Nepali
 * shops run on. A store adapter is then usually a 5-line config object.
 *
 * Each routine returns raw listings; normalisation (relevance filtering,
 * currency conversion, sorting) happens once in ../search.js.
 */
import { getJson, getText } from '../http.js';
import { attr, blocksWithClass, stripTags } from '../html.js';
import { parsePrice } from '../price.js';

const absolute = (origin, href) => {
  if (!href) return null;
  if (href.startsWith('//')) return `https:${href}`;
  if (/^https?:/i.test(href)) return href;
  return `${origin.replace(/\/$/, '')}/${href.replace(/^\//, '')}`;
};

/**
 * Shopify exposes a public, CORS-friendly predictive-search endpoint on every
 * storefront. No key required, and it already returns structured JSON.
 */
export async function searchShopify(origin, query, { limit = 10, timeout } = {}) {
  const url =
    `${origin}/search/suggest.json?q=${encodeURIComponent(query)}` +
    `&resources%5Btype%5D=product&resources%5Blimit%5D=${limit}`;
  const data = await getJson(url, { timeout });
  const products = data?.resources?.results?.products ?? [];

  return products.map((product) => ({
    productName: product.title,
    ...(parsePrice(product.price, 'NPR') ?? {}),
    url: absolute(origin, product.url),
    image: product.image ?? product.featured_image?.url ?? null,
    availability: product.available === true ? 'in_stock' : product.available === false ? 'out_of_stock' : 'unknown',
  }));
}

/**
 * WooCommerce ships a read-only Store API (no auth) from WooCommerce 5.x on.
 * Falls back to scraping the shop's search page when the endpoint is disabled.
 */
export async function searchWooCommerce(origin, query, { limit = 10, timeout } = {}) {
  try {
    const url = `${origin}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=${limit}`;
    const products = await getJson(url, { timeout });

    if (Array.isArray(products) && products.length) {
      return products.map((product) => ({
        productName: stripTags(product.name ?? ''),
        // Store API returns minor units: 149900 with minor_unit 2 => 1499.00
        amount: Number(product.prices?.price) / 10 ** (product.prices?.currency_minor_unit ?? 0),
        currency: product.prices?.currency_code || 'NPR',
        url: product.permalink,
        image: product.images?.[0]?.src ?? null,
        availability: product.is_in_stock === true ? 'in_stock' : product.is_in_stock === false ? 'out_of_stock' : 'unknown',
      }));
    }
  } catch {
    // Store API off or blocked - fall through to the HTML shop page.
  }

  const html = await getText(`${origin}/?s=${encodeURIComponent(query)}&post_type=product`, { timeout });
  return blocksWithClass(html, 'product', limit * 3)
    .map((block) => {
      const priceHtml = block.match(/<(?:span|bdi|p)[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|bdi|p)>/i);
      const price = parsePrice(priceHtml ? stripTags(priceHtml[1]) : null, 'NPR');
      const link = block.match(/<a[^>]+href="([^"]+)"/i);
      const title = block.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
      if (!price || !link || !title) return null;

      return {
        productName: stripTags(title[1]),
        ...price,
        url: absolute(origin, link[1]),
        image: attr(block, 'src'),
        availability: /out[\s-]?of[\s-]?stock/i.test(block) ? 'out_of_stock' : 'unknown',
      };
    })
    .filter(Boolean);
}

/**
 * Magento 2 storefronts (SastoDeal among them) render search results server
 * side under `.product-item`, with structured data on the price node.
 */
export async function searchMagento(origin, query, { limit = 10, timeout } = {}) {
  const html = await getText(
    `${origin}/catalogsearch/result/?q=${encodeURIComponent(query)}`,
    { timeout },
  );

  return blocksWithClass(html, 'product-item', limit * 2)
    .map((block) => {
      const priceAttr = block.match(/data-price-amount="([\d.]+)"/i);
      const priceText = block.match(/<span[^>]*class="price"[^>]*>([\s\S]*?)<\/span>/i);
      const price = parsePrice(priceAttr ? priceAttr[1] : priceText ? stripTags(priceText[1]) : null, 'NPR');
      const link = block.match(/<a[^>]+class="[^"]*product-item-link[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        ?? block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!price || !link) return null;

      const productName = stripTags(link[2]) || attr(block, 'alt');
      if (!productName) return null;

      return {
        productName,
        ...price,
        url: absolute(origin, link[1]),
        image: attr(block, 'src'),
        availability: /out[\s-]?of[\s-]?stock/i.test(block) ? 'out_of_stock' : 'unknown',
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}
