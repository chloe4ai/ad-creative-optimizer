// Sample data for the hosted demo.
//
// Nothing below is a hand-typed status. Each creative gets a generated daily history
// (seeded, so every render and every visitor sees the same numbers; only the calendar
// dates move with today), and the real engine in src/services/prediction.js scores it.
// Every count, alert, and "days left" on the dashboard is derived from those predictions.
import { formatDistanceToNow } from 'date-fns';
import { FatiguePredictor } from '../../src/services/prediction.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Local noon N days from today, so date-only displays land on the intended calendar day.
export const dayFromToday = (offsetDays) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

// mulberry32: tiny deterministic PRNG, so the noise is identical on every render.
const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Multiplier on a metric's launch level at day t: flat until `start`, then compounding
// by `rate` per day (rate < 1 decays, rate > 1 grows).
const shape = ({ start = 0, rate = 1 } = {}) => (t) => (t < start ? 1 : Math.pow(rate, t - start));

// Each spec is a story about one creative. The numbers are chosen so the engine's
// verdicts illustrate the README's rules; the comments say what the engine is expected
// to conclude, the engine decides.
const CREATIVE_SPECS = [
  {
    // Meta banner losing clicks fast; conversions and ROAS sliding but not yet past threshold.
    id: 1, name: 'Summer Sale Banner A', platform: 'meta', headline: 'Up to 50% off!',
    campaign_name: 'Summer Sale', days: 14, impressions: 52000, cpm: 9.5,
    ctr: 0.0142, cvr: 0.034, roas: 3.1,
    shapes: { ctr: { start: 3, rate: 0.895 }, cvr: { start: 5, rate: 0.98 }, roas: { start: 5, rate: 0.97 } },
    frequency: { start: 1.3, perDay: 0.16 },
  },
  {
    // Clicks and conversions holding, but the same small audience has seen it 6+ times:
    // fatigued on frequency alone, before CTR shows it.
    id: 2, name: 'New Arrivals Carousel', platform: 'meta', headline: 'Just dropped',
    campaign_name: 'New Arrivals', days: 24, impressions: 38000, cpm: 11,
    ctr: 0.0118, cvr: 0.041, roas: 3.6,
    shapes: { ctr: { start: 0, rate: 1.0015 }, cvr: { start: 0, rate: 1 }, roas: { start: 0, rate: 1.001 } },
    frequency: { start: 1.9, perDay: 0.2 },
  },
  {
    // Google retargeting: CTR down ~25%, but it is bought per click and the people who still
    // click convert as well as ever. One metric past threshold is a warning, not fatigue.
    id: 3, name: 'Retargeting Loop V2', platform: 'google', headline: 'We miss you',
    campaign_name: 'Retargeting', days: 21, impressions: 61000, cpm: 6,
    ctr: 0.0094, cvr: 0.052, roas: 4.4,
    shapes: { ctr: { start: 11, rate: 0.95 }, cvr: { start: 0, rate: 1.001 }, roas: { start: 0, rate: 1.0005 } },
  },
  {
    // TikTok awareness video, still finding new viewers: CTR drifting up.
    id: 4, name: 'Brand Awareness Video', platform: 'tiktok', headline: 'Check this out',
    campaign_name: 'Brand Q3', days: 28, impressions: 96000, cpm: 5.2,
    ctr: 0.0087, cvr: 0.018, roas: 1.9,
    shapes: { ctr: { start: 0, rate: 1.002 }, cvr: { start: 0, rate: 1 }, roas: { start: 0, rate: 1.001 } },
  },
  {
    // TikTok UA creative that has burned through its audience: CTR, CVR and ROAS all down.
    id: 5, name: 'New User Acquisition', platform: 'tiktok', headline: 'Join now',
    campaign_name: 'UA Q2', days: 21, impressions: 84000, cpm: 6.8,
    ctr: 0.0121, cvr: 0.029, roas: 2.6,
    shapes: { ctr: { start: 6, rate: 0.955 }, cvr: { start: 8, rate: 0.965 }, roas: { start: 6, rate: 0.95 } },
  },
  {
    // Google evergreen: steady, slightly improving as bidding learns.
    id: 6, name: 'Spring Collection', platform: 'google', headline: 'Spring is here',
    campaign_name: 'Spring Collection', days: 21, impressions: 47000, cpm: 5.5,
    ctr: 0.0076, cvr: 0.038, roas: 3.8,
    shapes: { ctr: { start: 4, rate: 1.003 }, cvr: { start: 0, rate: 1.001 }, roas: { start: 0, rate: 1.002 } },
  },
  {
    // Meta flash-sale creative with a short life: clicks collapsing, urgency keeps CVR up.
    id: 7, name: 'Flash Sale Countdown', platform: 'meta', headline: 'Ends tonight!',
    campaign_name: 'Flash Sale', days: 10, impressions: 71000, cpm: 10.5,
    ctr: 0.0168, cvr: 0.031, roas: 2.9,
    shapes: { ctr: { start: 2, rate: 0.83 }, cvr: { start: 2, rate: 1.02 }, roas: { start: 3, rate: 0.975 } },
    frequency: { start: 1.4, perDay: 0.24 },
  },
  {
    // Google best-seller: a slow, shallow decline. Healthy, but the curve already has a date.
    id: 8, name: 'Product Showcase', platform: 'google', headline: 'Best seller',
    campaign_name: 'Always On', days: 14, impressions: 55000, cpm: 5.8,
    ctr: 0.0081, cvr: 0.044, roas: 4.1,
    shapes: { ctr: { start: 2, rate: 0.991 }, cvr: { start: 0, rate: 0.998 }, roas: { start: 0, rate: 0.997 } },
  },
];

