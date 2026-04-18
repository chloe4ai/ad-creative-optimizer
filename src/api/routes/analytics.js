import { Router } from 'express';

const router = Router();

// 获取仪表盘概览
router.get('/dashboard', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // 统计各状态创意数量
    const statusStats = await db.query(`
      SELECT
        p.status,
        COUNT(*) as count
      FROM creatives c
      JOIN predictions p ON p.creative_id = c.id
      WHERE p.id = (
        SELECT id FROM predictions WHERE creative_id = c.id ORDER BY predicted_at DESC LIMIT 1
      )
      GROUP BY p.status
    `);

    // 平台分布
    const platformStats = await db.query(`
      SELECT platform, COUNT(*) as count
      FROM creatives
      GROUP BY platform
    `);

    // 今日预警统计
    const todayAlerts = await db.query(`
      SELECT COUNT(*) as count
      FROM alerts
      WHERE created_at > CURRENT_DATE
    `);

    // 即将疲劳的创意（7天内）
    const upcomingFatigue = await db.query(`
      SELECT c.*, p.fatigue_date, p.days_remaining, p.status
      FROM creatives c
      JOIN predictions p ON p.creative_id = c.id
      WHERE p.id = (
        SELECT id FROM predictions WHERE creative_id = c.id ORDER BY predicted_at DESC LIMIT 1
      )
      AND p.days_remaining <= 7
      AND p.days_remaining > 0
      ORDER BY p.days_remaining ASC
      LIMIT 10
    `);

    // 近7天效果趋势
    const weeklyTrend = await db.query(`
      SELECT
        DATE_TRUNC('day', dm.metric_date) as date,
        SUM(dm.impressions) as impressions,
        SUM(dm.clicks) as clicks,
        SUM(dm.conversions) as conversions,
        SUM(dm.spend) as spend,
        CASE WHEN SUM(dm.impressions) > 0
          THEN CAST(SUM(dm.clicks) AS DECIMAL) / SUM(dm.impressions)
          ELSE 0
        END as ctr,
        CASE WHEN SUM(dm.clicks) > 0
          THEN CAST(SUM(dm.conversions) AS DECIMAL) / SUM(dm.clicks)
          ELSE 0
        END as cvr
      FROM daily_metrics dm
      WHERE dm.metric_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', dm.metric_date)
      ORDER BY date ASC
    `);

    res.json({
      success: true,
      data: {
        statusStats: statusStats.rows,
        platformStats: platformStats.rows,
        todayAlerts: parseInt(todayAlerts.rows[0]?.count || 0),
        upcomingFatigue: upcomingFatigue.rows,
        weeklyTrend: weeklyTrend.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取基准数据
router.get('/benchmarks', async (req, res) => {
  try {
    const { platform, category } = req.query;

    let query = 'SELECT * FROM benchmarks WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (platform) {
      query += ` AND platform = $${paramIndex++}`;
      params.push(platform);
    }

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    const result = await req.app.locals.db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出报告
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', dateFrom, dateTo } = req.query;

    let query = `
      SELECT
        c.platform,
        c.creative_id,
        c.name as creative_name,
        c.creative_type,
        c.impressions_total,
        c.clicks_total,
        c.conversions_total,
        c.spend_total,
        p.fatigue_date,
        p.days_remaining,
        p.status as prediction_status,
        p.recommendation
      FROM creatives c
      LEFT JOIN predictions p ON p.creative_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (dateFrom) {
      query += ` AND c.created_at >= $${paramIndex++}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND c.created_at <= $${paramIndex++}`;
      params.push(dateTo);
    }

    query += ' ORDER BY c.updated_at DESC';

    const result = await req.app.locals.db.query(query, params);

    if (format === 'csv') {
      const csv = convertToCSV(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=creative-report.csv');
      return res.send(csv);
    }

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function convertToCSV(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export default router;
