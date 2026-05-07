import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fetchAPI } from '../lib/api';

export default function AlertCenter() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
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

  const getSeverityStyles = (severity) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: '🔴',
          text: 'text-red-800',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: '🟡',
          text: 'text-yellow-800',
        };
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: '🔵',
          text: 'text-blue-800',
        };
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'fatigue_detected':
        return 'Fatigue Detected';
      case 'fatigue_warning':
        return 'Fatigue Warning';
      case 'performance_drop':
        return 'Performance Drop';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Alert Center</h2>
          <p className="text-sm text-gray-500">Manage your ad creative alerts</p>
        </div>
        <button
          onClick={fetchAlerts}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <div className="text-4xl mb-4">🎉</div>
          <p className="text-gray-500">No pending alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const styles = getSeverityStyles(alert.severity);
            return (
              <div
                key={alert.id}
                className={`${styles.bg} border rounded-xl p-4`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl">{styles.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-semibold ${styles.text}`}>
                        {getTypeLabel(alert.alert_type)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {alert.platform}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-2">{alert.message}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{alert.creative_name}</span>
                      <span>
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {/* Mark as resolved */}}
                    className="px-3 py-1 text-sm border rounded hover:bg-white"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
