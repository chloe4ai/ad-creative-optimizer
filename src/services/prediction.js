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
      minDataDays: 3,             // 至少 3 天有曝光的数据才给预测
      // diagnose() 用的两个分类阈值
      cpmRisePercent: 0.15,       // CPM 上涨 15% 以上才算「竞价变贵」
      frequencyNearCapShare: 0.6, // 频次达到上限的 60% 且仍在上升，算「重复曝光」证据
    };
  }

  /**
   * 把输入清洗成可分析的序列：
   * - 数值字段统一 Number()，pg 的 DECIMAL 会以字符串返回，直接相加会变成字符串拼接 / NaN
   * - 有日期时按日期升序排列
   * - 丢掉 impressions === 0 的空白天（没投放的日子不代表素材疲劳）
   */
  normalizeMetrics(dailyMetrics) {
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const numericFields = ['ctr', 'cvr', 'roas', 'frequency', 'spend', 'clicks', 'conversions', 'cpc'];

    const rows = dailyMetrics.map((day) => {
      const row = { ...day };
      for (const field of numericFields) {
        if (field in row) row[field] = toNum(row[field]);
      }
      // impressions 缺失时保持缺失（无法判断是否为空白天），有值时转成数字
      if (row.impressions !== undefined && row.impressions !== null) {
        row.impressions = toNum(row.impressions);
      }
      return row;
    });

    // 只有每一天都带可解析日期时才排序，否则保持调用方给的顺序
    const timeOf = (row) => {
      const date = row.date ?? row.metric_date;
      if (date === undefined || date === null) return NaN;
      return new Date(date).getTime();
    };
    if (rows.length > 0 && rows.every((row) => Number.isFinite(timeOf(row)))) {
      rows.sort((a, b) => timeOf(a) - timeOf(b));
    }

    return rows.filter((row) => row.impressions !== 0);
  }

  /**
   * 预测素材疲劳日期
   * @param {Array} dailyMetrics - 每日效果数据，按日期排序
   * @param {Object} options - 预测选项；options.platform 决定用哪个平台的频次上限
   * @returns {Object} 预测结果
   */
  predict(rawMetrics, options = {}) {
    if (!Array.isArray(rawMetrics)) {
      return this.getInsufficientDataPrediction();
    }

    const dailyMetrics = this.normalizeMetrics(rawMetrics);
    if (dailyMetrics.length < this.thresholds.minDataDays) {
      return this.getInsufficientDataPrediction();
    }

    // options.now 便于测试注入「今天」
    const now = options.now ? new Date(options.now) : new Date();

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
    const fatigueDate = this.estimateFatigueDate(metricsChange, spanDays, now, window);

    // 生成建议
    const recommendation = this.generateRecommendation(status);

    return {
      status,
      metricsChange,
      fatigueDate,
      daysRemaining: this.calculateDaysRemaining(fatigueDate, now),
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
   * 终点是「基准 × 50%」，不是「当前水平再减半」：已经跌了 40% 的素材只剩 10 个百分点可跌。
   * 近期均值代表的是近期窗口的中点（约 (window - 1) / 2 天前），所以从中点算起再折回今天。
   * 已经跌破基准一半的，疲劳日期就是今天。
   */
  estimateFatigueDate(metricsChange, spanDays, now = new Date(), window = 1) {
    const { ctr } = metricsChange;

    if (ctr.baseline === 0 || ctr.change >= 0) {
      // 还在上升或稳定：没有下降趋势可外推，不给疲劳日期（前端显示 stable）
      return null;
    }

    const FATIGUE_LEVEL = 0.5;                  // 相对基准
    const retention = 1 + ctr.change;           // 近期 / 基准，落在 [0, 1)
    if (retention <= FATIGUE_LEVEL) return this.addDays(now, 0);  // 已经跌破

    const dailyRetention = Math.pow(retention, 1 / spanDays);
    const daysFromRecentMid = Math.log(FATIGUE_LEVEL / retention) / Math.log(dailyRetention);
    const daysToFatigue = daysFromRecentMid - (window - 1) / 2;

    const clamped = Math.max(0, Math.min(this.thresholds.maxHorizonDays, Math.round(daysToFatigue)));
    return this.addDays(now, clamped);
  }

  calculateDaysRemaining(fatigueDate, now = new Date()) {
    if (!fatigueDate) return null;
    const diff = fatigueDate.getTime() - now.getTime();
    if (!Number.isFinite(diff)) return null;
    // fatigueDate 是用 UTC 毫秒加出来的整天数，round 不受夏令时影响
    return Math.max(0, Math.round(diff / 864e5));
  }

  generateRecommendation(status) {
    // 状态决定动作：fatigued 立即停，warning 准备替换素材，其余保持。
    // 「该换素材还是该查落地页」这类按原因区分的建议在 diagnose().pattern.action 里。
    if (status === 'fatigued') return 'pause';
    if (status === 'warning') return 'rotate';
    return 'keep';
  }

  // ---------------------------------------------------------------------------
  // Diagnosis: why the verdict came out the way it did.
  //
  // predict() answers "what is the status"; diagnose() answers the questions a media
  // buyer asks next: which signal moved first, how sure are we that it is not noise,
  // is this the creative wearing out or something else (landing page, auction cost),
  // and what should be done about it. It is a separate, pure method so predict()'s
  // return shape (stored in the predictions table) does not change.
  // ---------------------------------------------------------------------------

  /**
   * @param {Object} prediction - the object predict() returned for these metrics
   * @param {Array} rawMetrics - the same daily rows that were passed to predict()
   * @returns {Object} definition, per-signal detail, frequency, cost, pattern, projection
   */
  diagnose(prediction, rawMetrics) {
    if (!prediction || prediction.status === 'unknown' || !prediction.metricsChange || !Array.isArray(rawMetrics)) {
      return {
        pattern: {
          code: 'insufficient_data',
          label: 'Not enough data',
          isCreativeProblem: null,
          cause: `Fewer than ${this.thresholds.minDataDays} days with impressions, so there is no baseline to compare against.`,
          action: 'Wait for more delivery before judging this creative.',
        },
        definition: null, signals: null, frequency: null, cost: null, lead: null, projection: null,
      };
    }

    const rows = this.normalizeMetrics(rawMetrics);
    const m = prediction.metricsChange;
    const n = rows.length;
    const window = prediction.window;
    const recent = rows.slice(-window);
    const base = rows.slice(0, -window);
    const dateOf = (row) => (row ? (row.metric_date ?? row.date ?? null) : null);
    const t = this.thresholds;
    const thresholdOf = { ctr: t.ctrDropPercent, cvr: t.cvrDropPercent, roas: t.roasDropPercent };

    const sum = (list, key) => list.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    // Revenue is not stored by the sync service; reconstruct it from roas x spend.
    const revenueOf = (row) => (row.revenue !== undefined ? Number(row.revenue) || 0 : (row.roas || 0) * (row.spend || 0));
    const pooled = (list) => {
      const impressions = sum(list, 'impressions');
      const clicks = sum(list, 'clicks');
      const conversions = sum(list, 'conversions');
      const spend = sum(list, 'spend');
      const revenue = list.reduce((acc, row) => acc + revenueOf(row), 0);
      return { impressions, clicks, conversions, spend, revenue, days: list.length };
    };
    const pb = pooled(base);
    const pr = pooled(recent);
    const ratio = (num, den) => (den > 0 ? num / den : null);
    const change = (curr, prev) => (curr === null || prev === null || prev === 0 ? null : (curr - prev) / prev);

    // --- how strong is the evidence that a metric moved (vs. day-to-day noise) ---
    // Welch's t on the daily values of the two windows: the difference in means measured
    // against the day-to-day spread actually observed. (A pooled binomial test would call
    // almost any difference "significant" at ad volumes, because real daily rates vary far
    // more than sampling error alone.)
    const evidenceLevel = (z) => {
      if (z === null || !Number.isFinite(z)) return 'unknown';
      const a = Math.abs(z);
      return a >= 3 ? 'strong' : a >= 2 ? 'moderate' : 'weak';
    };
    const welch = (a, b) => {
      if (a.length < 2 || b.length < 2) return null;
      const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
      const variance = (v, mu) => v.reduce((x, y) => x + (y - mu) ** 2, 0) / (v.length - 1);
      const ma = mean(a); const mb = mean(b);
      const se = Math.sqrt(variance(a, ma) / a.length + variance(b, mb) / b.length);
      const scale = Math.max(Math.abs(ma), Math.abs(mb));
      const diff = mb - ma;
      if (se > 1e-9 * scale) return diff / se;
      // No day-to-day variation on either side (zero, or floating-point residue):
      // same level means no change; different levels are a clean step, capped.
      if (Math.abs(diff) <= 1e-9 * scale) return 0;
      return Math.sign(diff) * 10;
    };
    const daily = (list, key) => list.map((row) => row[key] || 0);
    const zOf = {
      ctr: welch(daily(base, 'ctr'), daily(recent, 'ctr')),
      cvr: welch(daily(base, 'cvr'), daily(recent, 'cvr')),
      roas: welch(daily(base, 'roas'), daily(recent, 'roas')),
    };

    // Daily compounding rate from a least-squares line through ln(value) over the recent
    // window: the slope the metric is on right now, as opposed to the window-to-window
    // rate the fatigue date uses (which spreads the drop over the whole history).
    const trendRate = (key) => {
      const pts = recent.map((row, i) => [i, row[key]]).filter(([, v]) => v > 0);
      if (pts.length < 3) return null;
      const mx = pts.reduce((a, [x]) => a + x, 0) / pts.length;
      const my = pts.reduce((a, [, v]) => a + Math.log(v), 0) / pts.length;
      const sxx = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
      if (sxx === 0) return null;
      const sxy = pts.reduce((a, [x, v]) => a + (x - mx) * (Math.log(v) - my), 0);
      return Math.exp(sxy / sxx) - 1;
    };

    const LABEL = { ctr: 'CTR', cvr: 'CVR', roas: 'ROAS' };
    const signals = {};
    for (const key of ['ctr', 'cvr', 'roas']) {
      const v = m[key];
      const threshold = thresholdOf[key];
      const past = v.isFatigued;
      const bending = v.change < -threshold / 2;
      const crossedIndex = v.consecutiveDaysBelow > 0 ? n - v.consecutiveDaysBelow : null;
      const z = zOf[key];
      signals[key] = {
        key,
        label: LABEL[key],
        baseline: v.baseline,
        current: v.current,
        change: v.change,
        threshold,
        // The level (in the metric's own units) a day has to fall below to count.
        thresholdValue: v.baseline * (1 - threshold),
        // past: over the threshold for the required run. bending: more than halfway there
        // (or over it, but not for enough consecutive days). holding / improving: neither.
        state: past ? 'past' : bending ? 'bending' : v.change > threshold / 2 ? 'improving' : 'holding',
        consecutiveDaysBelow: v.consecutiveDaysBelow,
        crossedIndex,
        crossedDate: crossedIndex === null ? null : dateOf(rows[crossedIndex]),
        trendRatePerDay: trendRate(key),
        evidence: { z, level: evidenceLevel(z) },
      };
    }

    // --- frequency (only platforms that report it; others send 0) ---
    const freqValues = rows.map((row) => row.frequency || 0);
    const reported = freqValues.some((f) => f > 0);
    const limit = m.frequency.limit;
    let frequency = { reported: false, limit, isHigh: false, latest: null, windowAvg: null, slopePerDay: null, firstOverIndex: null, firstOverDate: null, daysToCap: null };
    if (reported) {
      const latest = freqValues[n - 1];
      const slopePerDay = window > 1 ? (freqValues[n - 1] - freqValues[n - window]) / (window - 1) : 0;
      const firstOverIndex = freqValues.findIndex((f) => f > limit);
      frequency = {
        reported: true,
        limit,
        isHigh: m.frequency.isHigh,
        latest,
        windowAvg: m.frequency.current,
        slopePerDay,
        firstOverIndex: firstOverIndex === -1 ? null : firstOverIndex,
        firstOverDate: firstOverIndex === -1 ? null : dateOf(rows[firstOverIndex]),
        daysToCap: latest < limit && slopePerDay > 0 ? Math.ceil((limit - latest) / slopePerDay) : null,
      };
    }

    // --- cost side, from pooled sums (what a click / conversion / impression costs) ---
    const costMetric = (fb, fr) => {
      const baseline = fb; const current = fr;
      return { baseline, current, change: change(current, baseline) };
    };
    const cost = {
      cpm: costMetric(ratio(pb.spend * 1000, pb.impressions), ratio(pr.spend * 1000, pr.impressions)),
      cpc: costMetric(ratio(pb.spend, pb.clicks), ratio(pr.spend, pr.clicks)),
      cpa: costMetric(ratio(pb.spend, pb.conversions), ratio(pr.spend, pr.conversions)),
      aov: costMetric(ratio(pb.revenue, pb.conversions), ratio(pr.revenue, pr.conversions)),
      spendPerDay: costMetric(ratio(pb.spend, pb.days), ratio(pr.spend, pr.days)),
    };

    // --- which pattern is this ---
    const pattern = this.classifyPattern(prediction, signals, frequency, cost);

    // --- which signal moved first ---
    // Frequency over the cap leads by construction (it is the cause, the triad is the effect).
    // Otherwise: the metric that has been below its threshold longest; failing that, the one
    // furthest along toward its threshold.
    let lead = null;
    if (frequency.isHigh) lead = 'frequency';
    else if (pattern.code === 'cost_pressure') lead = 'cpm';
    else {
      const ranked = Object.values(signals)
        .filter((sig) => sig.state === 'past' || sig.state === 'bending')
        .sort((a, b) => (b.consecutiveDaysBelow - a.consecutiveDaysBelow)
          || (a.change / a.threshold - b.change / b.threshold));
      lead = ranked.length ? ranked[0].key : null;
    }

    // --- projection: when does CTR reach half its own baseline ---
    // engineDays is prediction.daysRemaining (window-to-window rate). trendDays re-runs the
    // same question from the latest level at the recent trend's rate; when the decline
    // started late the two disagree, and the honest answer is the range.
    const ctrRate = signals.ctr.trendRatePerDay;
    const tail = rows.slice(-Math.min(3, window));
    const latestRatio = m.ctr.baseline > 0 ? (sum(tail, 'ctr') / tail.length) / m.ctr.baseline : null;
    const declining = m.ctr.change < 0;
    // Already there: the window average or the last few days sit at or under half of baseline.
    const alreadyBelow = declining && ((1 + m.ctr.change) <= 0.5 || (latestRatio !== null && latestRatio <= 0.5));
    // CTR dropped against baseline but is flat or rising inside the recent window: a step
    // down that has stopped, not a decline in progress. Extrapolating it would be wrong.
    const declineStopped = declining && !alreadyBelow && ctrRate !== null && ctrRate >= 0;
    let trendDays = null;
    if (declining && !declineStopped && latestRatio !== null && ctrRate !== null && ctrRate < 0) {
      // The tail mean describes the middle of the tail, (tail.length - 1) / 2 days ago.
      const fromTailMid = Math.log(0.5 / latestRatio) / Math.log(1 + ctrRate) - (tail.length - 1) / 2;
      trendDays = alreadyBelow ? 0 : Math.min(t.maxHorizonDays, Math.max(0, Math.round(fromTailMid)));
    }
    const engineDays = Number.isFinite(prediction.daysRemaining) ? prediction.daysRemaining : null;
    const bounds = declineStopped ? [] : [engineDays, trendDays].filter((d) => d !== null);
    let note = null;
    if (engineDays === null) note = 'CTR is flat or rising against its baseline, so there is no CTR decline to extrapolate.';
    else if (declineStopped) note = 'CTR dropped against its baseline but has been flat or rising over the recent window, so there is no ongoing decline to extrapolate.';
    const projection = {
      basis: 'ctr_half_baseline',
      level: m.ctr.baseline * 0.5,
      engineDays,
      trendDays,
      minDays: bounds.length ? Math.min(...bounds) : null,
      maxDays: bounds.length ? Math.max(...bounds) : null,
      alreadyBelow,
      declineStopped,
      latestVsBaseline: latestRatio,
      // Why there is no date, when there is none.
      note,
    };

    const failing = Object.values(signals).filter((sig) => sig.state === 'past').map((sig) => sig.key);

    return {
      definition: {
        window,
        baselineDays: n - window,
        historyDays: n,
        requiredRun: m.requiredRun,
        thresholds: thresholdOf,
        frequencyLimit: limit,
        fatigueLevel: 0.5,
        // The verdict rule, evaluated: how many of the three metrics are past threshold.
        metricsPast: failing.length,
        metricsNeeded: 2,
        frequencyOverCap: frequency.isHigh,
      },
      signals,
      failing,
      frequency,
      cost,
      lead,
      pattern,
      projection,
    };
  }

  /**
   * Name the pattern. First match wins. "bend" = the window average has moved more than
   * half a threshold; "past" = over the threshold for the required consecutive days.
   * isCreativeProblem says whether replacing the creative is the fix: true, false, or
   * null when the data cannot say yet.
   */
  classifyPattern(prediction, signals, frequency, cost) {
    const base = this.classifyByMetrics(prediction, signals, frequency, cost);
    // Frequency over the cap makes the verdict fatigued on its own. If the metrics point
    // somewhere else (landing page, auction cost), both things are true: say both, rather
    // than telling the reader to keep a creative the verdict says to pause.
    if (frequency.isHigh && base.isCreativeProblem === false && prediction.status !== 'healthy') {
      return {
        code: 'saturation_compound',
        label: `Audience saturated, and: ${base.label.charAt(0).toLowerCase()}${base.label.slice(1)}`,
        isCreativeProblem: null,
        cause: `Frequency averaged ${frequency.windowAvg.toFixed(1)} over the recent window against a cap of ${frequency.limit}, which on its own makes the verdict fatigued. Separately: ${base.cause}`,
        action: `Bring frequency down first: widen or swap the audience, or rotate in a new creative. Then: ${base.action.replace(/^(Keep the creative\.|Do not replace the creative\.)\s*/, '')}`,
        secondary: base.code,
      };
    }
    return base;
  }

  classifyByMetrics(prediction, signals, frequency, cost) {
    const { ctr, cvr, roas } = signals;
    const bend = (sig) => sig.state === 'past' || sig.state === 'bending';
    // Signed whole percent; a change that rounds to zero prints as "flat", not "−0%".
    const pct = (v) => {
      const whole = Math.round(v * 100);
      return whole === 0 ? 'flat' : `${whole > 0 ? '+' : '−'}${Math.abs(whole)}%`;
    };
    const cpmUp = cost.cpm.change !== null && cost.cpm.change >= this.thresholds.cpmRisePercent;
    const fatigued = prediction.status === 'fatigued';

    if (prediction.status === 'healthy') {
      // A date exists for any negative CTR change, however small. Only call it a drift when
      // the change is visible (3 points or more) and not lost in day-to-day noise.
      const drifting = prediction.fatigueDate && Math.round(ctr.change * 100) <= -3 && ctr.evidence.level !== 'weak';
      return drifting
        ? {
          code: 'slow_drift',
          label: 'Healthy, drifting down slowly',
          isCreativeProblem: false,
          cause: `Every metric is within half its threshold of the creative's own baseline. CTR is ${pct(ctr.change)}, a slow drift rather than a drop.`,
          action: 'No action. Keep it running and have the next concept in the queue.',
        }
        : {
          code: 'healthy',
          label: 'Healthy',
          isCreativeProblem: false,
          cause: 'CTR, CVR and ROAS are all holding against the creative\'s own baseline.',
          action: 'No action.',
        };
    }

    if (frequency.isHigh && !bend(ctr) && !bend(cvr) && !bend(roas)) {
      return {
        code: 'saturation_leading',
        label: 'Audience saturated, metrics have not bent yet',
        isCreativeProblem: null,
        cause: `Frequency averaged ${frequency.windowAvg.toFixed(1)} over the recent window against a cap of ${frequency.limit}: the same people keep being shown this ad. CTR, CVR and ROAS have not responded yet. Frequency over the cap is an early warning that usually comes before a CTR drop, not proof that one has started.`,
        action: 'Widen or swap the audience to bring frequency down, and have a replacement creative ready in case CTR starts to fall.',
      };
    }

    if (!bend(ctr) && !bend(cvr) && cpmUp && bend(roas)) {
      return {
        code: 'cost_pressure',
        label: 'Auction got more expensive, not creative fatigue',
        isCreativeProblem: false,
        cause: `People respond to the ad as before (CTR ${pct(ctr.change)}, CVR ${pct(cvr.change)}), but each thousand impressions costs ${pct(cost.cpm.change)}. ROAS is down because the media price went up, not because the creative wore out.`,
        action: 'Do not replace the creative. Review bids, budget and placements, and check whether CPM rose across the whole account.',
      };
    }

    if (!bend(ctr) && bend(cvr)) {
      return {
        code: 'post_click_problem',
        label: 'Post-click problem, not creative fatigue',
        isCreativeProblem: false,
        cause: `The ad still earns the click (CTR ${pct(ctr.change)}), but fewer of those clicks convert (CVR ${pct(cvr.change)}). A worn-out creative loses the click first; losing only the conversion points past the ad, to the landing page, price, stock or tracking.`,
        action: 'Keep the creative. Check the landing page, offer, stock levels and conversion tracking.',
      };
    }

    // CTR and CVR both down, at least one of them past its threshold.
    if (bend(ctr) && bend(cvr) && (ctr.state === 'past' || cvr.state === 'past')) {
      return {
        code: 'full_funnel_fatigue',
        label: 'Burned out: fewer people click, and those who do buy less',
        isCreativeProblem: true,
        cause: `CTR ${pct(ctr.change)} and CVR ${pct(cvr.change)} are both down against the creative's own baseline, and ROAS is ${pct(roas.change)}. The responsive part of the audience has been used up: the ad now reaches people who have already ignored it or who were never a good fit.`,
        action: fatigued
          ? 'Pause it and replace it with a new concept, not a variation of this one.'
          : 'Prepare a new concept, not a variation of this one, and pause this creative if a second metric crosses its threshold.',
      };
    }

    // From here on CTR is bending and CVR is not.
    const cvrNote = (() => {
      if (cvr.change <= 0.05) return '';
      return cvr.evidence.level === 'weak' || cvr.evidence.level === 'unknown'
        ? ` CVR is ${pct(cvr.change)}, but that is within its day-to-day noise, so read it as holding.`
        : ` CVR is ${pct(cvr.change)}, which fits the curious dropping out first and leaving the people who came to buy.`;
    })();
    const roasNote = roas.state === 'past'
      ? ` ROAS is ${pct(roas.change)} and past its threshold too.`
      : '';

    if (bend(ctr) && frequency.reported && frequency.slopePerDay > 0
      && (frequency.isHigh || frequency.latest >= this.thresholds.frequencyNearCapShare * frequency.limit)) {
      return {
        code: 'creative_wearout',
        label: 'Creative wear-out: same people, seeing it again',
        isCreativeProblem: true,
        cause: `CTR is ${pct(ctr.change)} while frequency has climbed to ${frequency.latest.toFixed(1)} as of the latest day (cap ${frequency.limit}) and is still rising. Each repeat view is less likely to earn a click.${cvrNote}${roasNote}`,
        action: fatigued
          ? 'Pause it. Replace it with a new hook or visual for the same audience, or widen the audience to bring frequency down.'
          : 'Prepare a replacement with a new hook or visual for the same audience, or widen the audience to bring frequency down.',
      };
    }

    if (bend(ctr)) {
      return {
        code: 'click_erosion',
        label: 'Click-through erosion',
        isCreativeProblem: true,
        cause: `CTR is ${pct(ctr.change)} against its own baseline while CVR is ${pct(cvr.change)}: fewer people click, and the ones who do convert about as before.${roasNote}${frequency.reported ? '' : ' This platform does not report frequency, so repeat exposure cannot be confirmed as the cause.'}`,
        action: fatigued
          ? 'Pause it and replace it.'
          : `Prepare a replacement.${bend(roas) ? '' : ' ROAS is holding, so there is no need to pause early.'}`,
      };
    }

    return {
      code: 'efficiency_drop',
      label: 'Return is down without a click or conversion drop',
      isCreativeProblem: false,
      cause: `ROAS is ${pct(roas.change)} while CTR (${pct(ctr.change)}) and CVR (${pct(cvr.change)}) hold. That leaves order value or media cost.`,
      action: 'Check average order value and CPM before touching the creative.',
    };
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
      message: 'Insufficient data to predict fatigue (need at least 3 days with impressions)',
    };
  }

  addDays(date, days) {
    // UTC 毫秒运算：setDate 按本地时间走，跨夏令时会多/少一小时
    return new Date(date.getTime() + days * 864e5);
  }

  /**
   * 检查是否应该触发预警
   */
  shouldAlert(prediction, previousPrediction) {
    // healthy / unknown 不需要人处理，不发预警
    if (!prediction || prediction.status === 'healthy' || prediction.status === 'unknown') {
      return false;
    }

    const previous = FatiguePredictor.normalizePrediction(previousPrediction);
    if (!previous) return true;

    // 状态变化时触发
    if (prediction.status !== previous.status) {
      return true;
    }

    // 距离疲劳天数减少超过50%时触发（任一方为 null = 趋势平稳，不比较）
    const current = prediction.daysRemaining;
    if (Number.isFinite(previous.daysRemaining) && previous.daysRemaining > 0 &&
        Number.isFinite(current) && current < previous.daysRemaining * 0.5) {
      return true;
    }

    return false;
  }

  /**
   * 把数据库里的 predictions 行（snake_case、DECIMAL 字符串）和内存里的预测结果
   * 统一成同一个形状，便于比较。
   */
  static normalizePrediction(row) {
    if (!row) return null;
    const rawDays = row.daysRemaining !== undefined ? row.daysRemaining : row.days_remaining;
    const days = rawDays === null || rawDays === undefined ? null : Number(rawDays);
    const rawConfidence = row.confidence;
    return {
      status: row.status,
      daysRemaining: Number.isFinite(days) ? days : null,
      fatigueDate: row.fatigueDate ?? row.fatigue_date ?? null,
      confidence: rawConfidence === null || rawConfidence === undefined ? null : Number(rawConfidence),
      recommendation: row.recommendation ?? null,
    };
  }
}

export default FatiguePredictor;
