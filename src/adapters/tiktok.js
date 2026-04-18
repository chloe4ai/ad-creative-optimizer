import axios from 'axios';
import BaseAdapter from './base.js';

export class TikTokAdsAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.platform = 'tiktok';
    this.apiClient = axios.create({
      baseURL: 'https://open.tiktokapis.com/v2',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getAdAccounts() {
    const response = await this.apiClient.post('/advertiser/info/', {
      fields: ['advertiser_id', 'advertiser_name', 'status'],
    });

    return response.data.data?.advertisers?.map(account => ({
      id: account.advertiser_id,
      name: account.advertiser_name,
      platform: 'tiktok',
    })) || [];
  }

  async getCreatives(adAccountId, options = {}) {
    const response = await this.apiClient.post('/creative/list/', {
      advertiser_ids: [adAccountId],
      fields: [
        'creative_id',
        'creative_name',
        'status',
        'image_list',
        'video_id',
        'title',
        'description',
      ],
      page_size: 100,
    });

    return response.data.data?.creatives?.map(c => this.normalizeCreative(c)) || [];
  }

  async getDailyMetrics(creativeId, startDate, endDate) {
    const response = await this.apiClient.post('/report/integrated/get/', {
      advertiser_ids: [this.config.adAccountId],
      metrics: [
        'campaign_name',
        'adgroup_name',
        'impressions',
        'clicks',
        'ctr',
        'cpc',
        'spend',
        'conversion',
        'conversion_rate',
      ],
      dimensions: ['ad_id', 'date'],
      start_date: startDate,
      end_date: endDate,
    });

    return response.data.data?.list?.map(row => ({
      date: row.date,
      creativeId: row.ad_id,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      spend: parseFloat(row.spend) || 0,
      ctr: parseFloat(row.ctr) || 0,
      cvr: parseFloat(row.conversion_rate) || 0,
      conversions: parseInt(row.conversion) || 0,
    })) || [];
  }

  normalizeCreative(raw) {
    return {
      id: raw.creative_id,
      platform: 'tiktok',
      name: raw.creative_name || 'Untitled',
      type: raw.video_id ? 'video' : 'image',
      url: raw.image_list?.[0] || '',
      thumbnail: raw.image_list?.[0] || '',
      headline: raw.title || '',
      description: raw.description || '',
      status: raw.status,
    };
  }
}

export default TikTokAdsAdapter;
