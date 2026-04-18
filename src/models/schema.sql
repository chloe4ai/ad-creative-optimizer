-- PostgreSQL Schema for Ad Creative Optimizer

-- 广告账户表
CREATE TABLE ad_accounts (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,  -- google, meta, tiktok, pinterest, linkedin
  account_id VARCHAR(100) NOT NULL,
  account_name VARCHAR(255),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, account_id)
);

-- 创意表
CREATE TABLE creatives (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  creative_id VARCHAR(100) NOT NULL,
  ad_account_id INTEGER REFERENCES ad_accounts(id),
  campaign_id VARCHAR(100),
  adset_id VARCHAR(100),
  creative_type VARCHAR(20) NOT NULL,  -- image, video, carousel, text
  url TEXT,
  thumbnail_url TEXT,
  headline VARCHAR(500),
  description TEXT,
  impressions_total BIGINT DEFAULT 0,
  clicks_total BIGINT DEFAULT 0,
  conversions_total BIGINT DEFAULT 0,
  spend_total DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_checked_at TIMESTAMP,
  UNIQUE(platform, creative_id)
);

-- 每日效果数据
CREATE TABLE daily_metrics (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  conversions BIGINT DEFAULT 0,
  spend DECIMAL(15,2) DEFAULT 0,
  ctr DECIMAL(8,4),
  cvr DECIMAL(8,4),
  frequency DECIMAL(6,2),  -- 主要用于Meta
  roas DECIMAL(10,4),
  cpc DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(creative_id, metric_date)
);

-- 预测结果表
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE CASCADE,
  fatigue_date DATE,
  confidence DECIMAL(4,3),  -- 0-1
  days_remaining INTEGER,
  status VARCHAR(20),       -- healthy, warning, fatigued
  recommendation VARCHAR(20), -- keep, rotate, pause
  predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(creative_id, predicted_at)
);

-- 预警记录表
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE CASCADE,
  alert_type VARCHAR(30),   -- fatigue_warning, fatigue_detected, performance_drop
  severity VARCHAR(10),     -- info, warning, critical
  message TEXT,
  metrics_snapshot JSONB,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 行业基准表
CREATE TABLE benchmarks (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  category VARCHAR(100) NOT NULL,
  creative_type VARCHAR(20) NOT NULL,
  avg_ctr DECIMAL(8,4),
  avg_cvr DECIMAL(8,4),
  avg_fatigue_days INTEGER,
  p25_ctr DECIMAL(8,4),
  p25_cvr DECIMAL(8,4),
  p25_fatigue_days INTEGER,
  p75_ctr DECIMAL(8,4),
  p75_cvr DECIMAL(8,4),
  p75_fatigue_days INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, category, creative_type)
);

-- 索引
CREATE INDEX idx_creatives_account ON creatives(ad_account_id);
CREATE INDEX idx_creatives_platform ON creatives(platform);
CREATE INDEX idx_daily_metrics_creative ON daily_metrics(creative_id);
CREATE INDEX idx_daily_metrics_date ON daily_metrics(metric_date);
CREATE INDEX idx_predictions_creative ON predictions(creative_id);
CREATE INDEX idx_alerts_creative ON alerts(creative_id);
CREATE INDEX idx_alerts_unresolved ON alerts(is_resolved) WHERE is_resolved = false;

-- 更新触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_creatives_updated_at
  BEFORE UPDATE ON creatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_ad_accounts_updated_at
  BEFORE UPDATE ON ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