const round = (value, digits) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

// Daily rows in the shape the sync service stores (src/models/schema.sql daily_metrics):
// counts are integers and ctr/cvr/roas are derived from them, so the table adds up.
// Only Meta reports frequency; other platforms send 0, as the adapters do.
const generateHistory = (spec) => {
  const rand = seededRandom(spec.id * 7919 + 17);
  const jitter = (amplitude) => 1 + (rand() * 2 - 1) * amplitude;
  const ctrShape = shape(spec.shapes.ctr);
  const cvrShape = shape(spec.shapes.cvr);
  const roasShape = shape(spec.shapes.roas);

  const rows = [];
  for (let t = 0; t < spec.days; t++) {
    const offset = t - (spec.days - 1); // last row is today
    const date = dayFromToday(offset);
    const impressions = Math.round(spec.impressions * jitter(0.09));
    const clicks = Math.round(impressions * spec.ctr * ctrShape(t) * jitter(0.035));
    const conversions = Math.round(clicks * spec.cvr * cvrShape(t) * jitter(0.05));
    const spend = round((impressions / 1000) * spec.cpm, 2);
    const revenue = round(spend * spec.roas * roasShape(t) * jitter(0.04), 2);
    const frequency = spec.frequency
      ? round(spec.frequency.start + spec.frequency.perDay * t + (rand() - 0.5) * 0.1, 2)
      : 0;
    rows.push({
      date: date.toISOString(),
      metric_date: date.toISOString().slice(0, 10),
      impressions,
      clicks,
      conversions,
      spend,
      revenue,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cvr: clicks > 0 ? conversions / clicks : 0,
      roas: spend > 0 ? revenue / spend : 0,
      cpc: clicks > 0 ? round(spend / clicks, 2) : 0,
      frequency,
    });
  }
  return rows;
};

export const pluralDays = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

// Signed whole percent; a change that rounds to zero prints as 0%, not −0%.
export const pct = (change) => {
  const whole = Math.round(change * 100);
  if (whole === 0) return '0%';
  return `${whole > 0 ? '+' : '−'}${Math.abs(whole)}%`;
};

