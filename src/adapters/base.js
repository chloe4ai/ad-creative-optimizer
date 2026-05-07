export class BaseAdapter {
  constructor(config) {
    this.config = config;
    this.platform = null;
  }

  async getAdAccounts() {
    throw new Error('Not implemented');
  }

  async getCreatives(adAccountId, options = {}) {
    throw new Error('Not implemented');
  }

  async getCreativeMetrics(creativeId, dateRange) {
    throw new Error('Not implemented');
  }

  async getDailyMetrics(creativeId, startDate, endDate) {
    throw new Error('Not implemented');
  }

  normalizeCreative(rawCreative) {
    throw new Error('Not implemented');
  }

  normalizeMetrics(rawMetrics) {
    throw new Error('Not implemented');
  }

  calculateMetrics(dailyData) {
    return {
      impressions: dailyData.impressions || 0,
      clicks: dailyData.clicks || 0,
      ctr: dailyData.impressions > 0 ? dailyData.clicks / dailyData.impressions : 0,
      conversions: dailyData.conversions || 0,
      cvr: dailyData.clicks > 0 ? dailyData.conversions / dailyData.clicks : 0,
      spend: dailyData.spend || 0,
      cpc: dailyData.clicks > 0 ? dailyData.spend / dailyData.clicks : 0,
      roas: dailyData.spend > 0 ? (dailyData.revenue || 0) / dailyData.spend : 0,
    };
  }

  async pauseCreative(creativeId, creativeData) {
    throw new Error('Not implemented');
  }

  async rotateCreative(creativeId, creativeData) {
    throw new Error('Not implemented');
  }
}

export default BaseAdapter;
