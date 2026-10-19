const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
// Shared secret the API requires in `x-api-key`. NEXT_PUBLIC_ values are compiled into the
// browser bundle, so this only keeps strangers out of a private deployment; it is not
// per-user auth. Leave it unset for the sample-data demo.
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// True when the build points at a real backend. When false every response is sample data.
export const API_CONFIGURED = Boolean(API_URL);

const HOUR_MS = 60 * 60 * 1000;

// Timestamps relative to "now" so the demo never looks stale.
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS).toISOString();
// Local noon N days from today, so date-only displays land on the intended calendar day.
const dayFromToday = (offsetDays) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

const buildDemoData = () => ({
  '/api/analytics/dashboard': {
    data: {
      statusStats: [
        { status: 'healthy', count: 8 },
        { status: 'warning', count: 3 },
        { status: 'fatigued', count: 1 },
      ],
      platformStats: [
        { platform: 'google', count: 5 },
        { platform: 'meta', count: 4 },
        { platform: 'tiktok', count: 3 },
      ],
      todayAlerts: 2,
      weeklyTrend: [
        { date: dayFromToday(-6), impressions: 120000, clicks: 4800 },
        { date: dayFromToday(-5), impressions: 145000, clicks: 5800 },
        { date: dayFromToday(-4), impressions: 98000, clicks: 3920 },
        { date: dayFromToday(-3), impressions: 167000, clicks: 6680 },
        { date: dayFromToday(-2), impressions: 189000, clicks: 7560 },
        { date: dayFromToday(-1), impressions: 156000, clicks: 6240 },
        { date: dayFromToday(0), impressions: 134000, clicks: 5360 },
      ],
      upcomingFatigue: [
        { id: 1, name: 'Summer Sale Banner A', platform: 'meta', campaign_name: 'Summer Sale', status: 'warning', days_remaining: 3, fatigue_date: dayFromToday(3) },
        { id: 3, name: 'Retargeting Loop V2', platform: 'google', campaign_name: 'Retargeting', status: 'warning', days_remaining: 5, fatigue_date: dayFromToday(5) },
        { id: 5, name: 'New User Acquisition', platform: 'tiktok', campaign_name: 'UA Q2', status: 'fatigued', days_remaining: 1, fatigue_date: dayFromToday(1) },
      ],
      lastSync: '2 hours ago',
    },
  },
  '/api/creatives': {
    data: [
      { id: 1, name: 'Summer Sale Banner A', platform: 'meta', headline: 'Up to 50% off!', creative_id: 'cre_001', prediction_status: 'warning', days_remaining: 3, recommendation: 'rotate', updated_at: hoursAgo(1), thumbnail_url: 'https://picsum.photos/seed/cre1/100/100' },
      { id: 2, name: 'New Arrivals Carousel', platform: 'meta', headline: 'Just dropped', creative_id: 'cre_002', prediction_status: 'healthy', days_remaining: 12, recommendation: 'keep', updated_at: hoursAgo(2), thumbnail_url: 'https://picsum.photos/seed/cre2/100/100' },
      { id: 3, name: 'Retargeting Loop V2', platform: 'google', headline: 'We miss you', creative_id: 'cre_003', prediction_status: 'warning', days_remaining: 5, recommendation: 'rotate', updated_at: hoursAgo(3), thumbnail_url: 'https://picsum.photos/seed/cre3/100/100' },
      { id: 4, name: 'Brand Awareness Video', platform: 'tiktok', headline: 'Check this out', creative_id: 'cre_004', prediction_status: 'healthy', days_remaining: 18, recommendation: 'keep', updated_at: hoursAgo(4), thumbnail_url: 'https://picsum.photos/seed/cre4/100/100' },
      { id: 5, name: 'New User Acquisition', platform: 'tiktok', headline: 'Join now', creative_id: 'cre_005', prediction_status: 'fatigued', days_remaining: 1, recommendation: 'pause', updated_at: hoursAgo(5), thumbnail_url: 'https://picsum.photos/seed/cre5/100/100' },
      { id: 6, name: 'Spring Collection', platform: 'google', headline: 'Spring is here', creative_id: 'cre_006', prediction_status: 'healthy', days_remaining: 21, recommendation: 'keep', updated_at: hoursAgo(6), thumbnail_url: 'https://picsum.photos/seed/cre6/100/100' },
      { id: 7, name: 'Flash Sale Countdown', platform: 'meta', headline: 'Ends tonight!', creative_id: 'cre_007', prediction_status: 'warning', days_remaining: 2, recommendation: 'rotate', updated_at: hoursAgo(7), thumbnail_url: 'https://picsum.photos/seed/cre7/100/100' },
      { id: 8, name: 'Product Showcase', platform: 'google', headline: 'Best seller', creative_id: 'cre_008', prediction_status: 'fatigued', days_remaining: 0, recommendation: 'pause', updated_at: hoursAgo(8), thumbnail_url: 'https://picsum.photos/seed/cre8/100/100' },
    ],
  },
  '/api/creatives/alerts/list': {
    data: [
      {
        id: 'alert_1_1746547200',
        creativeId: 5,
        platform: 'tiktok',
        creative_name: 'New User Acquisition',
        alert_type: 'fatigue_detected',
        severity: 'critical',
        message: 'Fatigue detected. CTR dropped 40% vs baseline. Replace immediately.',
        created_at: hoursAgo(3),
      },
      {
        id: 'alert_2_1746543600',
        creativeId: 1,
        platform: 'meta',
        creative_name: 'Summer Sale Banner A',
        alert_type: 'fatigue_warning',
        severity: 'warning',
        message: 'Warning: CTR dropping. Consider rotating creative within 3 days.',
        created_at: hoursAgo(5),
      },
      {
        id: 'alert_3_1746540000',
        creativeId: 7,
        platform: 'meta',
        creative_name: 'Flash Sale Countdown',
        alert_type: 'fatigue_warning',
        severity: 'warning',
        message: 'Fatigue approaching. 2 days remaining. Prepare replacement.',
        created_at: hoursAgo(7),
      },
    ],
  },
  '/api/accounts': {
    data: [
      { id: 1, platform: 'meta', account_name: 'My Meta Ads Account', account_id: 'act_123456789', is_active: true, last_sync_at: hoursAgo(2) },
      { id: 2, platform: 'google', account_name: 'Google Ads Main', account_id: '123-456-7890', is_active: true, last_sync_at: hoursAgo(2) },
      { id: 3, platform: 'tiktok', account_name: 'TikTok Ads', account_id: 'TT_987654321', is_active: true, last_sync_at: hoursAgo(2) },
    ],
  },
});

