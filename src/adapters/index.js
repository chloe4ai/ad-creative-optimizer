export { GoogleAdsAdapter } from './google.js';
export { MetaAdsAdapter } from './meta.js';
export { TikTokAdsAdapter } from './tiktok.js';

import { GoogleAdsAdapter } from './google.js';
import { MetaAdsAdapter } from './meta.js';
import { TikTokAdsAdapter } from './tiktok.js';

// 有 adapter 的平台。Pinterest / LinkedIn 只在预测模型里有频次上限，还没有 adapter。
export const SUPPORTED_PLATFORMS = ['google', 'meta', 'tiktok'];

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
