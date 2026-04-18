import { Router } from 'express';

const router = Router();

// 获取所有广告账户
router.get('/', async (req, res) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT id, platform, account_id, account_name, is_active, last_sync_at, created_at
       FROM ad_accounts
       ORDER BY platform, created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加广告账户
router.post('/', async (req, res) => {
  try {
    const { platform, accountId, accountName, accessToken, refreshToken } = req.body;

    // 验证必要字段
    if (!platform || !accountId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, accountId, accessToken',
      });
    }

    const result = await req.app.locals.db.query(
      `INSERT INTO ad_accounts (
        platform, account_id, account_name,
        access_token_encrypted, refresh_token_encrypted
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (platform, account_id)
      DO UPDATE SET
        account_name = $3,
        access_token_encrypted = $4,
        refresh_token_encrypted = $5,
        is_active = true
      RETURNING *`,
      [platform, accountId, accountName, accessToken, refreshToken]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除广告账户
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await req.app.locals.db.query(
      'UPDATE ad_accounts SET is_active = false WHERE id = $1',
      [id]
    );

    res.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动同步账户
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const accountResult = await req.app.locals.db.query(
      'SELECT * FROM ad_accounts WHERE id = $1 AND is_active = true',
      [id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const account = accountResult.rows[0];
    const syncService = req.app.locals.syncService;

    const results = await syncService.syncAccount(account.platform, {
      accountId: account.account_id,
      accessToken: account.access_token_encrypted,
      refreshToken: account.refresh_token_encrypted,
    });

    // 更新最后同步时间
    await req.app.locals.db.query(
      'UPDATE ad_accounts SET last_sync_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: `Synced ${results.length} creatives`,
      results,
    });
  } catch (error) {
    console.error('Error syncing account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试账户连接
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const accountResult = await req.app.locals.db.query(
      'SELECT * FROM ad_accounts WHERE id = $1',
      [id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const account = accountResult.rows[0];
    const { adapterFactory } = await import('../adapters/index.js');

    const adapter = adapterFactory(account.platform, {
      accessToken: account.access_token_encrypted,
    });

    const accounts = await adapter.getAdAccounts();

    res.json({
      success: true,
      connected: true,
      accounts,
    });
  } catch (error) {
    console.error('Error testing account:', error);
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
    });
  }
});

export default router;