const demoResponse = (endpoint) => {
  const demo = buildDemoData()[endpoint];
  return demo ? { ...demo, isDemo: true } : null;
};

export async function fetchAPI(endpoint, options = {}) {
  const method = options.method || 'GET';

  // Always handle demo pause/rotate — return mock response without hitting real API
  if (method === 'POST') {
    const creativeIdMatch = endpoint.match(/^\/api\/creatives\/(\d+)\/(pause|rotate)$/);
    if (creativeIdMatch) {
      const id = parseInt(creativeIdMatch[1]);
      const action = creativeIdMatch[2];
      const creative = buildDemoData()['/api/creatives'].data.find(c => c.id === id);
      if (creative) {
        return {
          success: true,
          isDemo: true,
          message: `[DEMO] "${creative.name}" has been ${action === 'pause' ? 'PAUSED' : 'MARKED FOR ROTATION'} on ${creative.platform}. Changes will take effect within a few minutes.`,
        };
      }
    }
  }

  // If no real API configured, use demo data directly
  if (!API_URL) {
    const demo = demoResponse(endpoint);
    if (demo) return demo;
    throw new Error(`API Error: ${endpoint} not found`);
  }

  // Try real API
  try {
    const url = `${API_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        ...options.headers,
      },
    });

    if (response.ok) {
      const data = await response.json();
      // If real API returns empty data, fall back to demo
      const isEmpty =
        (Array.isArray(data.data) && data.data.length === 0) ||
        (data.data === null || data.data === undefined);
      if (!isEmpty) {
        return data;
      }
    }
  } catch (error) {
    // Real API unavailable — fall through to demo data
  }

  // Use demo data
  const demo = demoResponse(endpoint);
  if (demo) {
    return demo;
  }

  throw new Error(`API Error: ${endpoint} not found`);
}
