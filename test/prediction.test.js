// 疲劳预测引擎的回归测试。
// 每一组都对应一个真实出过问题的场景：短生命周期素材被切空基准段、
// 非 Meta 平台套用 Meta 的频次上限、窗口跌幅被当成日跌幅、以及单天噪声直接报警。
import test from 'node:test';
import assert from 'node:assert/strict';
import { FatiguePredictor } from '../src/services/prediction.js';

const day = (ctr, cvr = 0.03, roas = 4, frequency = 2) => ({ ctr, cvr, roas, frequency, spend: 100 });

/** 前 half 天走基准值，后 half 天按 drop 比例下跌 */
const series = (days, drop) =>
  Array.from({ length: days }, (_, i) =>
    day(i < Math.ceil(days / 2) ? 0.05 : 0.05 * (1 - drop))
  );

const flat = (days, frequency = 2) =>
  Array.from({ length: days }, () => day(0.05, 0.03, 4, frequency));

test('少于 3 天的数据不给预测', () => {
  const p = new FatiguePredictor();
  for (const n of [0, 1, 2]) {
    const r = p.predict(flat(n));
    assert.equal(r.status, 'unknown');
    assert.equal(r.confidence, 0);
  }
  assert.equal(p.predict(null).status, 'unknown');
  assert.equal(p.predict(undefined).status, 'unknown');
});

test('基准段永远不为空 —— 3 到 7 天的素材也要有真实基准', () => {
  const p = new FatiguePredictor();
  // 回归：以前用 slice(0, -7) 切基准段，n<=7 时基准段是空的，
  // 所有指标都跟 0 比较，change 恒为 +100%，任何暴跌都显示 healthy。
  for (let n = 3; n <= 7; n++) {
    const r = p.predict(series(n, 0.8));
    assert.ok(r.metricsChange.ctr.baseline > 0, `n=${n} 基准段被切空了`);
    assert.ok(r.metricsChange.ctr.change < 0, `n=${n} 跌了 80% 却算成上涨`);
    assert.notEqual(r.status, 'healthy', `n=${n} 跌了 80% 还判 healthy`);
  }
});

test('对比窗口不超过序列的一半，且最长 7 天', () => {
  const p = new FatiguePredictor();
  assert.equal(p.predict(flat(3)).window, 1);
  assert.equal(p.predict(flat(6)).window, 3);
  assert.equal(p.predict(flat(14)).window, 7);
  assert.equal(p.predict(flat(60)).window, 7);
});

test('频次上限按平台取，不是一律套 Meta 的 5', () => {
  const p = new FatiguePredictor();
  const expected = { meta: 5, tiktok: 8, google: 10, pinterest: 7, linkedin: 6 };
  for (const [platform, limit] of Object.entries(expected)) {
    assert.equal(p.frequencyLimitFor(platform), limit, `${platform} 的上限取错了`);
    assert.equal(p.predict(flat(14), { platform }).metricsChange.frequency.limit, limit);
  }
  // 平台大小写不敏感
  assert.equal(p.frequencyLimitFor('Google'), 10);
});

test('平台未知或未传时退回最保守的 Meta 上限', () => {
  const p = new FatiguePredictor();
  assert.equal(p.frequencyLimitFor(undefined), 5);
  assert.equal(p.frequencyLimitFor('snapchat'), 5);
  assert.equal(p.predict(flat(14)).metricsChange.frequency.limit, 5);
});

test('Google 素材频次 6 不该被判疲劳', () => {
  const p = new FatiguePredictor();
  // 回归：以前一律用 meta 的上限 5，频次 6 的 Google 素材（正常范围）
  // 会被直接判 fatigued 并建议 pause。
  const r = p.predict(flat(14, 6), { platform: 'google' });
  assert.equal(r.metricsChange.frequency.isHigh, false);
  assert.equal(r.status, 'healthy');
  assert.equal(r.recommendation, 'keep');
});

test('同一个频次在 Meta 上仍然要报警', () => {
  const p = new FatiguePredictor();
  const r = p.predict(flat(14, 6), { platform: 'meta' });
  assert.equal(r.metricsChange.frequency.isHigh, true);
  assert.equal(r.status, 'fatigued');
  assert.equal(r.recommendation, 'pause');
});

test('小于半程阈值的噪声不报警', () => {
  const p = new FatiguePredictor();
  // 回归：以前 ctr.change < 0 就报 warning，-0.6% 的正常波动也会报。
  for (const drop of [0.001, 0.006, 0.02, 0.07]) {
    const r = p.predict(series(14, drop));
    assert.equal(r.status, 'healthy', `跌 ${(drop * 100).toFixed(1)}% 就报警了`);
  }
});

test('跌幅过了半程阈值才升为 warning', () => {
  const p = new FatiguePredictor();
  // CTR 阈值 15%，半程是 7.5%
  assert.equal(p.predict(series(14, 0.07)).status, 'healthy');
  assert.equal(p.predict(series(14, 0.10)).status, 'warning');
});

test('两个以上指标同时跌破阈值才算 fatigued', () => {
  const p = new FatiguePredictor();
  const decline = Array.from({ length: 14 }, (_, i) =>
    i < 7 ? day(0.05, 0.03, 4) : day(0.05 * 0.6, 0.03 * 0.6, 4 * 0.6)
  );
  const r = p.predict(decline);
  assert.equal(r.metricsChange.ctr.isFatigued, true);
  assert.equal(r.metricsChange.cvr.isFatigued, true);
  assert.equal(r.status, 'fatigued');
  assert.equal(r.recommendation, 'pause');
});

