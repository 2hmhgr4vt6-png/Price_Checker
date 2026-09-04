/** Oliz Store - Apple/electronics retailer on Shopify. */
import { searchShopify } from './platforms.js';

export default {
  id: 'olizstore',
  name: 'Oliz Store',
  homepage: 'https://www.olizstore.com',
  kind: 'retailer',
  search: (query, options) => searchShopify('https://www.olizstore.com', query, options),
};
