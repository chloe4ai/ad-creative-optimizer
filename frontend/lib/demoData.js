// Sample data for the hosted demo.
//
// Nothing below is a hand-typed status. Each creative gets a generated daily history
// (seeded, so every render and every visitor sees the same numbers; only the calendar
// dates move with today), and the real engine in src/services/prediction.js scores it.
// Every count, alert, and "days left" on the dashboard is derived from those predictions.
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
// by `rate` per day (rate < 1 decays, rate > 1 grows), optionally stopping at `floor`/`cap`.
const shape = ({ start = 0, rate = 1, floor = 0, cap = Infinity } = {}) => (t) => (
  t < start ? 1 : Math.min(cap, Math.max(floor, Math.pow(rate, t - start))));

// The advertiser in every sample ad: a fictional outdoor-gear shop.
const BRAND = { name: 'Fernhill', url: 'fernhill.example' };

// Each spec is a story about one creative. The numbers are chosen so the engine's
// verdicts illustrate the README's rules; the comments say what the engine is expected
// to conclude, the engine decides.
//
// The money adds up: revenue = conversions x order value, and spend follows the buying
// model (`buying: 'cpm'` pays per impression, `'cpc'` pays per click). So ROAS is never
// set directly; it is whatever CTR, CVR, order value and media price make it.
const CREATIVE_SPECS = [
  {
    // Meta sale banner on a lookalike audience: clicks sliding as frequency climbs. CTR is
    // past threshold; ROAS follows it down but has not crossed yet. One metric = warning.
    id: 1, name: 'Gear Sale Banner A', platform: 'meta', headline: 'Up to 50% off trail gear',
    campaign_name: 'Gear Sale', objective: 'Sales', days: 14, impressions: 52000,
    buying: 'cpm', cpm: 9.5, ctr: 0.0142, cvr: 0.034, aov: 61,
    creative: {
      format: 'image', art: 'gearSale', placement: 'Feed', cta: 'Shop now',
      primary_text: 'Trail gear, up to half off. While stocks last.',
      audience: 'Lookalike 1% of past purchasers, ~420k people',
    },
    shapes: { ctr: { start: 4, rate: 0.958 } },
    frequency: { start: 1.3, perDay: 0.16 },
  },
  {
    // Clicks and conversions holding, but the same small audience has seen it 6+ times:
    // fatigued on frequency alone, before CTR shows it.
    id: 2, name: 'New Arrivals Carousel', platform: 'meta', headline: 'Just dropped',
    campaign_name: 'New Arrivals', objective: 'Sales', days: 24, impressions: 38000,
    buying: 'cpm', cpm: 11, ctr: 0.0118, cvr: 0.041, aov: 82,
    creative: {
      format: 'carousel', art: 'newArrivals', placement: 'Feed', cta: 'Shop now',
      primary_text: 'Fresh for the trail: three new pieces, in stock now.',
      audience: 'Site visitors in the last 30 days, ~150k people',
    },
    shapes: { ctr: { start: 0, rate: 1.0015 } },
    frequency: { start: 1.9, perDay: 0.2 },
  },
  {
    // Google display retargeting, paid per click: CTR down ~25%, but spend falls with the
    // clicks and the people who still click convert as well as ever, so ROAS holds.
    // One metric past threshold is a warning, not fatigue.
    id: 3, name: 'Retargeting Loop V2', platform: 'google', headline: 'Still thinking it over?',
    campaign_name: 'Retargeting', objective: 'Sales', days: 21, impressions: 61000,
    buying: 'cpc', cpc: 0.62, ctr: 0.0094, cvr: 0.052, aov: 52,
    creative: {
      format: 'display', art: 'retargeting', placement: 'Display network', cta: 'Return to cart',
      primary_text: 'Your cart is still here. Free shipping today.',
      audience: 'Cart abandoners in the last 14 days',
    },
    shapes: { ctr: { start: 11, rate: 0.95 } },
  },
  {
    // TikTok prospecting video, still finding new viewers: CTR drifting up.
    id: 4, name: 'Brand Story Video', platform: 'tiktok', headline: 'Go further',
    campaign_name: 'Brand Video', objective: 'Sales', days: 28, impressions: 96000,
    buying: 'cpm', cpm: 5.2, ctr: 0.0087, cvr: 0.018, aov: 63,
    creative: {
      format: 'video', art: 'brandVideo', placement: 'In-feed video', cta: 'Learn more', video_seconds: 21,
      primary_text: 'Gear that goes further than you planned to.',
      audience: 'Broad: outdoor interests, 18-44',
    },
    shapes: { ctr: { start: 0, rate: 1.002 } },
  },
  {
    // TikTok acquisition video that has burned through its audience: fewer click, and the
    // ones who click convert less. CTR, CVR and ROAS all past threshold.
    id: 5, name: 'New User Acquisition', platform: 'tiktok', headline: 'Join now',
    campaign_name: 'New Customers', objective: 'Sales', days: 21, impressions: 84000,
    buying: 'cpm', cpm: 6.8, ctr: 0.0121, cvr: 0.029, aov: 50,
    creative: {
      format: 'video', art: 'userAcquisition', placement: 'In-feed video', cta: 'Join now', video_seconds: 12,
      primary_text: 'New here? $10 off your first order in the app.',
      audience: 'Interest: hiking and camping, excluding customers',
    },
    shapes: { ctr: { start: 6, rate: 0.955 }, cvr: { start: 8, rate: 0.965 } },
  },
  {
    // Google search text ad: steady, slightly improving as bidding learns.
    id: 6, name: 'Trail Gear Search Ad', platform: 'google', headline: 'New-season trail gear | Fernhill',
    campaign_name: 'Search: Trail Gear', objective: 'Sales', days: 21, impressions: 6800,
    buying: 'cpc', cpc: 0.72, ctr: 0.052, cvr: 0.038, aov: 72,
    creative: {
      format: 'text', placement: 'Search results', cta: null,
      primary_text: 'New-season jackets, packs and trail shoes. Free returns for 60 days.',
      audience: 'Keywords: hiking gear, rain jacket, trail shoes',
    },
    shapes: { ctr: { start: 4, rate: 1.003 } },
  },
  {
    // Meta countdown creative on a warm list, 10 days into a 14-day sale. Frequency climbs
    // fast, clicks fall fast; the people who still click came to buy, so CVR rises and
    // cushions ROAS. Only CTR is past threshold: a warning, with the steepest curve here.
    id: 7, name: 'Flash Sale Countdown', platform: 'meta', headline: '40% off everything, ends soon',
    campaign_name: 'Flash Sale', objective: 'Sales', days: 10, flightDaysLeft: 4, impressions: 71000,
    buying: 'cpm', cpm: 10.5, ctr: 0.0168, cvr: 0.031, aov: 58,
    creative: {
      format: 'image', art: 'flashSale', placement: 'Feed', cta: 'Shop now',
      primary_text: '40% off everything. The clock is running.',
      audience: 'Email subscribers and past purchasers, ~200k people',
    },
    shapes: { ctr: { start: 2, rate: 0.915 }, cvr: { start: 2, rate: 1.04 } },
    frequency: { start: 1.4, perDay: 0.24 },
  },
  {
    // Google Shopping best-seller, paid per click: a slow, shallow decline. Healthy, but
    // the curve already has a date.
    id: 8, name: 'Product Showcase', platform: 'google', headline: 'Ridgeline 28L daypack',
    campaign_name: 'Always On', objective: 'Sales', days: 14, impressions: 55000,
    buying: 'cpc', cpc: 0.68, ctr: 0.0081, cvr: 0.0235, aov: 120,
    creative: {
      format: 'shopping', art: 'productShowcase', placement: 'Shopping results', cta: null,
      price: '$120.00', rating: '4.8', reviews: '2,100',
      audience: 'Shopping queries: daypack, hiking backpack',
    },
    shapes: { ctr: { start: 2, rate: 0.991 }, cvr: { start: 0, rate: 0.998 } },
  },
  {
    // NOT creative fatigue: the ad still earns the click, but popular sizes sold out a week
    // ago, so fewer clicks convert. The engine flags the decline; the diagnosis says to
    // leave the creative alone and look at the page.
    id: 9, name: 'Trail Shoe Launch', platform: 'meta', headline: 'The Switchback trail shoe',
    campaign_name: 'Footwear Launch', objective: 'Sales', days: 21, impressions: 44000,
    buying: 'cpm', cpm: 10, ctr: 0.0131, cvr: 0.036, aov: 89,
    creative: {
      format: 'image', art: 'trailShoe', placement: 'Feed', cta: 'Shop now',
      primary_text: 'Grip for the wet days. The Switchback is here.',
      audience: 'Interest: trail running, ~900k people',
    },
    shapes: { cvr: { start: 13, rate: 0.93, floor: 0.74 } },
    frequency: { start: 1.1, perDay: 0.04 },
  },
  {
    // NOT creative fatigue: people respond exactly as before, but the auction got more
    // expensive (CPM up ~30%), which drags ROAS. Replacing the creative would fix nothing.
    id: 10, name: 'Gift Guide Video', platform: 'tiktok', headline: 'Gifts for people who go outside',
    campaign_name: 'Gifting', objective: 'Sales', days: 21, impressions: 67000,
    buying: 'cpm', cpm: 6.2, ctr: 0.0104, cvr: 0.027, aov: 68,
    creative: {
      format: 'video', art: 'giftGuide', placement: 'In-feed video', cta: 'Shop gifts', video_seconds: 18,
      primary_text: 'Six gifts for the person who is always outside.',
      audience: 'Broad: gift shoppers, 25-54',
    },
    shapes: { cpm: { start: 12, rate: 1.05, cap: 1.32 } },
  },
];

