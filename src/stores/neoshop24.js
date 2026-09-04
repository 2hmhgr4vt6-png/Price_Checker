/** Neoshop24 - WooCommerce electronics store. */
import { searchWooCommerce } from './platforms.js';

export default {
  id: 'neoshop24',
  name: 'Neoshop24',
  homepage: 'https://neoshop24.com',
  kind: 'retailer',
  search: (query, options) => searchWooCommerce('https://neoshop24.com', query, options),
};
