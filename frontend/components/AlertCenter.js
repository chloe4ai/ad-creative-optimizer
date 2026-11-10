import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fetchAPI } from '../lib/api';
import { CreativeThumb } from './CreativePreview';

const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok', pinterest: 'Pinterest', linkedin: 'LinkedIn' };

const GROUPS = [
  {
    key: 'fatigued',
    title: 'Fatigued',
    card: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-800',
  },
  {
    key: 'warning',
    title: 'Warning',
    card: 'bg-yellow-50 border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800',
  },
  {
    key: 'other',
    title: 'Other',
    card: 'bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
  },
];

const groupOf = (alert) => {
  if (alert.severity === 'critical' || alert.alert_type === 'fatigue_detected') return 'fatigued';
  if (alert.severity === 'warning' || alert.alert_type === 'fatigue_warning') return 'warning';
  return 'other';
};

const timeAgo = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDistanceToNow(date, { addSuffix: true });
};

export default function AlertCenter({ onSelectCreative, onShowMethod }) {
  const [alerts, setAlerts] = useState([]);
  // Creative rows by id, for the thumbnail. Optional: cards render without it.
  const [creatives, setCreatives] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
    fetchAPI('/api/creatives')
      .then((data) => setCreatives(Object.fromEntries((data.data || []).map((c) => [String(c.id), c]))))
      .catch(() => {});
  }, []);

  const fetchAlerts = async () => {
    try {
      const data = await fetchAPI('/api/creatives/alerts/list');
      setAlerts(data.data || []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const grouped = GROUPS
    .map((group) => ({ ...group, items: alerts.filter((a) => groupOf(a) === group.key) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-lg font-semibold">Alert center</h2>
          <p className="text-sm text-gray-500 mt-1">
            An alert is raised when a creative is first scored as warning or fatigued, when its status changes
            to another non-healthy status, or when its projected days to the CTR half-life drop to less than half
            of the previous projection. Healthy creatives never raise one.{' '}
            {onShowMethod && (
              <button
                type="button"
                onClick={onShowMethod}
                className="text-blue-600 hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                How is this defined?
              </button>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAlerts}
          className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500">No pending alerts.</p>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.key} aria-labelledby={`alerts-${group.key}`} className="space-y-3">
            <h3 id={`alerts-${group.key}`} className="text-sm font-semibold text-gray-700">
              {group.title} <span className="font-normal text-gray-500">({group.items.length})</span>
            </h3>
            {group.items.map((alert) => {
              const creativeId = alert.creativeId ?? alert.creative_id;
              const creative = creativeId != null ? creatives[String(creativeId)] : undefined;
              const name = alert.creative_name || creative?.name || 'Creative';
              const platform = PLATFORM_LABEL[alert.platform] || alert.platform;
              const when = timeAgo(alert.created_at);
              return (
                <article key={alert.id} className={`${group.card} border rounded-xl p-4`}>
                  <div className="flex items-start gap-3 sm:gap-4">
                    {creative && <CreativeThumb creative={creative} className="w-12 h-12 sm:w-14 sm:h-14" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="font-semibold text-gray-900">{name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${group.badge}`}>{group.title}</span>
                        {alert.is_creative_problem === false && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-white border border-gray-300 text-[11px] font-medium text-gray-700">
                            Not a creative problem
                          </span>
                        )}
                      </div>
                      {alert.pattern_label && (
                        <div className="mt-0.5 text-sm font-medium text-gray-800">{alert.pattern_label}</div>
                      )}
                      <p className="mt-2 text-sm text-gray-700">{alert.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                        {onSelectCreative && creativeId != null && (
                          <button
                            type="button"
                            onClick={() => onSelectCreative(creativeId)}
                            aria-label={`See why: ${name}`}
                            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            See why
                          </button>
                        )}
                        {platform && <span>{platform}</span>}
                        {when && <span>{when}</span>}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
