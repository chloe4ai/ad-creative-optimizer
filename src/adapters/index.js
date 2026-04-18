export { GoogleAdsAdapter } from './google.js';
export { MetaAdsAdapter } from './meta.js';
export { TikTokAdsAdapter } from './tiktok.js';

import { GoogleAdsAdapter } from './google.js';
import { MetaAdsAdapter } from './meta.js';
import { TikTokAdsAdapter } from './tiktok.js';

export const adapterFactory = (platform, config) => {
  switch (platform) {
    case 'google':
      return new GoogleAdsAdapter(config);
    case 'meta':
      return new MetaAdsAdapter(config);
    case 'tiktok':
      return new TikTokAdsAdapter(config);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};
