import { Router } from 'express';

const router = Router();

// 获取所有创意（支持筛选）
router.get('/', async (req, res) => {
  try {
    const { platform, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        c.*,
        p.fatigue_date,
        p.days_remaining,
        p.status as prediction_status,
        p.confidence,
        p.recommendation
      FROM creatives c
      LEFT JOIN predictions p ON p.creative_id = c.id
        AND p.id = (SELECT id FROM predictions WHERE creative_id = c.id ORDER BY predicted_at DESC LIMIT 1)
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (platform) {
      query += ` AND c.platform = $${paramIndex++}`;
      params.push(platform);
    }

    if (status) {
      query += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await req.app.locals.db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error('Error fetching creatives:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个创意详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const creativeResult = await req.app.locals.db.query(
      `SELECT c.*, p.fatigue_date, p.days_remaining, p.status, p.confidence, p.recommendation
       FROM creatives c
       LEFT JOIN predictions p ON p.creative_id = c.id
       WHERE c.id = $1`,
      [id]
    );

    if (creativeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Creative not found' });
    }

    // 获取每日指标
    const metricsResult = await req.app.locals.db.query(
      `SELECT * FROM daily_metrics
       WHERE creative_id = $1
       ORDER BY metric_date DESC
       LIMIT 30`,
      [id]
    );

    // 获取预警历史
    const alertsResult = await req.app.locals.db.query(
      `SELECT * FROM alerts
       WHERE creative_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...creativeResult.rows[0],
        dailyMetrics: metricsResult.rows,
        alerts: alertsResult.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching creative:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取疲劳预警列表
router.get('/alerts/list', async (req, res) => {
  try {
    const { severity, limit = 20 } = req.query;

    let query = `
      SELECT a.*, c.creative_id as external_id, c.platform, c.name as creative_name
      FROM alerts a
      JOIN creatives c ON c.id = a.creative_id
      WHERE a.is_resolved = false
    `;
    const params = [];
    let paramIndex = 1;

    if (severity) {
      query += ` AND a.severity = $${paramIndex++}`;
      params.push(severity);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit));

    const result = await req.app.locals.db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发同步
router.post('/sync', async (req, res) => {
  try {
    const syncService = req.app.locals.syncService;
    const results = await syncService.syncAllAccounts();

    res.json({
      success: true,
      message: `Synced ${results.length} creatives`,
      results,
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 同步单个创意
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const creativeResult = await req.app.locals.db.query(
      'SELECT * FROM creatives WHERE id = $1',
      [id]
    );

    if (creativeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Creative not found' });
    }

    const creative = creativeResult.rows[0];
    const syncService = req.app.locals.syncService;

    const accountConfig = await req.app.locals.db.query(
      'SELECT * FROM ad_accounts WHERE id = $1',
      [creative.ad_account_id]
    );

    const account = accountConfig.rows[0];
    const { adapterFactory } = await import('../adapters/index.js');
    const adapter = adapterFactory(creative.platform, {
      accessToken: account.access_token_encrypted,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dailyMetrics = await adapter.getDailyMetrics(creative.creative_id, startDate, endDate);

    const { FatiguePredictor } = await import('../services/prediction.js');
    const predictor = new FatiguePredictor();
    const prediction = predictor.predict(dailyMetrics);

    await syncService.storeCreativeData(
      { ...creative, id: creative.creative_id },
      dailyMetrics,
      prediction,
      null
    );

    res.json({ success: true, prediction });
  } catch (error) {
    console.error('Error syncing creative:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 暂停创意
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;

    const creativeResult = await req.app.locals.db.query(
      'SELECT * FROM creatives WHERE id = $1',
      [id]
    );

    if (creativeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Creative not found' });
    }

    const creative = creativeResult.rows[0];

    const accountConfig = await req.app.locals.db.query(
      'SELECT * FROM ad_accounts WHERE id = $1',
      [creative.ad_account_id]
    );

    if (accountConfig.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Ad account not found' });
    }

    const account = accountConfig.rows[0];
    const { adapterFactory } = await import('../adapters/index.js');

    const adapterConfig = { accessToken: account.access_token_encrypted };
    if (creative.platform === 'google') {
      adapterConfig.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      adapterConfig.clientId = process.env.GOOGLE_ADS_CLIENT_ID;
      adapterConfig.clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
      adapterConfig.refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
      adapterConfig.customerId = account.account_id;
    }

    const adapter = adapterFactory(creative.platform, adapterConfig);
    const result = await adapter.pauseCreative(creative.creative_id, creative);

    await req.app.locals.db.query(
      `INSERT INTO alerts (creative_id, alert_type, severity, message, metrics_snapshot, is_resolved)
       VALUES ($1, 'creative_paused', 'info', $2, $3, false)`,
      [id, result.message, JSON.stringify({ action: 'pause', creative })]
    );

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error pausing creative:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 标记创意轮换
router.post('/:id/rotate', async (req, res) => {
  try {
    const { id } = req.params;

    const creativeResult = await req.app.locals.db.query(
      'SELECT * FROM creatives WHERE id = $1',
      [id]
    );

    if (creativeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Creative not found' });
    }

    const creative = creativeResult.rows[0];

    const accountConfig = await req.app.locals.db.query(
      'SELECT * FROM ad_accounts WHERE id = $1',
      [creative.ad_account_id]
    );

    if (accountConfig.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Ad account not found' });
    }

    const account = accountConfig.rows[0];
    const { adapterFactory } = await import('../adapters/index.js');

    const adapterConfig = { accessToken: account.access_token_encrypted };
    if (creative.platform === 'google') {
      adapterConfig.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      adapterConfig.clientId = process.env.GOOGLE_ADS_CLIENT_ID;
      adapterConfig.clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
      adapterConfig.refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
      adapterConfig.customerId = account.account_id;
    }

    const adapter = adapterFactory(creative.platform, adapterConfig);
    const result = await adapter.rotateCreative(creative.creative_id, creative);

    await req.app.locals.db.query(
      `INSERT INTO alerts (creative_id, alert_type, severity, message, metrics_snapshot, is_resolved)
       VALUES ($1, 'creative_rotation', 'warning', $2, $3, false)`,
      [id, result.message, JSON.stringify({ action: 'rotate', creative })]
    );

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error rotating creative:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