const round = (value, digits) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

// Daily rows in the shape the sync service stores (src/models/schema.sql daily_metrics):
// counts are integers and every rate is derived from them, so the table adds up.
// Frequency here is cumulative (average impressions per person reached since launch),
// and only Meta reports it; other platforms send 0, as the adapters do.
const generateHistory = (spec) => {
  const rand = seededRandom(spec.id * 7919 + 17);
  const jitter = (amplitude) => 1 + (rand() * 2 - 1) * amplitude;
  const shapes = spec.shapes || {};
  const ctrShape = shape(shapes.ctr);
  const cvrShape = shape(shapes.cvr);
  const aovShape = shape(shapes.aov);
  const cpmShape = shape(shapes.cpm);

  const rows = [];
  for (let t = 0; t < spec.days; t++) {
    const offset = t - (spec.days - 1); // last row is today
    const date = dayFromToday(offset);
    const impressions = Math.round(spec.impressions * jitter(0.09));
    const clicks = Math.round(impressions * spec.ctr * ctrShape(t) * jitter(0.035));
    const conversions = Math.round(clicks * spec.cvr * cvrShape(t) * jitter(0.05));
    const spend = round(spec.buying === 'cpc'
      ? clicks * spec.cpc * jitter(0.03)
      : (impressions / 1000) * spec.cpm * cpmShape(t) * jitter(0.02), 2);
    const revenue = round(conversions * spec.aov * aovShape(t) * jitter(0.04), 2);
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
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      frequency,
    });
  }
  return rows;
};

