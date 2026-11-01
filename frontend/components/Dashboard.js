import { format } from 'date-fns';
import { pluralDays } from '../lib/demoData';

export default function Dashboard({ stats, onSelectCreative }) {
  if (!stats) return null;

  const statusColors = {
    healthy: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    fatigued: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-800',
  };

  const platformColors = {
    google: 'bg-blue-100 text-blue-800',
    meta: 'bg-indigo-100 text-indigo-800',
    tiktok: 'bg-pink-100 text-pink-800',
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Creative Status</h3>
          <div className="space-y-2">
            {stats.statusStats?.map((stat) => (
              <div key={stat.status} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[stat.status] || statusColors.unknown}`}>
                  {stat.status || 'unknown'}
                </span>
                <span className="text-lg font-semibold">{stat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">By Platform</h3>
          <div className="space-y-2">
            {stats.platformStats?.map((stat) => (
              <div key={stat.platform} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${platformColors[stat.platform] || 'bg-gray-100'}`}>
                  {stat.platform}
                </span>
                <span className="text-lg font-semibold">{stat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Alerts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Today's Alerts</h3>
          <div className="text-4xl font-bold text-red-600">
            {stats.todayAlerts}
          </div>
          <p className="text-sm text-gray-500 mt-2">Needs attention</p>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">7-Day Performance</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-2xl font-bold">
                {(stats.weeklyTrend?.reduce((sum, d) => sum + Number(d.impressions), 0) / 1000000).toFixed(1)}M
              </div>
              <div className="text-xs text-gray-500">Impressions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {stats.weeklyTrend?.reduce((sum, d) => sum + Number(d.clicks), 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Clicks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Fatigue */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Upcoming Fatigue</h2>
          <p className="text-sm text-gray-500">CTR projected to reach half its own baseline within 7 days. Click one to see its decay curve.</p>
        </div>
        <div className="divide-y">
          {stats.upcomingFatigue?.length > 0 ? (
            stats.upcomingFatigue.map((creative) => (
              <button
                type="button"
                key={creative.id}
                onClick={() => onSelectCreative?.(creative.id)}
                className="w-full text-left px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-2 h-2 shrink-0 rounded-full ${
                    creative.status === 'fatigued' ? 'bg-red-500' :
                    creative.status === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{creative.name}</div>
                    <div className="text-sm text-gray-500">
                      {creative.platform} • {creative.adgroup_name || creative.campaign_name}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium text-red-600">
                    {creative.status === 'fatigued'
                      ? 'fatigued now'
                      : creative.days_remaining === null || creative.days_remaining === undefined
                        ? 'stable'
                        : pluralDays(creative.days_remaining)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {creative.status !== 'fatigued' && creative.fatigue_date && format(new Date(creative.fatigue_date), 'MM/dd')}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No creatives showing fatigue risk 🎉
            </div>
          )}
        </div>
      </div>

      {/* Performance Trend */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">7-Day Performance Trend</h2>
        <div className="h-64 flex items-end gap-2">
          {stats.weeklyTrend?.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-blue-200 rounded-t"
                style={{
                  height: `${(Number(day.impressions) / Math.max(...stats.weeklyTrend.map(d => Number(d.impressions)))) * 100}%`
                }}
              />
              <span className="text-xs text-gray-500">
                {format(new Date(day.date), 'MM/dd')}
              </span>
              {day.ctr !== undefined && (
                <span className="text-[11px] text-gray-400" title="Portfolio CTR that day">
                  {(Number(day.ctr) * 100).toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
