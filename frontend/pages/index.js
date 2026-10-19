import { useState, useEffect } from 'react';
import Dashboard from '../components/Dashboard';
import CreativeList from '../components/CreativeList';
import AlertCenter from '../components/AlertCenter';
import AccountSettings from '../components/AccountSettings';
import { fetchAPI, API_CONFIGURED } from '../lib/api';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // Without NEXT_PUBLIC_API_URL every response is sample data, so flag it before the first fetch.
  const [isDemo, setIsDemo] = useState(!API_CONFIGURED);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const data = await fetchAPI('/api/analytics/dashboard');
      setStats(data.data);
      setIsDemo(Boolean(data.isDemo) || !API_CONFIGURED);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'creatives', label: 'Creatives', icon: '🎨' },
    { id: 'alerts', label: 'Alerts', icon: '🔔' },
    { id: 'accounts', label: 'Accounts', icon: '🔗' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {isDemo && (
        <div role="status" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm text-center px-4 py-2">
          <strong>Demo mode:</strong> sample data, backend not hosted
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-xs border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Ad Creative Optimizer
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Last sync: {loading ? '…' : stats?.lastSync || 'Never'}
              </span>
              <button
                onClick={fetchDashboard}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <Dashboard stats={stats} />}
            {activeTab === 'creatives' && <CreativeList />}
            {activeTab === 'alerts' && <AlertCenter />}
            {activeTab === 'accounts' && <AccountSettings />}
          </>
        )}
      </main>
    </div>
  );
}