// "about 2 hours ago" without a date library, so this module (and its tests) only depend
// on the engine.
const agoLabel = (ms) => {
  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
};

export const pluralDays = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

// The CTR half-life projection: when CTR reaches 50% of the creative's own baseline.
// (The engine field is still called fatigueDate; it is separate from the verdict.)
export const fatigueOutlook = (daysRemaining) => (daysRemaining === 0
  ? 'CTR projected to reach half its baseline within a day'
  : `CTR projected to fall to half its baseline in ${pluralDays(daysRemaining)}`);

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

// Alert copy comes from the engine's diagnosis: the named pattern, its cause in this
// creative's numbers, and the action that fits that cause.
const alertMessage = (diagnosis) => `${diagnosis.pattern.cause} ${diagnosis.pattern.action}`;

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
    const diagnosis = predictor.diagnose(prediction, dailyMetrics);
    return { spec, dailyMetrics, prediction, diagnosis };
  });

  const listRow = ({ spec, prediction, diagnosis, dailyMetrics }) => ({
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
    // What the ad looks like (see components/CreativePreview.js). Demo creatives are drawn
    // in the app, so there is no thumbnail_url to fetch.
    brand: BRAND.name,
    display_url: BRAND.url,
    creative_type: ['display', 'shopping'].includes(spec.creative.format) ? 'image' : spec.creative.format,
    ...spec.creative,
    objective: spec.objective,
    buying_model: spec.buying,
    launched_at: dayFromToday(-(spec.days - 1)).toISOString(),
    days_live: spec.days,
    flight_end: spec.flightDaysLeft ? dayFromToday(spec.flightDaysLeft).toISOString() : null,
    // Diagnosis summary for list rows: which pattern, which signal led, how far each moved.
    pattern_code: diagnosis.pattern.code,
    pattern_label: diagnosis.pattern.label,
    pattern_action: diagnosis.pattern.action,
    is_creative_problem: diagnosis.pattern.isCreativeProblem,
    lead_signal: diagnosis.lead,
    failing_metrics: diagnosis.failing,
    ctr_change: diagnosis.signals.ctr.change,
    cvr_change: diagnosis.signals.cvr.change,
    roas_change: diagnosis.signals.roas.change,
    cpm_change: diagnosis.cost.cpm.change,
    frequency: diagnosis.frequency.reported ? diagnosis.frequency.windowAvg : null,
    frequency_limit: diagnosis.frequency.limit,
    spend_per_day: diagnosis.cost.spendPerDay.current,
    ctr_series: dailyMetrics.map((d) => d.ctr),
    ctr_baseline: diagnosis.signals.ctr.baseline,
  });

  const rows = creatives.map(listRow);

  const countBy = (key, order) => order
    .map((value) => ({ [key]: value, count: rows.filter((r) => r[key] === value).length }))
    .filter((s) => s.count > 0);

  // Same rule as the API's dashboard query: 0 <= days_remaining <= 7, soonest first.
  const upcomingFatigue = rows
    .filter((r) => Number.isFinite(r.days_remaining) && r.days_remaining >= 0 && r.days_remaining <= 7)
    .sort((a, b) => a.days_remaining - b.days_remaining);

  // Everything the engine wants a human to look at: fatigued first, then warnings, each
  // group soonest CTR half-life first (creatives with no CTR decline last).
  const order = { fatigued: 0, warning: 1 };
  const needsAction = rows
    .filter((r) => r.status in order)
    .sort((a, b) => (order[a.status] - order[b.status])
      || ((a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity)));

  // shouldAlert() fires for every warning/fatigued creative on its first prediction.
  const alerts = creatives
    .filter(({ prediction }) => predictor.shouldAlert(prediction, null))
    .sort((a, b) => (a.prediction.status === b.prediction.status ? 0 : a.prediction.status === 'fatigued' ? -1 : 1))
    .map(({ spec, prediction, diagnosis }, i) => ({
      id: `alert_${spec.id}_${syncedAt.getTime()}`,
      creativeId: spec.id,
      platform: spec.platform,
      creative_name: spec.name,
      alert_type: prediction.status === 'fatigued' ? 'fatigue_detected' : 'fatigue_warning',
      severity: prediction.status === 'fatigued' ? 'critical' : 'warning',
      pattern_label: diagnosis.pattern.label,
      is_creative_problem: diagnosis.pattern.isCreativeProblem,
      message: alertMessage(diagnosis),
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
      needsAction,
      dailySpend: round(rows.reduce((a, r) => a + r.spend_per_day, 0), 0),
      dailySpendAtRisk: round(needsAction.reduce((a, r) => a + r.spend_per_day, 0), 0),
      lastSync: agoLabel(now.getTime() - syncedAt.getTime()),
    },
  };
};
