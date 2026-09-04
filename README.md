# Ad Creative Optimizer

**Creative fatigue is a forecastable curve, not a postmortem.**

Most rotation decisions get made after ROAS falls — which means the money is already spent. This service watches per-creative performance across Google, Meta, TikTok, Pinterest and LinkedIn, models the decay while it is still shallow, and tells you the date a creative is going to die before it does.

▶ **[Live demo](https://ad-creative-optimizer.vercel.app)** — dashboard, creative list, alert center

---

## The product argument

Three decisions in this repo are worth defending, because each one is a place where an obvious design would have been wrong.

**1. Fatigue is a multi-metric verdict, not a CTR trigger.**
CTR alone is noisy and moves for reasons that have nothing to do with the creative — audience expansion, a competitor pausing, a holiday. A single-metric alarm generates the kind of false positives that get an alerting product turned off in week three. So a creative is only called fatigued when **two or more** of CTR, CVR and ROAS have degraded past their own thresholds, or when frequency alone has run past the platform's ceiling.

The thresholds are deliberately asymmetric, in `src/services/prediction.js`:

| Signal | Drop that counts as fatigue | Why not the same number |
|---|---|---|
| CTR | −15% | Cheapest to move, noisiest, first to bend — trips earliest |
| CVR | −20% | Contaminated by landing page and offer, so it needs more evidence |
| ROAS | −25% | The metric a marketer defends in a QBR; a false alarm here is expensive |

**2. The baseline is the creative's own history, not a category benchmark.**
Comparing a creative to an industry average tells you it was always mediocre. Comparing a creative to *itself* tells you it is dying. The engine takes the trailing 7 days against everything before it, so the question is always "has this asset degraded," never "is this asset good."

**3. Frequency ceilings are per platform, because the same number means different things.**
Meta 5, LinkedIn 6, Pinterest 7, TikTok 8, Google 10. A LinkedIn feed impression and a TikTok impression are not the same unit of attention, and a shared cap would over-alert on TikTok while missing Meta burnout entirely.

**4. Three consecutive days before firing.**
A one-day dip is a weekend. Requiring persistence trades a little latency for a lot of precision — the right trade for an alert whose whole value is that a human believes it.

Every prediction carries a `confidence` scaled by how much history it has, and a prediction with fewer than three days of data refuses to answer rather than guessing.

---

## What it does

- **Connects accounts** across Google Ads, Meta Marketing, TikTok Marketing, Pinterest and LinkedIn through a common adapter interface (`src/adapters/base.js`), so adding a platform is one file.
- **Syncs daily creative-level performance** on a cron and stores it in Postgres.
- **Scores each creative** — status, per-metric change vs. its own baseline, estimated fatigue date, days remaining, confidence, and a recommendation.
- **Alerts before the drop lands** via Slack webhook or email, so the rotation happens on a plan instead of in a panic.

## How it fits together

```
Google · Meta · TikTok · Pinterest · LinkedIn
                  │  (adapter per platform, one interface)
                  ▼
        Sync service  ──►  Postgres (daily creative metrics)
                  │
                  ▼
        Fatigue predictor      status · fatigue date · days remaining · confidence
                  │
                  ▼
        Alert service  ──►  Slack / email    +    REST API ──► Dashboard
```

**Stack:** Node + Express + PostgreSQL · Next.js frontend · node-cron scheduling · Nodemailer and Slack webhooks

## API surface

| | |
|---|---|
| `GET /api/creatives` | List creatives — filter by `platform`, `status` |
| `GET /api/creatives/:id` | Creative detail with full metric history |
| `GET /api/creatives/alerts/list` | Active fatigue alerts |
| `POST /api/creatives/sync` | Sync every connected account |
| `GET /api/accounts` · `POST` · `DELETE` | Manage connected ad accounts |
| `POST /api/accounts/:id/test` | Verify credentials before trusting a sync |
| `GET /api/analytics/dashboard` | Portfolio-level rollup |
| `GET /api/analytics/benchmarks` | Category benchmarks |
| `GET /api/analytics/export` | Report export |

## Run it locally

```bash
git clone https://github.com/chloe4ai/ad-creative-optimizer.git
cd ad-creative-optimizer
npm install
cp .env.example .env          # add platform credentials
psql $DATABASE_URL < src/models/schema.sql
npm run dev
```

Requires Node 18+ and PostgreSQL 14+. Redis is optional, for caching.

## Known limits

- **The decay model is deliberately simple.** Exponential decay against a self-baseline is legible and defensible; it is not a survival model and it does not decompose seasonality. That is a conscious first cut — a model a marketer cannot explain is a model a marketer will not act on. A hazard model with covariates is the honest next step, once there is enough labelled rotation history to validate one against.
- **Thresholds are global, not learned.** They should eventually be fit per account and per objective. Right now they are informed defaults, not fitted parameters.
- **No holdout.** The system asserts a fatigue date but does not yet score itself against what actually happened. The measurement I would build next: log every prediction, compare it to the realised decay, and publish precision at the alert level — an alerting product that never grades itself is asking for trust it has not earned.
- **Frequency is only read from Meta-style feeds.** Platforms that do not expose it fall back to the metric triad alone.

## License

MIT
