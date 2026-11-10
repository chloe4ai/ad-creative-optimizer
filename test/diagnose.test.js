// Tests for FatiguePredictor.diagnose() and classifyPattern(): the layer that says WHY a
// verdict came out the way it did (which signal led, whether it is the creative at all).
// Same idea as prediction.test.js: every series is small and synthetic, so the expected
// answer can be worked out by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FatiguePredictor } from '../src/services/prediction.js';

const DAY_MS = 864e5;
const START = Date.UTC(2026, 8, 1); // 2026-09-01
const NOW = new Date('2026-10-01T00:00:00Z');
const dateAt = (i) => new Date(START + i * DAY_MS).toISOString().slice(0, 10);

/**
 * Full daily rows whose money adds up: clicks = impressions x ctr, conversions =
 * clicks x cvr, revenue = conversions x aov, spend from the buying model, and every rate
 * derived from the counts. Each knob is a function of the day index.
 */
const build = ({
  days = 14,
  impressions = 100000,
  ctr = () => 0.02,
  cvr = () => 0.05,
  aov = () => 50,
  cpm = () => 10,
  cpc = null,            // set to pay per click instead of per impression
  frequency = () => 0,
} = {}) => Array.from({ length: days }, (_, i) => {
  const clicks = Math.round(impressions * ctr(i));
  const conversions = Math.round(clicks * cvr(i));
  const spend = cpc ? clicks * cpc(i) : (impressions / 1000) * cpm(i);
  const revenue = conversions * aov(i);
  return {
    date: dateAt(i),
    impressions,
    clicks,
    conversions,
    spend,
    revenue,
    ctr: clicks / impressions,
    cvr: clicks > 0 ? conversions / clicks : 0,
    roas: spend > 0 ? revenue / spend : 0,
    cpm: (spend / impressions) * 1000,
    frequency: frequency(i),
  };
});

/** `base` until day `from`, then base x (1 - drop). */
const step = (base, drop, from = 7) => (i) => (i < from ? base : base * (1 - drop));

