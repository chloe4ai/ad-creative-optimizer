// 各平台 API 适配器基类

export class BaseAdapter {
  constructor(config) {
    this.config = config;
    this.platform = null;
  }

  // 获取广告账户列表
  async getAdAccounts() {
    throw new Error('Not implemented');
  }

  // 获取创意列表
  async getCreatives(adAccountId, options = {}) {
    throw new Error('Not implemented');
  }

  // 获取指定创意的效果数据
  async getCreativeMetrics(creativeId, dateRange) {
    throw new Error('Not implemented');
  }

  // 获取每日聚合数据（用于疲劳计算）
  async getDailyMetrics(creativeId, startDate, endDate) {
    throw new Error('Not implemented');
  }

  // 统一数据格式
  normalizeCreative(rawCreative) {
    throw new Error('Not implemented');
  }

  normalizeMetrics(rawMetrics) {
    throw new Error('Not implemented');
  }

  // 计算 CTR, CVR, ROAS 等指标
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
}

export default BaseAdapter;
