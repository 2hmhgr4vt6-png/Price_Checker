/** Banana Mobile - phone retailer, WooCommerce. */
import { searchWooCommerce } from './platforms.js';

export default {
  id: 'bananamobile',
  name: 'Banana Mobile',
  homepage: 'https://bananamobile.com.np',
  kind: 'retailer',
  search: (query, options) => searchWooCommerce('https://bananamobile.com.np', query, options),
};
