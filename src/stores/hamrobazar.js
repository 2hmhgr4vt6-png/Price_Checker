/**
 * Hamrobazar - classifieds marketplace (mostly second-hand).
 *
 * The site is a client-rendered SPA that talks to api.hamrobazaar.com, and
 * that API rejects anonymous callers with "Un-Authorized Access". It therefore
 * needs a token to work; set HAMROBAZAR_TOKEN in the environment and this
 * adapter goes live. Without one it reports itself as unavailable and the
 * orchestrator skips it silently rather than showing invented listings.
 */
import { getJson } from '../http.js';
import { parsePrice } from '../price.js';

const API = 'https://api.hamrobazaar.com/api/Search/GetSearchProduct';

export default {
  id: 'hamrobazar',
  name: 'Hamrobazar',
  homepage: 'https://hamrobazaar.com',
  kind: 'classifieds',
  requiresCredentials: 'HAMROBAZAR_TOKEN',

  get enabled() {
    return Boolean(process.env.HAMROBAZAR_TOKEN);
  },

  async search(query, { limit = 10, timeout } = {}) {
    const token = process.env.HAMROBAZAR_TOKEN;
    if (!token) throw new Error('HAMROBAZAR_TOKEN not set');

    const url = `${API}?SearchText=${encodeURIComponent(query)}&PageSize=${limit}&PageIndex=1`;
    const data = await getJson(url, { timeout, headers: { Authorization: `Bearer ${token}` } });

    const items = data?.data ?? data?.Data ?? [];
    return items.slice(0, limit).map((item) => ({
      productName: item.name ?? item.Name ?? '',
      ...parsePrice(item.price ?? item.Price, 'NPR'),
      url: `https://hamrobazaar.com/product/${item.id ?? item.Id ?? ''}`,
      image: item.thumbnailImage ?? item.image ?? null,
      // Classifieds have no stock concept; an active ad is treated as available.
      availability: item.isSold === true ? 'out_of_stock' : 'unknown',
      seller: item.createdBy?.name ?? null,
      note: 'Second-hand / classifieds listing',
    }));
  },
};
