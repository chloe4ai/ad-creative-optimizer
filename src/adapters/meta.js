import MetaBusiness from 'facebook-nodejs-business-sdk';
import BaseAdapter from './base.js';

export class MetaAdsAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.platform = 'meta';
    MetaBusiness.config = {
      access_token: config.accessToken,
    };
    this.api = MetaBusiness.FacebookAdsApi.init(config.accessToken);
  }

  async getAdAccounts() {
    const fields = ['id', 'name', 'account_id', 'currency'];
    const params = { limit: 100 };

    const response = await this.api.get('/me/adaccounts', fields, params);

    return response.map(account => ({
      id: account.account_id,
      name: account.name,
      platform: 'meta',
    }));
  }

  async getCreatives(adAccountId, options = {}) {
    const Campaign = MetaBusiness.Campaign;
    const AdCreative = MetaBusiness.AdCreative;
    const Ad = MetaBusiness.Ad;

    const fields = [
      'id',
      'name',
      'status',
      'image_url',
      'image_hash',
      'title',
      'body',
      'call_to_action_type',
    ];

    const params = {
      fields,
      filtering: [{ field: 'ad.id', operator: 'EQUAL', value: adAccountId }],
      limit: 100,
    };

    const response = await Ad.get('/' + adAccountId + '/ads', params);

    return response.map(creative => this.normalizeCreative(creative));
  }

  async getDailyMetrics(creativeId, startDate, endDate) {
    const adReportRun = MetaBusiness.AdReportRun;
    const fields = [
      'impressions',
      'clicks',
      'spend',
      'ctr',
      'cpc',
      'conversion_rate_rich_funnel',
      'actions',
    ];

    const params = {
      time_range: {
        since: startDate,
        until: endDate,
      },
      breakdowns: ['publisher_platform', 'placement'],
      level: 'ad',
    };

    // 使用insights API
    const response = await adReportRun.get('/' + creativeId + '/insights', fields, params);

    return response.data.map(day => ({
      date: day.date_start,
      creativeId,
      impressions: parseInt(day.impressions) || 0,
      clicks: parseInt(day.clicks) || 0,
      spend: parseFloat(day.spend) || 0,
      ctr: parseFloat(day.ctr) || 0,
      frequency: parseFloat(day.frequency) || 0,
      conversions: this.extractConversions(day.actions),
    }));
  }

  extractConversions(actions) {
    if (!actions) return 0;
    const conversionAction = actions.find(a => a.action_type === 'purchase');
    return conversionAction ? parseInt(conversionAction.value) : 0;
  }

  normalizeCreative(raw) {
    return {
      id: raw.id,
      platform: 'meta',
      name: raw.name || 'Untitled Creative',
      type: raw.image_url ? 'image' : 'text',
      url: raw.image_url || '',
      thumbnail: raw.image_url || '',
      headline: raw.title || '',
      description: raw.body || '',
      status: raw.status,
    };
  }
}

export default MetaAdsAdapter;
