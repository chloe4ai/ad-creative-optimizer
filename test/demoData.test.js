// The hosted demo's sample data (frontend/lib/demoData.js): the numbers on screen are
// only worth showing if the generated histories add up and the engine reaches the
// verdicts the demo is built to illustrate.
//
// demoData.js depends only on the engine, so this runs in the root `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoState } from '../frontend/lib/demoData.js';

const skip = false;

const NOW = new Date('2026-03-10T15:00:00Z');
const state = buildDemoState(NOW);

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ~${expected}, got ${actual}`);

test('ten creatives, each with a history, a prediction and a diagnosis', { skip }, () => {
  assert.equal(state.creatives.length, 10);
  assert.equal(state.rows.length, 10);
  for (const { spec, dailyMetrics, prediction, diagnosis } of state.creatives) {
    assert.equal(dailyMetrics.length, spec.days, spec.name);
    assert.ok(['healthy', 'warning', 'fatigued'].includes(prediction.status), spec.name);
    assert.ok(diagnosis, `${spec.name} has no diagnosis`);
    assert.ok(diagnosis.signals && diagnosis.definition && diagnosis.projection && diagnosis.cost, spec.name);
    assert.equal(typeof diagnosis.pattern.code, 'string');
    assert.ok(diagnosis.pattern.cause.length > 0 && diagnosis.pattern.action.length > 0, spec.name);
    assert.equal(diagnosis.definition.historyDays, spec.days, spec.name);
  }
});

test('the money adds up on every daily row', { skip }, () => {
  for (const { spec, dailyMetrics } of state.creatives) {
    for (const row of dailyMetrics) {
      const where = `${spec.name} ${row.metric_date}`;
      assert.ok(Number.isInteger(row.impressions) && row.impressions > 0, where);
      assert.ok(Number.isInteger(row.clicks) && row.clicks > 0, where);
      assert.ok(Number.isInteger(row.conversions) && row.conversions > 0, where);
      assert.ok(row.spend > 0, where);
      // Every rate is derived from the counts on the same row.
      near(row.ctr, row.clicks / row.impressions, 1e-12, `${where} ctr`);
      near(row.cvr, row.conversions / row.clicks, 1e-12, `${where} cvr`);
      near(row.roas, row.revenue / row.spend, 1e-12, `${where} roas`);
      near(row.cpc, row.spend / row.clicks, 1e-12, `${where} cpc`);
      near(row.cpm, (row.spend / row.impressions) * 1000, 1e-9, `${where} cpm`);
      // Revenue per conversion stays within the generator's 4% jitter of the order value.
      near(row.revenue / row.conversions, spec.aov, spec.aov * 0.045, `${where} order value`);
    }
  }
});

test('only Meta rows carry a frequency, and it accumulates', { skip }, () => {
  for (const { spec, dailyMetrics, diagnosis } of state.creatives) {
    if (spec.platform === 'meta') {
      assert.equal(diagnosis.frequency.reported, true, spec.name);
      assert.ok(dailyMetrics.at(-1).frequency > dailyMetrics[0].frequency, `${spec.name} frequency should climb`);
    } else {
      assert.ok(dailyMetrics.every((d) => d.frequency === 0), spec.name);
      assert.equal(diagnosis.frequency.reported, false, spec.name);
    }
  }
  for (const row of state.rows) {
    if (row.platform === 'meta') assert.ok(row.frequency > 0, row.name);
    else assert.equal(row.frequency, null, `${row.name}: not reported must be null, not 0`);
  }
});

test('status mix: 3 healthy, 5 warning, 2 fatigued', { skip }, () => {
  const count = (status) => state.rows.filter((r) => r.status === status).length;
  assert.equal(count('healthy'), 3);
  assert.equal(count('warning'), 5);
  assert.equal(count('fatigued'), 2);
  assert.deepEqual(state.dashboard.statusStats, [
    { status: 'healthy', count: 3 },
    { status: 'warning', count: 5 },
    { status: 'fatigued', count: 2 },
  ]);
});

test('every pattern the demo is meant to show appears at least once', { skip }, () => {
  const codes = new Set(state.rows.map((r) => r.pattern_code));
  for (const code of [
    'creative_wearout', 'saturation_leading', 'full_funnel_fatigue', 'click_erosion',
    'post_click_problem', 'cost_pressure', 'healthy',
  ]) {
    assert.ok(codes.has(code), `no sample creative is diagnosed as ${code} (have: ${[...codes].join(', ')})`);
  }
});

test('the verdict and the CTR half-life are separate facts in the sample set', { skip }, () => {
  const has = (predicate, what) => assert.ok(state.rows.some(predicate), `no sample creative is ${what}`);
  has((r) => r.status === 'fatigued' && r.days_remaining === null, 'fatigued with no CTR half-life');
  has((r) => r.status === 'healthy' && Number.isFinite(r.days_remaining), 'healthy with a CTR half-life');
  has((r) => r.status !== 'healthy' && r.is_creative_problem === false, 'flagged but not a creative problem');
  for (const row of state.rows) {
    assert.equal(row.fatigue_date === null, row.days_remaining === null, row.name);
  }
});

test('list rows repeat what the diagnosis says', { skip }, () => {
  for (const { spec, prediction, diagnosis } of state.creatives) {
    const row = state.rows.find((r) => r.id === spec.id);
    assert.equal(row.status, prediction.status);
    assert.equal(row.days_remaining, prediction.daysRemaining);
    assert.equal(row.pattern_code, diagnosis.pattern.code);
    assert.equal(row.pattern_label, diagnosis.pattern.label);
    assert.equal(row.is_creative_problem, diagnosis.pattern.isCreativeProblem);
    assert.equal(row.lead_signal, diagnosis.lead);
    assert.deepEqual(row.failing_metrics, diagnosis.failing);
    assert.equal(row.ctr_change, diagnosis.signals.ctr.change);
    assert.equal(row.frequency_limit, diagnosis.frequency.limit);
    assert.equal(row.ctr_series.length, spec.days);
    assert.deepEqual(state.details[spec.id].pattern_code, row.pattern_code);
    assert.equal(state.details[spec.id].dailyMetrics.length, spec.days);
  }
});

test('needsAction holds every warning and fatigued creative, fatigued first', { skip }, () => {
  const flagged = state.rows.filter((r) => r.status === 'warning' || r.status === 'fatigued');
  const { needsAction } = state.dashboard;
  assert.deepEqual(needsAction.map((r) => r.id).sort((a, b) => a - b), flagged.map((r) => r.id).sort((a, b) => a - b));
  assert.equal(needsAction.length, 7);
  const firstWarning = needsAction.findIndex((r) => r.status === 'warning');
  assert.ok(needsAction.slice(firstWarning).every((r) => r.status === 'warning'), 'a fatigued creative is listed after a warning');

  // One alert per flagged creative, with the diagnosis attached.
  assert.equal(state.alerts.length, flagged.length);
  assert.equal(state.dashboard.todayAlerts, flagged.length);
  for (const alert of state.alerts) {
    const row = state.rows.find((r) => r.id === alert.creativeId);
    assert.equal(alert.pattern_label, row.pattern_label);
    assert.equal(alert.is_creative_problem, row.is_creative_problem);
    assert.equal(alert.severity, row.status === 'fatigued' ? 'critical' : 'warning');
  }

  // Spend at risk is the flagged creatives' share of daily spend.
  const sum = (list) => list.reduce((a, r) => a + r.spend_per_day, 0);
  near(state.dashboard.dailySpend, sum(state.rows), 0.5, 'dailySpend');
  near(state.dashboard.dailySpendAtRisk, sum(needsAction), 0.5, 'dailySpendAtRisk');
  assert.ok(state.dashboard.dailySpendAtRisk < state.dashboard.dailySpend);
});

test('a different "now" changes dates and nothing else', { skip }, () => {
  const other = buildDemoState(new Date('2026-07-22T09:30:00Z'));
  const DATE_KEYS = new Set(['date', 'metric_date', 'fatigue_date', 'fatigueDate', 'updated_at', 'launched_at',
    'flight_end', 'created_at', 'last_sync_at', 'lastSync', 'crossedDate', 'firstOverDate']);
  // Drop date-valued fields and the alert id (which embeds the sync timestamp).
  const strip = (value, key) => {
    if (value instanceof Date) return undefined;
    if (Array.isArray(value)) return value.map((v) => strip(v));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([k]) => !DATE_KEYS.has(k))
        .map(([k, v]) => [k, strip(v, k)]));
    }
    if (key === 'id' && typeof value === 'string' && value.startsWith('alert_')) return 'alert';
    return value;
  };
  assert.deepEqual(strip(other.rows), strip(state.rows));
  assert.deepEqual(strip(other.alerts), strip(state.alerts));
  assert.deepEqual(strip(other.dashboard), strip(state.dashboard));
  assert.deepEqual(strip(other.creatives), strip(state.creatives));

  // And the same "now" twice is identical, dates included.
  assert.deepEqual(buildDemoState(NOW).rows, state.rows);
});
