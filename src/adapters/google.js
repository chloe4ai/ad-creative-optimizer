import { GoogleAdsApi } from '@google-ads/api';
import BaseAdapter from './base.js';

export class GoogleAdsAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.platform = 'google';
    this.client = new GoogleAdsApi({
      developer_token: config.developerToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    });
  }

  async getAdAccounts() {
    const customer = this.client.Customer({
      customer_id: config.customerId,
    });

    const response = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code
      FROM customer
    `);

    return response.map(row => ({
      id: row.customer.id,
      name: row.customer.descriptive_name,
      currency: row.customer.currency_code,
    }));
  }

  async getCreatives(adAccountId, options = {}) {
    const customer = this.client.Customer({ customer_id: adAccountId });

    const query = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.status,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.display_url,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.conversions
      FROM ad_group_ad
      WHERE ad_group_ad.ad.type IN ('RESPONSIVE_DISPLAY_AD', 'IMAGE_AD', 'VIDEO_AD')
      AND segments.date DURING LAST_30_DAYS
    `;

    const response = await customer.query(query);

    return response.map(row => this.normalizeCreative(row));
  }

  async getDailyMetrics(creativeId, startDate, endDate) {
    const customer = this.client.Customer({ customer_id: this.config.customerId });

    const query = `
      SELECT
        ad_group_ad.ad.id,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.conversions_from_interactions_rate
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id = ${creativeId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;

    const response = await customer.query(query);

    return response.map(row => ({
      date: row.segments.date,
      creativeId: row.ad_group_ad.ad.id,
      impressions: Number(row.metrics.impressions),
      clicks: Number(row.metrics.clicks),
      conversions: Number(row.metrics.conversions),
      spend: row.metrics.cost_micros / 1000000, // 微转元
      ctr: row.metrics.ctr,
      cvr: row.metrics.conversions_from_interactions_rate,
    }));
  }

  normalizeCreative(raw) {
    const ad = raw.ad_group_ad.ad;
    const campaign = raw.campaign;
    const metrics = raw.metrics;

    return {
      id: ad.id,
      platform: 'google',
      name: ad.name,
      type: this.getCreativeType(ad.type),
      url: ad.final_urls?.[0] || ad.display_url,
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      adsetId: raw.ad_group?.id,
      adsetName: raw.ad_group?.name,
      status: ad.status,
      impressions: metrics?.impressions,
      clicks: metrics?.clicks,
      ctr: metrics?.ctr,
      conversions: metrics?.conversions,
    };
  }

  getCreativeType(adType) {
    const typeMap = {
      'RESPONSIVE_DISPLAY_AD': 'image',
      'IMAGE_AD': 'image',
      'VIDEO_AD': 'video',
      'TEXT_AD': 'text',
    };
    return typeMap[adType] || 'image';
  }
}

export default GoogleAdsAdapter;
