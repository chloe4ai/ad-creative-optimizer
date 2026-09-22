// 疲劳预测引擎

export class FatiguePredictor {
  constructor() {
    this.thresholds = {
      ctrDropPercent: 0.15,       // CTR 下降 15% 触发警告
      cvrDropPercent: 0.20,        // CVR 下降 20% 触发警告
      roasDropPercent: 0.25,       // ROAS 下降 25% 触发警告
      frequencyLimit: {           // 频次上限（按平台，meta 最保守，作为未知平台的默认值）
        meta: 5,
        tiktok: 8,
        google: 10,
        pinterest: 7,
        linkedin: 6,
      },
      consecutiveDays: 3,         // 连续天数才触发
      maxHorizonDays: 90,         // 预测最远只看 90 天
    };
  }

  /**
   * 预测素材疲劳日期
   * @param {Array} dailyMetrics - 每日效果数据，按日期排序
   * @param {Object} options - 预测选项；options.platform 决定用哪个平台的频次上限
   * @returns {Object} 预测结果
   */
  predict(dailyMetrics, options = {}) {
    if (!dailyMetrics || dailyMetrics.length < 3) {
      return this.getInsufficientDataPrediction();
    }

    // 对比窗口最多 7 天，但不能超过序列的一半 —— 否则基准段会被切空，
    // 一切都会跟 0 比较，短生命周期的素材永远显示 healthy。
    const window = Math.min(7, Math.floor(dailyMetrics.length / 2));
    const recentDays = dailyMetrics.slice(-window);
    const baselineDays = dailyMetrics.slice(0, -window);
    const baseline = this.calculateBaseline(baselineDays);
    const current = this.calculateAverages(recentDays);

    // 两个窗口中点之间隔了多少天 —— 把「窗口涨跌幅」换算成「每日衰减率」要用它
    const spanDays = Math.max(1, (baselineDays.length + window) / 2);

    // 计算各指标变化
    const metricsChange = this.calculateMetricsChange(current, baseline, {
      platform: options.platform,
      dailyMetrics,
      window,
    });

    // 判断状态
    const status = this.determineStatus(metricsChange);

    // 计算剩余寿命
    const fatigueDate = this.estimateFatigueDate(metricsChange, spanDays);

    // 生成建议
    const recommendation = this.generateRecommendation(status, metricsChange);

    return {
      status,
      metricsChange,
      fatigueDate,
      daysRemaining: this.calculateDaysRemaining(fatigueDate),
      confidence: this.calculateConfidence(dailyMetrics.length),
      recommendation,
      window,
      spanDays,
      platform: options.platform || null,
    };
  }

  calculateBaseline(data) {
    if (data.length === 0) return { ctr: 0, cvr: 0, roas: 0, freq: 0, spend: 0 };
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

  /**
   * 该平台的频次上限。平台没传或不认识时退回 meta（最保守的那个）。
   */
  frequencyLimitFor(platform) {
    const limits = this.thresholds.frequencyLimit;
    const key = typeof platform === 'string' ? platform.toLowerCase() : null;
    return (key && limits[key] !== undefined) ? limits[key] : limits.meta;
  }

  /**
   * 从最后一天往回数，连续有几天该指标低于基准线的疲劳阈值。
   * 单天噪声不该直接判死刑 —— 要连续几天都掉下去才算。
   */
  trailingRunBelow(dailyMetrics, baselineValue, key, threshold) {
    if (!baselineValue) return 0;
    let run = 0;
    for (let i = dailyMetrics.length - 1; i >= 0; i--) {
      const value = dailyMetrics[i][key] || 0;
      if ((value - baselineValue) / baselineValue < -threshold) run++;
      else break;
    }
    return run;
  }

  calculateMetricsChange(current, baseline, context = {}) {
    const { platform, dailyMetrics = [], window = 1 } = context;
    const calculatePctChange = (curr, base) => {
      if (base === 0) return curr > 0 ? 1 : 0;
      return (curr - base) / base;
    };

    // 数据太短时不可能凑出 3 个连续日，按窗口长度放宽
    const requiredRun = Math.max(1, Math.min(this.thresholds.consecutiveDays, window));

    const build = (currValue, baseValue, threshold, key) => {
      const change = calculatePctChange(currValue, baseValue);
      const run = this.trailingRunBelow(dailyMetrics, baseValue, key, threshold);
      return {
        current: currValue,
        baseline: baseValue,
        change,
        consecutiveDaysBelow: run,
        isFatigued: change < -threshold && run >= requiredRun,
      };
    };

    const limit = this.frequencyLimitFor(platform);

    return {
      ctr: build(current.ctr, baseline.ctr, this.thresholds.ctrDropPercent, 'ctr'),
      cvr: build(current.cvr, baseline.cvr, this.thresholds.cvrDropPercent, 'cvr'),
      roas: build(current.roas, baseline.roas, this.thresholds.roasDropPercent, 'roas'),
      frequency: {
        current: current.freq,
        limit,
        isHigh: current.freq > limit,
      },
      requiredRun,
    };
  }

  determineStatus(metricsChange) {
    const { ctr, cvr, roas, frequency } = metricsChange;

    // 严重疲劳：多个指标同时下降
    const fatiguedCount = [ctr.isFatigued, cvr.isFatigued, roas.isFatigued].filter(Boolean).length;

    if (fatiguedCount >= 2 || frequency.isHigh) {
      return 'fatigued';
    }

    // 警告：跌幅已经过半程阈值。只要是负数就报警会把一半健康素材误伤。
    const halfway = (metric, threshold) => metric.change < -threshold / 2;
    if (
      fatiguedCount === 1 ||
      halfway(ctr, this.thresholds.ctrDropPercent) ||
      halfway(cvr, this.thresholds.cvrDropPercent) ||
      halfway(roas, this.thresholds.roasDropPercent)
    ) {
      return 'warning';
    }

    return 'healthy';
  }

  /**
   * 指数衰减外推：CTR 什么时候跌到基准的一半。
   * change 是「一个 spanDays 长的窗口」上的总跌幅，不是日跌幅 —— 必须先开 spanDays 次方
   * 换成日衰减率，否则单位差了近一个数量级。
   */
  estimateFatigueDate(metricsChange, spanDays) {
    const { ctr } = metricsChange;

    if (ctr.baseline === 0 || ctr.change >= 0) {
      // 还在上升或稳定，预估 14 天后疲劳
      return this.addDays(new Date(), 14);
    }

    const retention = 1 + ctr.change;           // 窗口留存率，落在 [0, 1)
    if (retention <= 0) return this.addDays(new Date(), 1);  // 已经归零

    const dailyRetention = Math.pow(retention, 1 / spanDays);
    const daysToFatigue = Math.log(0.5) / Math.log(dailyRetention);

    const clamped = Math.max(1, Math.min(this.thresholds.maxHorizonDays, Math.round(daysToFatigue)));
    return this.addDays(new Date(), clamped);
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
    if (!Number.isFinite(diff)) return null;
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