test('单指标跌破阈值只到 warning', () => {
  const p = new FatiguePredictor();
  const r = p.predict(series(14, 0.4));   // 只有 CTR 掉
  assert.equal(r.metricsChange.ctr.isFatigued, true);
  assert.equal(r.metricsChange.cvr.isFatigued, false);
  assert.equal(r.status, 'warning');
  assert.equal(r.recommendation, 'rotate');
});

test('要连续几天掉下去才判疲劳，单天暴跌不算', () => {
  const p = new FatiguePredictor();
  const oneBadDay = [...flat(13), day(0.05 * 0.3, 0.03 * 0.3, 4 * 0.3)];
  const r = p.predict(oneBadDay);
  assert.equal(r.metricsChange.ctr.consecutiveDaysBelow, 1);
  assert.equal(r.metricsChange.requiredRun, 3);
  assert.equal(r.metricsChange.ctr.isFatigued, false);

  const threeBadDays = [...flat(11), ...Array.from({ length: 3 }, () => day(0.05 * 0.3, 0.03 * 0.3, 4 * 0.3))];
  const r2 = p.predict(threeBadDays);
  assert.equal(r2.metricsChange.ctr.consecutiveDaysBelow, 3);
  assert.equal(r2.metricsChange.ctr.isFatigued, true);
});

test('剩余寿命按日衰减率外推，不是按窗口跌幅', () => {
  const p = new FatiguePredictor();
  // 一周跌一半 —— 再跌一半差不多还要一周，不是 1 天。
  const r = p.predict(series(14, 0.5));
  assert.equal(r.spanDays, 7);
  assert.ok(r.daysRemaining >= 5 && r.daysRemaining <= 9,
    `一周跌 50%，剩余寿命应在一周上下，实际 ${r.daysRemaining}`);
});

test('跌得越快，剩余寿命越短，且始终为正', () => {
  const p = new FatiguePredictor();
  let previous = Infinity;
  for (const drop of [0.10, 0.25, 0.5, 0.75, 0.95]) {
    const r = p.predict(series(14, drop));
    assert.ok(r.daysRemaining > 0, `drop=${drop} 剩余寿命不是正数`);
    assert.ok(Number.isFinite(r.daysRemaining), `drop=${drop} 剩余寿命不是有限数`);
    assert.ok(r.daysRemaining <= previous, `drop=${drop} 跌得更快反而活得更久`);
    previous = r.daysRemaining;
  }
});

test('CTR 归零不会产生 NaN 或 Invalid Date', () => {
  const p = new FatiguePredictor();
  const toZero = [...flat(7), ...Array.from({ length: 7 }, () => day(0, 0, 0, 2))];
  const r = p.predict(toZero);
  assert.equal(r.metricsChange.ctr.change, -1);
  assert.ok(Number.isFinite(r.daysRemaining));
  assert.ok(r.daysRemaining >= 0);
  assert.ok(!Number.isNaN(r.fatigueDate.getTime()));
});

test('还在涨的素材给 14 天默认预测', () => {
  const p = new FatiguePredictor();
  const rising = Array.from({ length: 14 }, (_, i) => day(0.03 + i * 0.002));
  const r = p.predict(rising);
  assert.ok(r.metricsChange.ctr.change > 0);
  assert.equal(r.status, 'healthy');
  assert.ok(r.daysRemaining >= 13 && r.daysRemaining <= 14);
});

test('缺失字段按 0 处理，不抛异常', () => {
  const p = new FatiguePredictor();
  const partial = Array.from({ length: 10 }, () => ({ ctr: 0.05 }));
  const r = p.predict(partial);
  assert.equal(r.metricsChange.cvr.current, 0);
  assert.equal(r.metricsChange.frequency.current, 0);
  assert.ok(Number.isFinite(r.daysRemaining));
});

test('置信度随数据量单调不降', () => {
  const p = new FatiguePredictor();
  let previous = 0;
  for (const n of [3, 7, 14, 30, 60]) {
    const c = p.calculateConfidence(n);
    assert.ok(c >= previous, `n=${n} 置信度反而降了`);
    previous = c;
  }
  assert.equal(p.calculateConfidence(2), 0.3);
  assert.equal(p.calculateConfidence(60), 0.95);
});

test('shouldAlert：首次预测、状态变化、寿命腰斩时触发', () => {
  const p = new FatiguePredictor();
  assert.equal(p.shouldAlert({ status: 'healthy', daysRemaining: 20 }, null), true);
  assert.equal(
    p.shouldAlert({ status: 'warning', daysRemaining: 20 }, { status: 'healthy', daysRemaining: 20 }),
    true
  );
  assert.equal(
    p.shouldAlert({ status: 'healthy', daysRemaining: 8 }, { status: 'healthy', daysRemaining: 20 }),
    true
  );
  assert.equal(
    p.shouldAlert({ status: 'healthy', daysRemaining: 18 }, { status: 'healthy', daysRemaining: 20 }),
    false
  );
});

test('平均值算的是各天的算术平均', () => {
  const p = new FatiguePredictor();
  const avg = p.calculateAverages([day(0.02), day(0.04), day(0.06)]);
  assert.ok(Math.abs(avg.ctr - 0.04) < 1e-12);
  assert.equal(avg.spend, 100);
  // 空数组要返回齐全的零值，包括 spend
  assert.deepEqual(p.calculateBaseline([]), { ctr: 0, cvr: 0, roas: 0, freq: 0, spend: 0 });
});
