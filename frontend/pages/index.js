import { useState, useEffect, useCallback } from 'react';
import Dashboard from '../components/Dashboard';
import CreativeList from '../components/CreativeList';
import AlertCenter from '../components/AlertCenter';
import AccountSettings from '../components/AccountSettings';
import CreativeDetail from '../components/CreativeDetail';
import HowItWorks from '../components/HowItWorks';
import { LayoutDashboard, Image as ImageIcon, Bell, BookOpen, Link2 } from 'lucide-react';
import { fetchAPI, API_CONFIGURED } from '../lib/api';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // Without NEXT_PUBLIC_API_URL every response is sample data, so flag it before the first fetch.
  const [isDemo, setIsDemo] = useState(!API_CONFIGURED);
  // Creative whose decay curve is open in the detail panel.
  const [selectedId, setSelectedId] = useState(null);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  // Any component can send the reader to the "How it works" tab (closing the detail panel).
  const showMethod = useCallback(() => {
    setSelectedId(null);
    setActiveTab('method');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, []);

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
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'creatives', label: 'Creatives', Icon: ImageIcon },
    { id: 'alerts', label: 'Alerts', Icon: Bell },
    { id: 'method', label: 'How it works', Icon: BookOpen },
    { id: 'accounts', label: 'Accounts', Icon: Link2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {isDemo && (
        <div role="status" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm text-center px-4 py-2">
          <strong>Demo mode:</strong> sample ads for a fictional brand, scored in your browser by the real prediction engine (the backend is not hosted).
          Click a creative to see the ad, which signal is slipping, why, and{' '}
          <button
            type="button"
            onClick={showMethod}
            className="underline underline-offset-2 font-medium hover:text-amber-950 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            how fatigue is defined
          </button>.
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-xs border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
      <nav aria-label="Sections" className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`shrink-0 inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.Icon className="h-4 w-4" aria-hidden="true" />
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
            {activeTab === 'dashboard' && <Dashboard stats={stats} onSelectCreative={setSelectedId} onShowMethod={showMethod} setActiveTab={setActiveTab} />}
            {activeTab === 'creatives' && <CreativeList onSelectCreative={setSelectedId} onShowMethod={showMethod} setActiveTab={setActiveTab} />}
            {activeTab === 'alerts' && <AlertCenter onSelectCreative={setSelectedId} onShowMethod={showMethod} setActiveTab={setActiveTab} />}
            {activeTab === 'method' && <HowItWorks onSelectCreative={setSelectedId} isDemo={isDemo} />}
            {activeTab === 'accounts' && <AccountSettings />}
          </>
        )}
      </main>

      {selectedId !== null && <CreativeDetail creativeId={selectedId} onClose={closeDetail} onShowMethod={showMethod} />}
    </div>
  );
}
