import { buildDemoState } from './demoData';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
// Shared secret the API requires in `x-api-key`. NEXT_PUBLIC_ values are compiled into the
// browser bundle, so this only keeps strangers out of a private deployment; it is not
// per-user auth. Leave it unset for the sample-data demo.
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// True when the build points at a real backend. When false every response is sample data.
export const API_CONFIGURED = Boolean(API_URL);

// Sample data: generated per-creative histories scored by the real FatiguePredictor.
// See lib/demoData.js.
const buildDemoData = () => {
  const state = buildDemoState();
  return {
    '/api/analytics/dashboard': { data: state.dashboard },
    '/api/creatives': { data: state.rows },
    '/api/creatives/alerts/list': { data: state.alerts },
    '/api/accounts': { data: state.accounts },
    details: state.details,
  };
};

const demoResponse = (endpoint) => {
  const [path, query = ''] = endpoint.split('?');
  const demo = buildDemoData();

  if (path === '/api/creatives') {
    // Apply the same filters the API does.
    const params = new URLSearchParams(query);
    const platform = params.get('platform');
    const status = params.get('status');
    const data = demo[path].data.filter((c) =>
      (!platform || c.platform === platform) && (!status || c.prediction_status === status));
    return { data, isDemo: true };
  }

  const detailMatch = path.match(/^\/api\/creatives\/(\d+)$/);
  if (detailMatch) {
    const detail = demo.details[Number(detailMatch[1])];
    return detail ? { data: detail, isDemo: true } : null;
  }

  const entry = demo[path];
  return entry && path.startsWith('/api/') ? { ...entry, isDemo: true } : null;
};

export async function fetchAPI(endpoint, options = {}) {
  const method = options.method || 'GET';

  // Always handle demo pause/rotate — return mock response without hitting real API
  if (method === 'POST') {
    const creativeIdMatch = endpoint.match(/^\/api\/creatives\/(\d+)\/(pause|rotate)$/);
    if (creativeIdMatch) {
      const id = parseInt(creativeIdMatch[1]);
      const action = creativeIdMatch[2];
      const creative = buildDemoData()['/api/creatives'].data.find((c) => c.id === id);
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