// "CTR", "CTR and CVR", "CTR, CVR and ROAS"
export const joinList = (items) => (items.length <= 1
  ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok' };

// Alert copy built from the prediction's own numbers.
const alertMessage = (prediction) => {
  const { metricsChange: m, status, daysRemaining } = prediction;
  const metrics = [
    ['CTR', m.ctr],
    ['CVR', m.cvr],
    ['ROAS', m.roas],
  ];
  const crossed = metrics.filter(([, v]) => v.isFatigued);
  const summary = metrics.map(([label, v]) => `${label} ${pct(v.change)}`).join(', ');

  if (status === 'fatigued') {
    if (crossed.length >= 2) {
      const longest = Math.min(...crossed.map(([, v]) => v.consecutiveDaysBelow));
      return `Fatigue detected: ${joinList(crossed.map(([l]) => l))} past threshold for ${pluralDays(longest)} running (${summary} vs. its own baseline). Pause or replace now.`;
    }
    return `Fatigue detected: frequency ${m.frequency.current.toFixed(1)} is over the ${PLATFORM_LABEL[prediction.platform] || prediction.platform} cap of ${m.frequency.limit}, while ${summary} still look fine. The audience is saturated; rotate before the metrics bend.`;
  }

  const when = Number.isFinite(daysRemaining)
    ? `CTR projected to halve in ${pluralDays(daysRemaining)}`
    : 'no decline to extrapolate yet';
  if (crossed.length === 1) {
    const [label, v] = crossed[0];
    return `${label} ${pct(v.change)} vs. baseline is past its threshold, but ${joinList(metrics.filter(([l]) => l !== label).map(([l, x]) => `${l} ${pct(x.change)}`))} are still within threshold, so this is a warning, not fatigue. ${when}; prepare a replacement.`;
  }
  return `Early decline: ${summary} vs. baseline, none past threshold yet. ${when}; prepare a replacement.`;
};

const predictor = new FatiguePredictor();

// Build the full demo dataset. `now` is injectable for tests and scripts.
export const buildDemoState = (now = new Date()) => {
  // The demo's "last sync": two hours ago, but never before today's midnight, so the
  // alerts it raised are all today's alerts.
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const syncedAt = new Date(Math.max(now.getTime() - 2 * HOUR_MS, midnight.getTime() + MINUTE_MS));
  if (syncedAt > now) syncedAt.setTime(now.getTime());

  const creatives = CREATIVE_SPECS.map((spec) => {
    const dailyMetrics = generateHistory(spec);
    const prediction = predictor.predict(dailyMetrics, { platform: spec.platform, now });
    return { spec, dailyMetrics, prediction };
  });

  const listRow = ({ spec, prediction }) => ({
    id: spec.id,
    name: spec.name,
    platform: spec.platform,
    headline: spec.headline,
    campaign_name: spec.campaign_name,
    creative_id: `cre_00${spec.id}`,
    prediction_status: prediction.status,
    status: prediction.status,
    days_remaining: prediction.daysRemaining,
    fatigue_date: prediction.fatigueDate ? prediction.fatigueDate.toISOString() : null,
    confidence: prediction.confidence,
    recommendation: prediction.recommendation,
    updated_at: syncedAt.toISOString(),
    thumbnail_url: `https://picsum.photos/seed/cre${spec.id}/100/100`,
  });

  const rows = creatives.map(listRow);

  const countBy = (key, order) => order
    .map((value) => ({ [key]: value, count: rows.filter((r) => r[key] === value).length }))
    .filter((s) => s.count > 0);

  // Same rule as the API's dashboard query: 0 < days_remaining <= 7, soonest first.
  const upcomingFatigue = rows
    .filter((r) => Number.isFinite(r.days_remaining) && r.days_remaining > 0 && r.days_remaining <= 7)
    .sort((a, b) => a.days_remaining - b.days_remaining);

  // shouldAlert() fires for every warning/fatigued creative on its first prediction.
  const alerts = creatives
    .filter(({ prediction }) => predictor.shouldAlert(prediction, null))
    .sort((a, b) => (a.prediction.status === b.prediction.status ? 0 : a.prediction.status === 'fatigued' ? -1 : 1))
    .map(({ spec, prediction }, i) => ({
      id: `alert_${spec.id}_${syncedAt.getTime()}`,
      creativeId: spec.id,
      platform: spec.platform,
      creative_name: spec.name,
      alert_type: prediction.status === 'fatigued' ? 'fatigue_detected' : 'fatigue_warning',
      severity: prediction.status === 'fatigued' ? 'critical' : 'warning',
      message: alertMessage(prediction),
      created_at: new Date(syncedAt.getTime() + i * 1000).toISOString(),
    }));

  // Portfolio trend: every creative's last 7 days, summed per calendar day.
  const weeklyTrend = [];
  for (let offset = -6; offset <= 0; offset++) {
    const day = dayFromToday(offset).toISOString().slice(0, 10);
    const sums = { impressions: 0, clicks: 0, conversions: 0, spend: 0 };
    for (const { dailyMetrics } of creatives) {
      const row = dailyMetrics.find((d) => d.metric_date === day);
      if (!row) continue;
      sums.impressions += row.impressions;
      sums.clicks += row.clicks;
      sums.conversions += row.conversions;
      sums.spend += row.spend;
    }
    weeklyTrend.push({
      date: dayFromToday(offset).toISOString(),
      ...sums,
      spend: round(sums.spend, 2),
      ctr: sums.impressions > 0 ? sums.clicks / sums.impressions : 0,
      cvr: sums.clicks > 0 ? sums.conversions / sums.clicks : 0,
    });
  }

  const accounts = [
    { id: 1, platform: 'meta', account_name: 'My Meta Ads Account', account_id: 'act_123456789', is_active: true, last_sync_at: syncedAt.toISOString() },
    { id: 2, platform: 'google', account_name: 'Google Ads Main', account_id: '123-456-7890', is_active: true, last_sync_at: syncedAt.toISOString() },
    { id: 3, platform: 'tiktok', account_name: 'TikTok Ads', account_id: 'TT_987654321', is_active: true, last_sync_at: syncedAt.toISOString() },
  ];

  const details = Object.fromEntries(creatives.map((c) => [c.spec.id, {
    ...listRow(c),
    // The API returns daily_metrics newest first; keep that shape.
    dailyMetrics: [...c.dailyMetrics].reverse(),
    alerts: alerts.filter((a) => a.creativeId === c.spec.id),
  }]));

  return {
    creatives,
    rows,
    alerts,
    accounts,
    details,
    dashboard: {
      statusStats: countBy('status', ['healthy', 'warning', 'fatigued', 'unknown']),
      platformStats: countBy('platform', ['google', 'meta', 'tiktok']),
      todayAlerts: alerts.length,
      weeklyTrend,
      upcomingFatigue,
      lastSync: formatDistanceToNow(syncedAt, { addSuffix: true }),
    },
  };
};
