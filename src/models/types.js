// 统一的创意数据结构
export const CreativeData = {
  id: string,
  platform: 'google' | 'meta' | 'tiktok' | 'pinterest' | 'linkedin',
  accountId: string,
  campaignId: string,
  adSetId: string,

  // 素材信息
  type: 'image' | 'video' | 'carousel' | 'text',
  url: string,              // 素材URL
  thumbnail: string,         // 缩略图
  headline: string,         // 标题（如果有）
  description: string,       // 描述（如果有）

  // 时序效果数据（每日聚合）
  dailyMetrics: [{
    date: string,            // YYYY-MM-DD
    impressions: number,
    clicks: number,
    ctr: number,            // 点击率
    conversions: number,
    cvr: number,            // 转化率
    spend: number,
    cpc: number,            // 每次点击成本
    roas: number,           // 广告支出回报率
    frequency: number,       // 展示频次（仅Meta）
  }],

  // 预测数据
  prediction: {
    fatigueDate: string,     // 预计疲劳日期
    confidence: number,     // 置信度 0-1
    daysRemaining: number,  // 距离疲劳天数
    status: 'healthy' | 'warning' | 'fatigued',
    recommendation: 'keep' | 'rotate' | 'pause',
  },

  // 元数据
  createdAt: string,
  updatedAt: string,
  lastCheckedAt: string,
}

// 预警通知格式
export const AlertNotification = {
  id: string,
  creativeId: string,
  platform: string,
  type: 'fatigue_warning' | 'fatigue_detected' | 'performance_drop',
  severity: 'info' | 'warning' | 'critical',
  message: string,
  metrics: {
    current: object,
    previous: object,
    change: number,         // 百分比变化
  },
  createdAt: string,
  notifiedAt: string | null,
  channels: ['slack' | 'email' | 'dashboard'],
}

// 基准数据
export const Benchmark = {
  platform: string,
  category: string,         // 行业类别
  creativeType: 'image' | 'video' | 'carousel',

  avgCtr: number,
  avgCvr: number,
  avgFatigueDays: number,   // 平均疲劳天数
  avgFreqBeforeFatigue: number,

  percentile25: { ctr: number, cvr: number, fatigueDays: number },
  percentile75: { ctr: number, cvr: number, fatigueDays: number },
}
