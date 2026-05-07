import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fetchAPI } from '../lib/api';

export default function CreativeList() {
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState({ platform: '', status: '' });

  useEffect(() => {
    fetchCreatives();
  }, [filter]);

  const fetchCreatives = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.platform) params.set('platform', filter.platform);
      if (filter.status) params.set('status', filter.status);

      const data = await fetchAPI(`/api/creatives?${params}`);
      setCreatives(data.data || []);
    } catch (error) {
      console.error('Failed to fetch creatives:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (creative) => {
    if (!confirm(`Pause "${creative.name}"? This will stop the ad on ${creative.platform}.`)) return;
    setActionLoading(creative.id);
    try {
      const result = await fetchAPI(`/api/creatives/${creative.id}/pause`, { method: 'POST' });
      alert(result.message || 'Creative paused successfully');
      fetchCreatives();
    } catch (error) {
      alert(`Failed to pause: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRotate = async (creative) => {
    if (!confirm(`Mark "${creative.name}" for rotation? This will pause it and flag it for a new creative.`)) return;
    setActionLoading(creative.id);
    try {
      const result = await fetchAPI(`/api/creatives/${creative.id}/rotate`, { method: 'POST' });
      alert(result.message || 'Creative marked for rotation');
      fetchCreatives();
    } catch (error) {
      alert(`Failed to rotate: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      fatigued: 'bg-red-100 text-red-800',
      unknown: 'bg-gray-100 text-gray-800',
    };
    return `px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.unknown}`;
  };

  const getRecommendationBadge = (rec) => {
    const styles = {
      keep: 'bg-blue-100 text-blue-800',
      rotate: 'bg-orange-100 text-orange-800',
      pause: 'bg-red-100 text-red-800',
    };
    return `px-2 py-1 rounded text-xs font-medium ${styles[rec] || ''}`;
  };

  return (
    <div className="bg-white rounded-xl shadow">
      {/* Filters */}
      <div className="px-6 py-4 border-b flex items-center gap-4">
        <select
          value={filter.platform}
          onChange={(e) => setFilter({ ...filter, platform: e.target.value })}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Platforms</option>
          <option value="google">Google</option>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Status</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="fatigued">Fatigued</option>
        </select>
        <button
          onClick={fetchCreatives}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Creative</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Left</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recommendation</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">Loading...</td>
              </tr>
            ) : creatives.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No creatives found. Add an ad account to get started.
                </td>
              </tr>
            ) : (
              creatives.map((creative) => (
                <tr key={creative.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {creative.thumbnail_url && (
                        <img
                          src={creative.thumbnail_url}
                          alt=""
                          className="w-10 h-10 rounded object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">{creative.name || creative.creative_id}</div>
                        <div className="text-sm text-gray-500">{creative.headline}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize">{creative.platform}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={getStatusBadge(creative.prediction_status)}>
                      {creative.prediction_status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${
                      (creative.days_remaining || 999) <= 3 ? 'text-red-600' :
                      (creative.days_remaining || 999) <= 7 ? 'text-yellow-600' :
                      'text-gray-900'
                    }`}>
                      {creative.days_remaining ?? '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={getRecommendationBadge(creative.recommendation)}>
                      {creative.recommendation || 'keep'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {creative.recommendation !== 'keep' && (
                        <>
                          <button
                            onClick={() => handleRotate(creative)}
                            disabled={actionLoading === creative.id}
                            className="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded hover:bg-orange-200 disabled:opacity-50"
                          >
                            {actionLoading === creative.id ? '...' : 'Rotate'}
                          </button>
                          <button
                            onClick={() => handlePause(creative)}
                            disabled={actionLoading === creative.id}
                            className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50"
                          >
                            {actionLoading === creative.id ? '...' : 'Pause'}
                          </button>
                        </>
                      )}
                      {creative.recommendation === 'keep' && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {creative.updated_at && format(new Date(creative.updated_at), 'MM/dd HH:mm')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
