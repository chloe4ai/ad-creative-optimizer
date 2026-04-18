# Ad Creative Optimizer

> AI-powered ad creative fatigue prediction and optimization tool for Google Ads, Meta Ads, TikTok Ads, and more.

## Features

- **Multi-Platform Support**: Google Ads, Meta Ads, TikTok Ads, Pinterest, LinkedIn
- **Fatigue Prediction**: Predict when your ad creatives will become fatigued
- **Smart Alerts**: Get notified via Slack or Email before your creatives tire out
- **Unified Dashboard**: View all your ad creative performance in one place
- **ROI Optimization**: Know exactly when to rotate your creatives

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Installation

```bash
# Clone the repository
git clone https://github.com/chloe4ai/ad-creative-optimizer.git
cd ad-creative-optimizer

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your API credentials

# Set up the database
psql $DATABASE_URL < src/models/schema.sql

# Start the server
npm run dev
```

### Environment Variables

See `.env.example` for all required environment variables.

## API Endpoints

### Creatives

- `GET /api/creatives` - List all creatives (supports `?platform=`, `?status=`)
- `GET /api/creatives/:id` - Get creative details with metrics
- `GET /api/creatives/alerts/list` - List active alerts
- `POST /api/creatives/sync` - Trigger sync for all accounts
- `POST /api/creatives/:id/sync` - Sync single creative

### Accounts

- `GET /api/accounts` - List all connected ad accounts
- `POST /api/accounts` - Add new ad account
- `DELETE /api/accounts/:id` - Remove ad account
- `POST /api/accounts/:id/sync` - Sync account
- `POST /api/accounts/:id/test` - Test connection

### Analytics

- `GET /api/analytics/dashboard` - Dashboard overview
- `GET /api/analytics/benchmarks` - Industry benchmarks
- `GET /api/analytics/export` - Export report

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                      │
│  - Dashboard, Creative Management, Alert Center          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Express API Server                     │
│  - REST API, Authentication, Rate Limiting               │
└─────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ Google Ads  │  │ Meta Ads   │  │ TikTok     │
│  Adapter   │  │  Adapter   │  │  Adapter   │
└────────────┘  └────────────┘  └────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Prediction Engine                           │
│  - Fatigue Detection, Trend Analysis                     │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL
- **Adapters**: Google Ads API, Meta Marketing API, TikTok Marketing API
- **Prediction**: Exponential decay modeling
- **Notifications**: Slack webhooks, Email (Nodemailer)
- **Scheduling**: node-cron

## License

MIT
