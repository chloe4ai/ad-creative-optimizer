import cron from 'node-cron';
import { adapterFactory } from '../adapters/index.js';
import { FatiguePredictor } from './prediction.js';
import { AlertService } from './alertService.js';

export class SyncService {
  constructor(db, config = {}) {
    this.db = db;
    this.predictor = new FatiguePredictor();
    this.alertService = new AlertService(config.alert);
    this.platforms = config.platforms || ['google', 'meta', 'tiktok'];
  }

  /**
   * 同步单个账户的创意数据
   */
  async syncAccount(platform, accountConfig) {
    const adapter = adapterFactory(platform, accountConfig);
    const creatives = await adapter.getCreatives(accountConfig.accountId);

    const results = [];

    for (const creative of creatives) {
      try {
        // 获取最近30天数据
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const dailyMetrics = await adapter.getDailyMetrics(
          creative.id,
          startDate,
          endDate
        );

        // 预测疲劳
        const prediction = this.predictor.predict(dailyMetrics);

        // 检查是否需要预警
        const previousPrediction = await this.getPreviousPrediction(creative.id);
        const { alert } = await this.alertService.checkAndAlert(
          creative,
          dailyMetrics,
          previousPrediction
        );

        // 存储结果
        await this.storeCreativeData(creative, dailyMetrics, prediction, alert);

        results.push({
          creativeId: creative.id,
          platform,
          status: 'success',
          prediction,
        });
      } catch (error) {
        console.error(`Error syncing creative ${creative.id}:`, error.message);
        results.push({
          creativeId: creative.id,
          platform,
          status: 'error',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 同步所有活跃账户
   */
  async syncAllAccounts() {
    const accounts = await this.db.getActiveAccounts();
    const results = [];

    for (const account of accounts) {
      const result = await this.syncAccount(account.platform, account);
      results.push(...result);
    }

    return results;
  }

  /**
   * 获取上一次的预测结果（用于比较）
   */
  async getPreviousPrediction(creativeId) {
    const result = await this.db.query(
      `SELECT * FROM predictions
       WHERE creative_id = $1
       ORDER BY predicted_at DESC
       LIMIT 1`,
      [creativeId]
    );
    return result.rows[0] || null;
  }

  /**
   * 存储创意数据到数据库
   */
  async storeCreativeData(creative, dailyMetrics, prediction, alert) {
    // Upsert creative
    const creativeResult = await this.db.query(
      `INSERT INTO creatives (
        platform, creative_id, ad_account_id, creative_type,
        url, thumbnail_url, headline, description,
        impressions_total, clicks_total, conversions_total, spend_total,
        last_checked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (platform, creative_id)
      DO UPDATE SET
        impressions_total = $9,
        clicks_total = $10,
        conversions_total = $11,
        spend_total = $12,
        last_checked_at = NOW()
      RETURNING id`,
      [
        creative.platform,
        creative.id,
        creative.adAccountId,
        creative.type,
        creative.url,
        creative.thumbnail,
        creative.headline,
        creative.description,
        dailyMetrics.reduce((sum, d) => sum + d.impressions, 0),
        dailyMetrics.reduce((sum, d) => sum + d.clicks, 0),
        dailyMetrics.reduce((sum, d) => sum + d.conversions, 0),
        dailyMetrics.reduce((sum, d) => sum + d.spend, 0),
      ]
    );

    const creativeDbId = creativeResult.rows[0].id;

    // Insert daily metrics
    for (const day of dailyMetrics) {
      await this.db.query(
        `INSERT INTO daily_metrics (
          creative_id, metric_date, impressions, clicks,
          conversions, spend, ctr, cvr, frequency, roas, cpc
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (creative_id, metric_date)
        DO UPDATE SET
          impressions = $3, clicks = $4, conversions = $5,
          spend = $6, ctr = $7, cvr = $8, frequency = $9, roas = $10, cpc = $11`,
        [
          creativeDbId,
          day.date,
          day.impressions,
          day.clicks,
          day.conversions,
          day.spend,
          day.ctr,
          day.cvr,
          day.frequency || 0,
          day.roas || 0,
          day.cpc || 0,
        ]
      );
    }

    // Insert prediction
    await this.db.query(
      `INSERT INTO predictions (
        creative_id, fatigue_date, confidence,
        days_remaining, status, recommendation
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        creativeDbId,
        prediction.fatigueDate,
        prediction.confidence,
        prediction.daysRemaining,
        prediction.status,
        prediction.recommendation,
      ]
    );

    // Insert alert if exists
    if (alert) {
      await this.db.query(
        `INSERT INTO alerts (
          creative_id, alert_type, severity, message, metrics_snapshot
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          creativeDbId,
          alert.type,
          alert.severity,
          alert.message,
          JSON.stringify(alert),
        ]
      );
    }
  }

  /**
   * 启动定时同步任务
   */
  startScheduledSync(schedule = '0 */6 * * *') {
    // Every 6 hours
    cron.schedule(schedule, async () => {
      console.log('Starting scheduled sync...');
      const results = await this.syncAllAccounts();
      console.log(`Sync completed. Processed ${results.length} creatives.`);
    });

    console.log(`Scheduled sync started with cron: ${schedule}`);
  }
}

export default SyncService;
