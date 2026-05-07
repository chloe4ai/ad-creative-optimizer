const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Demo data for when API is unavailable
const DEMO_DATA = {
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
        { date: '2026-05-01', impressions: 120000, clicks: 4800 },
        { date: '2026-05-02', impressions: 145000, clicks: 5800 },
        { date: '2026-05-03', impressions: 98000, clicks: 3920 },
        { date: '2026-05-04', impressions: 167000, clicks: 6680 },
        { date: '2026-05-05', impressions: 189000, clicks: 7560 },
        { date: '2026-05-06', impressions: 156000, clicks: 6240 },
        { date: '2026-05-07', impressions: 134000, clicks: 5360 },
      ],
      upcomingFatigue: [
        { id: 1, name: 'Summer Sale Banner A', platform: 'meta', campaign_name: 'Summer Sale', status: 'warning', days_remaining: 3, fatigue_date: '2026-05-10' },
        { id: 2, name: 'Retargeting Loop V2', platform: 'google', campaign_name: 'Retargeting', status: 'warning', days_remaining: 5, fatigue_date: '2026-05-12' },
        { id: 3, name: 'New User Acquisition', platform: 'tiktok', campaign_name: 'UA Q2', status: 'fatigued', days_remaining: 1, fatigue_date: '2026-05-08' },
      ],
      lastSync: '2 hours ago',
    },
  },
  '/api/creatives': {
    data: [
      { id: 1, name: 'Summer Sale Banner A', platform: 'meta', headline: 'Up to 50% off!', creative_id: 'cre_001', prediction_status: 'warning', days_remaining: 3, recommendation: 'rotate', updated_at: '2026-05-07T10:00:00Z' },
      { id: 2, name: 'New Arrivals Carousel', platform: 'meta', headline: 'Just dropped', creative_id: 'cre_002', prediction_status: 'healthy', days_remaining: 12, recommendation: 'keep', updated_at: '2026-05-07T09:00:00Z' },
      { id: 3, name: 'Retargeting Loop V2', platform: 'google', headline: 'We miss you', creative_id: 'cre_003', prediction_status: 'warning', days_remaining: 5, recommendation: 'rotate', updated_at: '2026-05-07T08:00:00Z' },
      { id: 4, name: 'Brand Awareness Video', platform: 'tiktok', headline: 'Check this out', creative_id: 'cre_004', prediction_status: 'healthy', days_remaining: 18, recommendation: 'keep', updated_at: '2026-05-07T07:00:00Z' },
      { id: 5, name: 'New User Acquisition', platform: 'tiktok', headline: 'Join now', creative_id: 'cre_005', prediction_status: 'fatigued', days_remaining: 1, recommendation: 'pause', updated_at: '2026-05-07T06:00:00Z' },
      { id: 6, name: 'Spring Collection', platform: 'google', headline: 'Spring is here', creative_id: 'cre_006', prediction_status: 'healthy', days_remaining: 21, recommendation: 'keep', updated_at: '2026-05-07T05:00:00Z' },
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
        created_at: '2026-05-07T08:00:00Z',
      },
      {
        id: 'alert_2_1746543600',
        creativeId: 1,
        platform: 'meta',
        creative_name: 'Summer Sale Banner A',
        alert_type: 'fatigue_warning',
        severity: 'warning',
        message: 'Warning: CTR dropping. Consider rotating creative within 3 days.',
        created_at: '2026-05-07T06:00:00Z',
      },
    ],
  },
  '/api/accounts': {
    data: [
      { id: 1, platform: 'meta', account_name: 'My Meta Ads Account', account_id: 'act_123456789', is_active: true, last_sync_at: '2026-05-07T08:00:00Z' },
      { id: 2, platform: 'google', account_name: 'Google Ads Main', account_id: '123-456-7890', is_active: true, last_sync_at: '2026-05-07T07:00:00Z' },
    ],
  },
};

export async function fetchAPI(endpoint, options = {}) {
  // Try real API first
  if (API_URL) {
    try {
      const url = `${API_URL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      // Fall through to demo data
    }
  }

  // Return demo data if real API fails or is not configured
  const demo = DEMO_DATA[endpoint];
  if (demo) {
    return demo;
  }

  throw new Error(`API Error: endpoint not found and no demo data for ${endpoint}`);
}
