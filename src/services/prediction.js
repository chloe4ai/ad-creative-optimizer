// 疲劳预测引擎

export class FatiguePredictor {
  constructor() {
    this.thresholds = {
      ctrDropPercent: 0.15,       // CTR 下降 15% 触发警告
      cvrDropPercent: 0.20,        // CVR 下降 20% 触发警告
      roasDropPercent: 0.25,       // ROAS 下降 25% 触发警告
      frequencyLimit: {           // 频次上限
        meta: 5,
        tiktok: 8,
        google: 10,
        pinterest: 7,
        linkedin: 6,
      },
      consecutiveDays: 3,         // 连续天数才触发
    };
  }

  /**
   * 预测素材疲劳日期
   * @param {Array} dailyMetrics - 每日效果数据，按日期排序
   * @param {Object} options - 预测选项
   * @returns {Object} 预测结果
   */
  predict(dailyMetrics, options = {}) {
    if (!dailyMetrics || dailyMetrics.length < 3) {
      return this.getInsufficientDataPrediction();
    }

    const recentDays = dailyMetrics.slice(-7); // 最近7天
    const baseline = this.calculateBaseline(dailyMetrics.slice(0, -7)); // 前半段作基准
    const current = this.calculateAverages(recentDays);

    // 计算各指标变化
    const metricsChange = this.calculateMetricsChange(current, baseline);

    // 判断状态
    const status = this.determineStatus(metricsChange);

    // 计算剩余寿命
    const fatigueDate = this.estimateFatigueDate(dailyMetrics, metricsChange);

    // 生成建议
    const recommendation = this.generateRecommendation(status, metricsChange);

    return {
      status,
      metricsChange,
      fatigueDate,
      daysRemaining: this.calculateDaysRemaining(fatigueDate),
      confidence: this.calculateConfidence(dailyMetrics.length),
      recommendation,
    };
  }

  calculateBaseline(data) {
    if (data.length === 0) return { ctr: 0, cvr: 0, roas: 0, freq: 0 };
    return this.calculateAverages(data);
  }

  calculateAverages(data) {
    if (data.length === 0) return { ctr: 0, cvr: 0, roas: 0, freq: 0, spend: 0 };

    const sum = data.reduce((acc, day) => ({
      ctr: acc.ctr + (day.ctr || 0),
      cvr: acc.cvr + (day.cvr || 0),
      roas: acc.roas + (day.roas || 0),
      freq: acc.freq + (day.frequency || 0),
      spend: acc.spend + (day.spend || 0),
    }), { ctr: 0, cvr: 0, roas: 0, freq: 0, spend: 0 });

    return {
      ctr: sum.ctr / data.length,
      cvr: sum.cvr / data.length,
      roas: sum.roas / data.length,
      freq: sum.freq / data.length,
      spend: sum.spend / data.length,
    };
  }

  calculateMetricsChange(current, baseline) {
    const calculatePctChange = (curr, base) => {
      if (base === 0) return curr > 0 ? 1 : 0;
      return (curr - base) / base;
    };

    return {
      ctr: {
        current: current.ctr,
        baseline: baseline.ctr,
        change: calculatePctChange(current.ctr, baseline.ctr),
        isFatigued: calculatePctChange(current.ctr, baseline.ctr) < -this.thresholds.ctrDropPercent,
      },
      cvr: {
        current: current.cvr,
        baseline: baseline.cvr,
        change: calculatePctChange(current.cvr, baseline.cvr),
        isFatigued: calculatePctChange(current.cvr, baseline.cvr) < -this.thresholds.cvrDropPercent,
      },
      roas: {
        current: current.roas,
        baseline: baseline.roas,
        change: calculatePctChange(current.roas, baseline.roas),
        isFatigued: calculatePctChange(current.roas, baseline.roas) < -this.thresholds.roasDropPercent,
      },
      frequency: {
        current: current.freq,
        isHigh: current.freq > this.thresholds.frequencyLimit.meta,
      },
    };
  }

  determineStatus(metricsChange) {
    const { ctr, cvr, roas, frequency } = metricsChange;

    // 严重疲劳：多个指标同时下降
    const fatiguedCount = [ctr.isFatigued, cvr.isFatigued, roas.isFatigued].filter(Boolean).length;

    if (fatiguedCount >= 2 || frequency.isHigh) {
      return 'fatigued';
    }

    // 警告状态：任一指标开始下降
    if (fatiguedCount === 1 || ctr.change < 0 || cvr.change < 0) {
      return 'warning';
    }

    return 'healthy';
  }

  estimateFatigueDate(dailyMetrics, metricsChange) {
    // 基于指数衰减模型估算
    const decayRate = this.estimateDecayRate(metricsChange);
    const lastDay = dailyMetrics[dailyMetrics.length - 1];

    // 计算按当前衰减速度，多少天后 CTR 会跌破基准的 50%
    const { ctr } = metricsChange;
    if (ctr.baseline === 0 || ctr.change >= 0) {
      // 还在上升或稳定，预估 14 天后疲劳
      return this.addDays(new Date(), 14);
    }

    const daysToFatigue = Math.abs(ctr.change) > 0
      ? Math.log(0.5) / Math.log(1 + ctr.change)
      : 14;

    return this.addDays(new Date(), Math.max(1, Math.min(30, Math.round(daysToFatigue))));
  }

  estimateDecayRate(metricsChange) {
    const { ctr, cvr } = metricsChange;
    // 简单的线性衰减估计
    const avgChange = (ctr.change + cvr.change) / 2;
    return avgChange < 0 ? Math.abs(avgChange) : 0.01;
  }

  calculateDaysRemaining(fatigueDate) {
    const today = new Date();
    const diff = fatigueDate - today;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  generateRecommendation(status, metricsChange) {
    if (status === 'fatigued') {
      return 'pause';
    }

    if (status === 'warning') {
      // 检查具体是哪个指标出问题
      if (metricsChange.frequency.isHigh) {
        return 'rotate'; // 需要换受众或频次
      }
      return 'rotate'; // 建议准备新素材
    }

    return 'keep';
  }

  calculateConfidence(dataPoints) {
    // 数据点越多，置信度越高
    if (dataPoints < 3) return 0.3;
    if (dataPoints < 7) return 0.5;
    if (dataPoints < 14) return 0.7;
    if (dataPoints < 30) return 0.85;
    return 0.95;
  }

  getInsufficientDataPrediction() {
    return {
      status: 'unknown',
      fatigueDate: null,
      daysRemaining: null,
      confidence: 0,
      recommendation: 'keep',
      message: '数据不足，无法预测',
    };
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * 检查是否应该触发预警
   */
  shouldAlert(prediction, previousPrediction) {
    if (!previousPrediction) return true;

    // 状态变化时触发
    if (prediction.status !== previousPrediction.status) {
      return true;
    }

    // 距离疲劳天数减少超过50%时触发
    if (previousPrediction.daysRemaining > 0 &&
        prediction.daysRemaining < previousPrediction.daysRemaining * 0.5) {
      return true;
    }

    return false;
  }
}

export default FatiguePredictor;