const run = (rows, platform) => {
  const p = new FatiguePredictor();
  const prediction = p.predict(rows, { platform, now: NOW });
  return { p, prediction, d: p.diagnose(prediction, rows) };
};

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message || 'value'}: expected ~${expected}, got ${actual}`);

// ---- Patterns ----------------------------------------------------------------

test('insufficient data -> insufficient_data, and nothing else is asserted', () => {
  const { prediction, d } = run(build({ days: 2 }));
  assert.equal(prediction.status, 'unknown');
  assert.equal(d.pattern.code, 'insufficient_data');
  assert.equal(d.pattern.isCreativeProblem, null);
  assert.equal(d.signals, null);
  assert.equal(d.definition, null);
  assert.equal(d.lead, null);
  assert.equal(d.projection, null);

  // Bad arguments get the same answer instead of throwing.
  const p = new FatiguePredictor();
  assert.equal(p.diagnose(null, []).pattern.code, 'insufficient_data');
  assert.equal(p.diagnose(p.predict(build(), { now: NOW }), null).pattern.code, 'insufficient_data');
});

test('flat series -> healthy, no lead, nothing failing', () => {
  const { prediction, d } = run(build());
  assert.equal(prediction.status, 'healthy');
  assert.equal(d.pattern.code, 'healthy');
  assert.equal(d.pattern.isCreativeProblem, false);
  assert.equal(d.lead, null);
  assert.deepEqual(d.failing, []);
  assert.equal(d.definition.metricsPast, 0);
  assert.equal(d.definition.frequencyOverCap, false);
});

test('healthy with a shallow CTR decline -> slow_drift (healthy verdict, but a CTR half-life exists)', () => {
  const { prediction, d } = run(build({ ctr: step(0.02, 0.05), cpc: () => 0.5 }));
  assert.equal(prediction.status, 'healthy');
  assert.ok(Number.isFinite(prediction.daysRemaining));
  assert.equal(d.pattern.code, 'slow_drift');
  assert.equal(d.pattern.isCreativeProblem, false);
  assert.equal(d.lead, null);
});

test('CTR-only decline, no frequency -> click_erosion, lead ctr', () => {
  // Paid per click, so spend falls with the clicks and ROAS holds.
  const { prediction, d } = run(build({ ctr: step(0.02, 0.3), cpc: () => 0.5 }), 'google');
  assert.equal(prediction.status, 'warning');
  assert.equal(d.pattern.code, 'click_erosion');
  assert.equal(d.pattern.isCreativeProblem, true);
  assert.equal(d.lead, 'ctr');
  assert.deepEqual(d.failing, ['ctr']);
  assert.equal(d.signals.cvr.state, 'holding');
  assert.equal(d.signals.roas.state, 'holding');
  // The cause says why repeat exposure cannot be confirmed.
  assert.match(d.pattern.cause, /does not report frequency/);
});

test('CTR and ROAS past together still lead with CTR (further past its own threshold)', () => {
  // Paid per impression: ROAS falls 30% with the clicks. Same run length, so the tie is
  // broken by change / threshold: -30% is 2.0 CTR thresholds but only 1.2 ROAS thresholds.
  const { prediction, d } = run(build({ ctr: step(0.02, 0.3) }), 'tiktok');
  assert.equal(prediction.status, 'fatigued');
  assert.deepEqual(d.failing, ['ctr', 'roas']);
  assert.equal(d.pattern.code, 'click_erosion');
  assert.equal(d.lead, 'ctr');
});

test('CTR decline with rising Meta frequency -> creative_wearout', () => {
  const { d } = run(build({ ctr: step(0.02, 0.3), cpc: () => 0.5, frequency: (i) => 1 + 0.25 * i }), 'meta');
  assert.equal(d.frequency.reported, true);
  assert.equal(d.frequency.isHigh, false);
  assert.ok(d.frequency.slopePerDay > 0);
  assert.equal(d.pattern.code, 'creative_wearout');
  assert.equal(d.pattern.isCreativeProblem, true);
  assert.equal(d.lead, 'ctr');

  // Same CTR decline at a low, flat frequency is not blamed on repeat exposure.
  const low = run(build({ ctr: step(0.02, 0.3), cpc: () => 0.5, frequency: () => 1.5 }), 'meta');
  assert.equal(low.d.pattern.code, 'click_erosion');
  assert.doesNotMatch(low.d.pattern.cause, /does not report frequency/);
});

test('frequency over the cap with flat metrics -> saturation_leading, lead frequency', () => {
  // 3.0, 3.3, ... crosses Meta's cap of 5 on day index 7 (5.1).
  const rows = build({ frequency: (i) => 3 + 0.3 * i });
  const { prediction, d } = run(rows, 'meta');
  assert.equal(prediction.status, 'fatigued');
  assert.equal(prediction.daysRemaining, null, 'fatigued verdict without a CTR half-life');
  assert.equal(d.pattern.code, 'saturation_leading');
  assert.equal(d.pattern.isCreativeProblem, null, 'frequency alone cannot say whether the creative is the problem');
  assert.equal(d.lead, 'frequency');
  assert.deepEqual(d.failing, []);
  assert.equal(d.definition.metricsPast, 0);
  assert.equal(d.definition.frequencyOverCap, true);
  assert.equal(d.frequency.limit, 5);
  assert.equal(d.frequency.firstOverIndex, 7);
  assert.equal(d.frequency.firstOverDate, rows[7].date);
  assert.equal(d.frequency.daysToCap, null, 'already over the cap');
  near(d.frequency.windowAvg, 6, 1e-9, 'window average frequency');

  // The same series on a platform with a higher cap is healthy.
  const google = run(rows, 'google');
  assert.equal(google.prediction.status, 'healthy');
  assert.equal(google.d.pattern.code, 'healthy');
  assert.equal(google.d.frequency.firstOverIndex, null);
});

test('CTR and CVR both past -> full_funnel_fatigue', () => {
  const { prediction, d } = run(build({ ctr: step(0.02, 0.4), cvr: step(0.05, 0.4) }));
  assert.equal(prediction.status, 'fatigued');
  assert.equal(d.pattern.code, 'full_funnel_fatigue');
  assert.equal(d.pattern.isCreativeProblem, true);
  assert.deepEqual(d.failing, ['ctr', 'cvr', 'roas']);
  assert.equal(d.definition.metricsPast, 3);
  assert.equal(d.definition.metricsNeeded, 2);
});

test('CVR down with CTR flat -> post_click_problem, not a creative problem', () => {
  const { prediction, d } = run(build({ cvr: step(0.05, 0.3) }), 'meta');
  assert.equal(d.pattern.code, 'post_click_problem');
  assert.equal(d.pattern.isCreativeProblem, false);
  assert.equal(d.signals.ctr.state, 'holding');
  assert.equal(d.signals.cvr.state, 'past');
  assert.equal(d.lead, 'cvr');
  // Known limit, pinned on purpose: the verdict rule counts CVR and the ROAS it drags
  // down, so the status still reads fatigued. Only the diagnosis says "not the creative".
  assert.equal(prediction.status, 'fatigued');
  assert.equal(prediction.daysRemaining, null);
});

test('CPM up 30% with CTR and CVR flat -> cost_pressure, lead cpm', () => {
  // ROAS is derived (revenue / spend), so it falls to 1/1.3 of baseline: -23%.
  const { prediction, d } = run(build({ cpm: (i) => (i < 7 ? 10 : 13) }), 'tiktok');
  near(d.cost.cpm.change, 0.3, 1e-9, 'CPM change');
  near(d.signals.roas.change, 1 / 1.3 - 1, 1e-9, 'ROAS change');
  assert.equal(d.signals.ctr.state, 'holding');
  assert.equal(d.signals.cvr.state, 'holding');
  assert.equal(d.signals.roas.state, 'bending');
  assert.equal(prediction.status, 'warning');
  assert.equal(d.pattern.code, 'cost_pressure');
  assert.equal(d.pattern.isCreativeProblem, false);
  assert.equal(d.lead, 'cpm');
});

test('ROAS down with CTR, CVR and CPM flat -> efficiency_drop (order value), lead roas', () => {
  const { prediction, d } = run(build({ aov: step(50, 0.3) }));
  assert.equal(prediction.status, 'warning');
  assert.equal(d.pattern.code, 'efficiency_drop');
  assert.equal(d.pattern.isCreativeProblem, false);
  assert.equal(d.lead, 'roas');
  near(d.cost.aov.change, -0.3, 1e-9, 'AOV change');
  near(d.cost.cpm.change, 0, 1e-9, 'CPM change');
});

test('every pattern carries a label, a cause and an action', () => {
  const cases = [
    build({ days: 2 }),
    build(),
    build({ ctr: step(0.02, 0.3), cpc: () => 0.5 }),
    build({ ctr: step(0.02, 0.4), cvr: step(0.05, 0.4) }),
    build({ cvr: step(0.05, 0.3) }),
    build({ cpm: (i) => (i < 7 ? 10 : 13) }),
    build({ aov: step(50, 0.3) }),
    build({ frequency: () => 6 }),
  ];
  for (const rows of cases) {
    const { d } = run(rows, 'meta');
    for (const field of ['code', 'label', 'cause', 'action']) {
      assert.equal(typeof d.pattern[field], 'string', `${d.pattern.code}.${field}`);
      assert.ok(d.pattern[field].length > 0, `${d.pattern.code}.${field} is empty`);
    }
    assert.doesNotMatch(d.pattern.cause, /NaN|undefined|null/, d.pattern.code);
  }
});

// ---- Per-signal detail -------------------------------------------------------

test('signal state: past, bending, holding, improving', () => {
  const stateFor = (drop) => run(build({ ctr: step(0.02, drop), cpc: () => 0.5 })).d.signals.ctr.state;
  assert.equal(stateFor(0.3), 'past');        // over the 15% threshold, 7 days running
  assert.equal(stateFor(0.1), 'bending');     // more than halfway (7.5%), not over
  assert.equal(stateFor(0.05), 'holding');    // less than halfway
  assert.equal(stateFor(0), 'holding');
  assert.equal(stateFor(-0.05), 'holding');   // up, but by less than half a threshold
  assert.equal(stateFor(-0.1), 'improving');  // up by more than half a threshold

  // Over the threshold on the window average but not for enough consecutive days:
  // bending, not past. Days 7-11 at -30%, then two days back above the line.
  const recovered = run(build({
    ctr: (i) => (i >= 7 && i <= 11 ? 0.014 : 0.02),
    cpc: () => 0.5,
  })).d.signals.ctr;
  assert.ok(recovered.change < -recovered.threshold);
  assert.equal(recovered.consecutiveDaysBelow, 0);
  assert.equal(recovered.state, 'bending');
  assert.equal(recovered.crossedIndex, null);
  assert.equal(recovered.crossedDate, null);
});

test('crossedIndex and crossedDate are the first day of the trailing run', () => {
  // Flat for 10 days, then 4 days at -30%: window average is -17%, run is 4.
  const rows = build({ ctr: step(0.02, 0.3, 10), cpc: () => 0.5 });
  const { prediction, d } = run(rows);
  const sig = d.signals.ctr;
  assert.equal(sig.state, 'past');
  assert.equal(sig.consecutiveDaysBelow, 4);
  assert.equal(sig.consecutiveDaysBelow, prediction.metricsChange.ctr.consecutiveDaysBelow);
  assert.equal(sig.crossedIndex, 10);
  assert.equal(sig.crossedIndex, rows.length - sig.consecutiveDaysBelow);
  assert.equal(sig.crossedDate, rows[10].date);
  // Signals that never crossed have no crossing.
  assert.equal(d.signals.cvr.crossedIndex, null);
  assert.equal(d.signals.cvr.crossedDate, null);
});

test('crossedIndex counts from the oldest day even when rows arrive newest first', () => {
  const rows = build({ ctr: step(0.02, 0.3, 10), cpc: () => 0.5 });
  const { d } = run([...rows].reverse());
  assert.equal(d.signals.ctr.crossedIndex, 10);
  assert.equal(d.signals.ctr.crossedDate, rows[10].date);
});

test('thresholdValue = baseline x (1 - threshold), in the metric\'s own units', () => {
  const { p, d } = run(build({ ctr: step(0.02, 0.3) }));
  const expected = { ctr: p.thresholds.ctrDropPercent, cvr: p.thresholds.cvrDropPercent, roas: p.thresholds.roasDropPercent };
  for (const key of ['ctr', 'cvr', 'roas']) {
    const sig = d.signals[key];
    assert.equal(sig.key, key);
    assert.equal(sig.threshold, expected[key]);
    near(sig.thresholdValue, sig.baseline * (1 - expected[key]), 1e-12, `${key} thresholdValue`);
  }
  near(d.signals.ctr.thresholdValue, 0.02 * 0.85, 1e-12, 'CTR line');
  near(d.signals.cvr.thresholdValue, 0.05 * 0.8, 1e-12, 'CVR line');
  assert.deepEqual(d.definition.thresholds, expected);
});

// A zig-zag of +/- `amp` around the level: day-to-day noise with a known size.
const noisy = (base, drop, amp, from = 7) => (i) => (i < from ? base : base * (1 - drop)) * (1 + (i % 2 ? amp : -amp));

test('evidence compares the drop with the day-to-day spread: strong when clean, weak when noisy', () => {
  // -25% CTR on a series that barely moves from day to day.
  const clean = run(build({ ctr: noisy(0.02, 0.25, 0.01), cpc: () => 0.5 })).d.signals.ctr;
  assert.equal(clean.evidence.level, 'strong');
  assert.ok(clean.evidence.z < -3);

  // A -10% average shift on a series that swings +/-40% a day is not distinguishable.
  const loud = run(build({ ctr: noisy(0.02, 0.10, 0.4), cpc: () => 0.5 })).d.signals.ctr;
  assert.equal(loud.evidence.level, 'weak');
  assert.ok(Math.abs(loud.evidence.z) < 2);
});

test('a clean step has finite, capped evidence whichever side of the ratio moved', () => {
  // ROAS -30% via order value, and ROAS down via CPM +40%: both are noiseless steps.
  const viaAov = run(build({ aov: step(50, 0.3) })).d.signals.roas.evidence;
  const viaCpm = run(build({ cpm: (i) => (i < 7 ? 10 : 14) })).d.signals.roas.evidence;
  for (const e of [viaAov, viaCpm]) {
    assert.equal(e.level, 'strong');
    assert.ok(Number.isFinite(e.z) && Math.abs(e.z) <= 10);
  }
  // No change at all: z is 0, not unknown.
  assert.equal(run(build()).d.signals.ctr.evidence.z, 0);
});

test('evidence does not gate the verdict (known limit, pinned)', () => {
  // CTR alternates between -60% and +10% of baseline in the recent window. The average
  // is past threshold but the run of consecutive days is what stops the metric, not the
  // evidence level: a weak-evidence drop that does persist still raises the verdict.
  const rows = build({ ctr: (i) => (i < 7 ? 0.02 * (1 + (i % 2 ? 0.5 : -0.5)) : 0.02 * 0.78), cpc: () => 0.5 });
  const { prediction, d } = run(rows);
  assert.equal(d.signals.ctr.evidence.level, 'weak', 'baseline swings +/-50%, so a -22% shift is weak evidence');
  assert.equal(d.signals.ctr.state, 'past');
  assert.equal(prediction.status, 'warning');
  assert.equal(prediction.recommendation, 'rotate');
});

// ---- Frequency ---------------------------------------------------------------

test('frequency.reported is false when every row is 0, and nothing is invented', () => {
  const { d } = run(build({ ctr: step(0.02, 0.3) }), 'tiktok');
  assert.deepEqual(d.frequency, {
    reported: false, limit: 8, isHigh: false, latest: null, windowAvg: null,
    slopePerDay: null, firstOverIndex: null, firstOverDate: null, daysToCap: null,
  });
  assert.notEqual(d.pattern.code, 'creative_wearout');
  assert.notEqual(d.lead, 'frequency');
});

test('daysToCap = days until the latest frequency reaches the cap at the window slope', () => {
  // 1.00, 1.25, ... 4.25 on day 14; +0.25 a day; cap 5 -> 3 more days.
  const { d } = run(build({ frequency: (i) => 1 + 0.25 * i }), 'meta');
  assert.equal(d.frequency.reported, true);
  assert.equal(d.frequency.latest, 4.25);
  assert.equal(d.frequency.slopePerDay, 0.25);
  assert.equal(d.frequency.isHigh, false);
  assert.equal(d.frequency.firstOverIndex, null);
  assert.equal(d.frequency.daysToCap, 3);

  // Flat frequency never reaches the cap.
  assert.equal(run(build({ frequency: () => 2 }), 'meta').d.frequency.daysToCap, null);
});

// ---- Definition and projection -----------------------------------------------

test('definition reports the window, baseline and run the verdict actually used', () => {
  const cases = [
    { days: 3, window: 1, requiredRun: 1 },
    { days: 6, window: 3, requiredRun: 3 },
    { days: 10, window: 5, requiredRun: 3 },
    { days: 14, window: 7, requiredRun: 3 },
    { days: 40, window: 7, requiredRun: 3 },
  ];
  for (const c of cases) {
    const { prediction, d } = run(build({ days: c.days }), 'meta');
    assert.equal(d.definition.window, c.window, `${c.days} days: window`);
    assert.equal(d.definition.window, prediction.window);
    assert.equal(d.definition.baselineDays, c.days - c.window, `${c.days} days: baseline`);
    assert.equal(d.definition.historyDays, c.days);
    assert.equal(d.definition.requiredRun, c.requiredRun, `${c.days} days: required run`);
    assert.equal(d.definition.frequencyLimit, 5);
    assert.equal(d.definition.fatigueLevel, 0.5);
  }
});

test('zero-impression days do not count toward the history', () => {
  const rows = build();
  const gaps = [3, 9].map((i) => ({ ...rows[i], impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0, ctr: 0, cvr: 0, roas: 0 }));
  const withGaps = [...rows, ...gaps];
  const { d } = run(withGaps);
  assert.equal(d.definition.historyDays, 14);
  assert.equal(d.pattern.code, 'healthy');
});

test('a step down that has stopped is not extrapolated', () => {
  // CTR steps down on day 7 and then stays flat. The engine field still carries a date
  // (window-to-window rate), but the diagnosis refuses to present it as a countdown.
  for (const drop of [0.1, 0.25, 0.4]) {
    const { prediction, d } = run(build({ ctr: step(0.02, drop), cpc: () => 0.5 }));
    assert.ok(Number.isFinite(prediction.daysRemaining));
    assert.equal(d.projection.engineDays, prediction.daysRemaining, `drop ${drop}`);
    assert.equal(d.projection.basis, 'ctr_half_baseline');
    near(d.projection.level, d.signals.ctr.baseline * 0.5, 1e-12, 'half-baseline level');
    assert.equal(d.projection.declineStopped, true, `drop ${drop}`);
    assert.equal(d.projection.alreadyBelow, false, `drop ${drop}: CTR is at ${1 - drop} of baseline`);
    assert.equal(d.projection.trendDays, null);
    assert.equal(d.projection.minDays, null);
    assert.equal(d.projection.maxDays, null);
    assert.match(d.projection.note, /no ongoing decline/);
  }
});

test('CTR already under half its baseline: zero days, flagged as already below', () => {
  const { d } = run(build({ ctr: step(0.02, 0.6), cpc: () => 0.5 }));
  assert.equal(d.projection.engineDays, 0);
  assert.equal(d.projection.alreadyBelow, true);
  assert.equal(d.projection.declineStopped, false);
  assert.equal(d.projection.minDays, 0);
  assert.equal(d.projection.maxDays, 0);
  assert.equal(d.projection.note, null);
});

test('a CTR that is still falling day by day gives a trend estimate as well', () => {
  // Flat for 7 days, then -5% a day compounding.
  const { d } = run(build({ ctr: (i) => (i < 7 ? 0.02 : 0.02 * 0.95 ** (i - 6)), cpc: () => 0.5 }));
  assert.ok(d.signals.ctr.trendRatePerDay < 0);
  near(d.signals.ctr.trendRatePerDay, -0.05, 0.005, 'recent daily trend');
  assert.ok(Number.isInteger(d.projection.trendDays));
  assert.equal(d.projection.minDays, Math.min(d.projection.engineDays, d.projection.trendDays));
  assert.equal(d.projection.maxDays, Math.max(d.projection.engineDays, d.projection.trendDays));
  assert.ok(d.projection.minDays < d.projection.maxDays, 'a late-onset decline gives a real range');
  assert.equal(d.projection.declineStopped, false);
});

// ---- The diagnosis never contradicts the verdict ------------------------------

test('frequency over the cap is never diagnosed as "not a creative problem"', () => {
  const hot = (i) => 5.5 + 0.1 * i;
  const cases = {
    'CVR drop': build({ cvr: step(0.05, 0.3), frequency: hot }),
    'CPM rise': build({ cpm: (i) => (i < 7 ? 10 : 14), frequency: hot }),
    'order value drop': build({ aov: step(50, 0.3), frequency: hot }),
  };
  for (const [name, rows] of Object.entries(cases)) {
    const { prediction, d } = run(rows, 'meta');
    assert.equal(prediction.status, 'fatigued', name);
    assert.equal(d.pattern.code, 'saturation_compound', name);
    assert.notEqual(d.pattern.isCreativeProblem, false, name);
    assert.equal(d.lead, 'frequency', name);
    assert.doesNotMatch(d.pattern.action, /Keep the creative|Do not replace/, name);
    assert.match(d.pattern.cause, /Separately/, name);
  }
});

test('CTR and CVR both down, only one past threshold -> full funnel, not "convert as before"', () => {
  for (const [ctrDrop, cvrDrop] of [[0.1, 0.3], [0.3, 0.15]]) {
    const { d } = run(build({ ctr: step(0.02, ctrDrop), cvr: step(0.05, cvrDrop) }), 'tiktok');
    assert.equal(d.pattern.code, 'full_funnel_fatigue', `CTR -${ctrDrop}, CVR -${cvrDrop}`);
    assert.doesNotMatch(d.pattern.cause, /as before/);
  }
});

test('the action never says "no need to pause" on a fatigued verdict or while ROAS is slipping', () => {
  // CPM-bought, CTR -30%: ROAS follows CTR down, so two metrics are past -> fatigued.
  const { prediction, d } = run(build({ ctr: step(0.02, 0.3) }), 'tiktok');
  assert.equal(prediction.status, 'fatigued');
  assert.equal(prediction.recommendation, 'pause');
  assert.equal(d.pattern.code, 'click_erosion');
  assert.match(d.pattern.action, /^Pause/);
  assert.doesNotMatch(d.pattern.action, /no need to pause/);
  // Paid per click, ROAS holds: the reassurance is allowed.
  const cpc = run(build({ ctr: step(0.02, 0.3), cpc: () => 0.5 }), 'google').d;
  assert.match(cpc.pattern.action, /no need to pause early/);
});

test('a CTR change that rounds to flat on a healthy creative is healthy, not a drift', () => {
  const { prediction, d } = run(build({ ctr: step(0.02, 0.004), cpc: () => 0.5 }));
  assert.equal(prediction.status, 'healthy');
  assert.equal(d.pattern.code, 'healthy');
});

test('projection has no days and says why when CTR is not declining', () => {
  const rising = build({ ctr: (i) => 0.02 + i * 0.0005, cpc: () => 0.5 });
  for (const rows of [build(), rising, build({ cvr: step(0.05, 0.3) }), build({ frequency: () => 6 })]) {
    const { prediction, d } = run(rows, 'meta');
    assert.equal(prediction.daysRemaining, null);
    assert.equal(d.projection.engineDays, null);
    assert.equal(d.projection.trendDays, null);
    assert.equal(d.projection.minDays, null);
    assert.equal(d.projection.maxDays, null);
    assert.equal(typeof d.projection.note, 'string');
    assert.ok(d.projection.note.length > 0);
  }
});

// ---- Purity and input shapes -------------------------------------------------

test('diagnose does not mutate its inputs, and predict() is unchanged by it', () => {
  const p = new FatiguePredictor();
  const rows = build({ ctr: step(0.02, 0.3), frequency: (i) => 1 + 0.25 * i });
  // Newest first, as the API returns daily_metrics: a sort in place would be visible.
  const input = [...rows].reverse();
  const inputBefore = structuredClone(input);

  const before = p.predict(input, { platform: 'meta', now: NOW });
  const predictionBefore = structuredClone(before);
  const first = p.diagnose(before, input);
  const second = p.diagnose(before, input);

  assert.deepEqual(input, inputBefore, 'daily rows were mutated');
  assert.deepEqual(before, predictionBefore, 'prediction was mutated');
  assert.deepEqual(second, first, 'diagnose is not repeatable');
  assert.deepEqual(p.predict(input, { platform: 'meta', now: NOW }), predictionBefore);
  // predict() keeps the shape that is stored in the predictions table.
  assert.deepEqual(Object.keys(before).sort(), [
    'confidence', 'daysRemaining', 'fatigueDate', 'metricsChange', 'platform',
    'recommendation', 'spanDays', 'status', 'window',
  ]);
});

test('DB-shaped rows (strings, metric_date, no revenue or cpm) diagnose the same', () => {
  const numeric = build({ ctr: step(0.02, 0.3, 10), cvr: step(0.05, 0.4, 10), frequency: (i) => 1 + 0.25 * i });
  // What pg returns from daily_metrics: DECIMAL and BIGINT as strings, newest first.
  const dbRows = numeric.map((r) => ({
    metric_date: r.date,
    impressions: String(r.impressions),
    clicks: String(r.clicks),
    conversions: String(r.conversions),
    spend: r.spend.toFixed(2),
    ctr: String(r.ctr),
    cvr: String(r.cvr),
    roas: String(r.roas),
    frequency: String(r.frequency),
  })).reverse();

  const a = run(numeric, 'meta');
  const b = run(dbRows, 'meta');

  assert.equal(b.prediction.status, a.prediction.status);
  assert.equal(b.d.pattern.code, a.d.pattern.code);
  assert.equal(b.d.pattern.code, 'full_funnel_fatigue');
  assert.equal(b.d.lead, a.d.lead);
  assert.deepEqual(b.d.failing, a.d.failing);
  assert.deepEqual(b.d.definition, a.d.definition);
  assert.deepEqual(b.d.frequency, { ...a.d.frequency });

  for (const key of ['ctr', 'cvr', 'roas']) {
    assert.equal(b.d.signals[key].state, a.d.signals[key].state);
    assert.equal(b.d.signals[key].crossedIndex, 10);
    assert.equal(b.d.signals[key].crossedDate, numeric[10].date, 'crossedDate should come from metric_date');
    near(b.d.signals[key].change, a.d.signals[key].change, 1e-9, `${key} change`);
    near(b.d.signals[key].evidence.z, a.d.signals[key].evidence.z, 1e-6, `${key} z`);
  }
  // Cost side is rebuilt from counts; revenue is reconstructed as roas x spend.
  for (const key of ['cpm', 'cpc', 'cpa', 'aov', 'spendPerDay']) {
    for (const field of ['baseline', 'current', 'change']) {
      assert.ok(Number.isFinite(b.d.cost[key][field]), `cost.${key}.${field} is not finite`);
      near(b.d.cost[key][field], a.d.cost[key][field], 1e-6, `cost.${key}.${field}`);
    }
  }
  near(b.d.cost.aov.baseline, 50, 1e-6, 'reconstructed order value');
});

test('rows with rates only (no counts at all) still diagnose', () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({
    ctr: i < 7 ? 0.05 : 0.03, cvr: 0.03, roas: 4, frequency: 2, spend: 100,
  }));
  const { prediction, d } = run(rows);
  assert.equal(prediction.status, 'warning');
  assert.equal(d.pattern.code, 'click_erosion');
  assert.equal(d.lead, 'ctr');
  assert.equal(d.signals.ctr.crossedIndex, 7);
  assert.equal(d.signals.ctr.crossedDate, null, 'no dates in, no dates out');
  // No impressions or clicks: per-unit costs are unknown, not zero or NaN.
  for (const key of ['cpm', 'cpc', 'cpa', 'aov']) {
    assert.deepEqual(d.cost[key], { baseline: null, current: null, change: null });
  }
  assert.equal(d.cost.spendPerDay.current, 100);
  // Without counts there is no two-proportion test; the level is still one of the four.
  assert.ok(['strong', 'moderate', 'weak', 'unknown'].includes(d.signals.ctr.evidence.level));
});
