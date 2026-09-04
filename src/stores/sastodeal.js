/** SastoDeal - Magento 2 storefront, server-rendered search results. */
import { searchMagento } from './platforms.js';

export default {
  id: 'sastodeal',
  name: 'SastoDeal',
  homepage: 'https://www.sastodeal.com',
  kind: 'marketplace',
  search: (query, options) => searchMagento('https://www.sastodeal.com', query, options),
};
