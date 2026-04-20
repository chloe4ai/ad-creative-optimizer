import { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api';

export default function AccountSettings() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    platform: 'meta',
    accountId: '',
    accountName: '',
    accessToken: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const data = await fetchAPI('/api/accounts');
      setAccounts(data.data || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await fetchAPI('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowAddForm(false);
      setFormData({ platform: 'meta', accountId: '', accountName: '', accessToken: '' });
      fetchAccounts();
    } catch (error) {
      console.error('Failed to add account:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要移除这个账户吗？')) return;
    try {
      await fetchAPI(`/api/accounts/${id}`, { method: 'DELETE' });
      fetchAccounts();
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleSync = async (id) => {
    try {
      const data = await fetchAPI(`/api/accounts/${id}/sync`, { method: 'POST' });
      alert(`同步完成: ${data.message}`);
    } catch (error) {
      console.error('Failed to sync account:', error);
    }
  };

  const platformLogos = {
    google: '🔵',
    meta: '🔷',
    tiktok: '🎵',
    pinterest: '🔴',
    linkedin: '🔵',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Connected Accounts</h2>
          <p className="text-sm text-gray-500">管理您的广告平台账户</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showAddForm ? '取消' : '添加账户'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold mb-4">添加新的广告账户</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Platform
                </label>
                <select
                  value={formData.platform}
                  onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="meta">Meta Ads</option>
                  <option value="google">Google Ads</option>
                  <option value="tiktok">TikTok Ads</option>
                  <option value="pinterest">Pinterest Ads</option>
                  <option value="linkedin">LinkedIn Ads</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account ID
                </label>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., act_123456789"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name (optional)
              </label>
              <input
                type="text"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="My Ad Account"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Token
              </label>
              <input
                type="password"
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Your API access token"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                添加
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">加载中...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <p className="text-gray-500">还没有连接任何广告账户</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            添加您的第一个账户
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{platformLogos[account.platform]}</span>
                  <div>
                    <div className="font-semibold">
                      {account.account_name || `Account ${account.account_id}`}
                    </div>
                    <div className="text-sm text-gray-500">
                      {account.platform} • {account.account_id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    account.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {account.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => handleSync(account.id)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    同步
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                  >
                    移除
                  </button>
                </div>
              </div>
              {account.last_sync_at && (
                <div className="mt-2 text-sm text-gray-500">
                  最后同步: {new Date(account.last_sync_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
