import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { SyncService } from '../services/syncService.js';
import { getApiKey, getAllowedOrigins } from '../config.js';
import { getTokenKey } from '../services/tokenCrypto.js';
import { requireApiKey } from './middleware/apiKey.js';

import creativesRouter from './routes/creatives.js';
import accountsRouter from './routes/accounts.js';
import analyticsRouter from './routes/analytics.js';

config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fail closed: refuse to start without the secrets the API depends on.
let apiKey;
let allowedOrigins;
try {
  apiKey = getApiKey();
  getTokenKey(); // validates TOKEN_ENCRYPTION_KEY
  allowedOrigins = getAllowedOrigins();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}
if (allowedOrigins.length === 0) {
  console.warn('FRONTEND_ORIGIN is not set: no browser origin is allowed to call the API (CORS).');
}

// Middleware
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

db.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch((err) => console.error('Database connection error:', err));

// Initialize sync service
const syncService = new SyncService(db, {
  platforms: ['google', 'meta', 'tiktok'],
  alert: {
    channels: ['slack', 'email'],
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
    emailConfig: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      to: process.env.SMTP_TO,
    },
  },
});

// Make services available to routes
app.locals.db = db;
app.locals.syncService = syncService;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes: every /api route requires the shared secret; /health stays open for probes.
app.use('/api', requireApiKey(apiKey));
app.use('/api/creatives', creativesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/analytics', analyticsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start scheduled sync (every 6 hours)
  if (process.env.AUTO_SYNC !== 'false') {
    try {
      // startScheduledSync wraps each cron run in its own try/catch
      syncService.startScheduledSync('0 */6 * * *');
    } catch (error) {
      console.error('Failed to start scheduled sync:', error);
    }
  }
});

export default app;
