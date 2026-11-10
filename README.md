# Ad Creative Optimizer

**Creative fatigue is a forecastable curve, not a postmortem.**

Most rotation decisions get made after ROAS falls — which means the money is already spent. This service watches per-creative performance across Google, Meta and TikTok, models the decay while it is still shallow, and tells you which creatives are wearing out, which signal says so, and how long the click-through rate has left before it halves. Pinterest and LinkedIn are planned (caps modeled, adapter not built).

▶ **[Live demo](https://ad-creative-optimizer.vercel.app)** — dashboard, creative list, alert center, and a page that states the rules. Click any creative and it answers the questions a media buyer asks, in order:

- **What is the ad?** The creative itself, drawn in its placement (feed post, carousel, in-feed video, display banner, search or shopping result), with its copy, audience, objective and how it is bought.
- **What is the verdict?** Healthy, Warning or Fatigued today, and whether the engine thinks this is a creative problem at all. Two of the ten samples are declining for reasons a new creative would not fix (sizes sold out; the auction got more expensive), and the demo says so before it says anything else.
- **Which signal led, and why?** The metric that moved first, the named pattern it fits, the cause in this creative's own numbers, and the action that fits that cause.
- **Where is the evidence?** Four signals charted by day: CTR, CVR and ROAS, each against its own baseline and its threshold line, with the day it crossed marked; and frequency against the platform cap where the platform reports it (CPM where it does not).
- **Which definition was applied?** The windows, thresholds and persistence rule the engine used for this creative, how many metrics are past, and, separately, the projection of when CTR reaches half its own baseline.

The API is not hosted, so the demo runs on generated sample histories for a fictional advertiser (seeded, so everyone sees the same numbers; counts are integers and every rate is derived from them, so revenue ÷ spend really is the ROAS shown). Every status, diagnosis, projection and alert on it is computed in the browser by the real prediction engine (`src/services/prediction.js`), not typed in.

---

## The product argument

Five decisions in this repo are worth defending, because each one is a place where an obvious design would have been wrong.

**1. Fatigue is a multi-metric verdict, not a CTR trigger.**
CTR alone is noisy and moves for reasons that have nothing to do with the creative — audience expansion, a competitor pausing, a holiday. A single-metric alarm generates the kind of false positives that get an alerting product turned off in week three. So a creative is only called fatigued when **two or more** of CTR, CVR and ROAS have degraded past their own thresholds, or when frequency alone has run past the platform's ceiling.

The thresholds are deliberately asymmetric, in `src/services/prediction.js`:

| Signal | Drop that counts as fatigue | Why not the same number |
|---|---|---|
| CTR | −15% | Cheapest to move, noisiest, first to bend — trips earliest |
| CVR | −20% | Contaminated by landing page and offer, so it needs more evidence |
| ROAS | −25% | The metric a marketer defends in a QBR; a false alarm here is expensive |

**2. The baseline is the creative's own history, not a category benchmark.**
Comparing a creative to an industry average tells you it was always mediocre. Comparing a creative to *itself* tells you it is dying. The engine takes the most recent days (up to 7, never more than half the history) against everything before them, so the question is always "has this asset degraded," never "is this asset good."

**3. Frequency ceilings are per platform, because the same number means different things.**
Meta 5, TikTok 8, Google 10; LinkedIn 6 and Pinterest 7 are planned (caps modeled, adapter not built). A LinkedIn feed impression and a TikTok impression are not the same unit of attention, and a shared cap would over-alert on TikTok while missing Meta burnout entirely. In practice only the Meta cap can fire today: Meta is the only adapter that reports a frequency, the others store 0, and a platform that reports nothing is judged on the metric triad alone. The other caps are in the table so that a platform which starts reporting frequency is not silently held to Meta's 5.

**4. Persistence before firing.**
A one-day dip is a weekend. A metric only counts as past its threshold when it has been below the line on each of the last three days (fewer when the creative is too young to have three recent days). Requiring persistence trades a little latency for a lot of precision — the right trade for an alert whose whole value is that a human believes it.

**5. The verdict and the forecast are two different statements.**
"Fatigued" is a verdict about today. "CTR reaches half its own baseline in 12 days" is a projection. They are computed separately and they can disagree: a creative can be Fatigued on frequency alone while its CTR has not moved, so it has no projection at all, and a Healthy creative on a slow drift already has a date. Collapsing the two into one "fatigue date" is how a dashboard ends up telling a marketer a healthy ad dies on the 14th.

Every prediction carries a `confidence`, and a prediction with fewer than three days of data refuses to answer rather than guessing.

---

## How fatigue is defined

This is the whole rule, as implemented in `FatiguePredictor.predict()`. Nothing else feeds the verdict.

**Input.** One row per day per creative. Days with zero impressions are dropped (a day with no delivery is not evidence about the creative), rows are sorted by date, and what is left is the history, *N* days. Fewer than 3 days: status `unknown`, no verdict.

**Windows.** The recent window is the last *W* = min(7, ⌊*N* / 2⌋) days. The baseline is every day before it. So a 14-day creative compares its last 7 days with its first 7, a 10-day creative its last 5 with its first 5, and a 60-day creative its last 7 with the 53 before. Each side is the plain average of the daily values.

**Per-metric test.** For each of CTR, CVR and ROAS, change = (recent average − baseline average) ÷ baseline average. A metric is **past its threshold** when both hold:

| | CTR | CVR | ROAS |
|---|---|---|---|
| Recent average is down by more than | 15% | 20% | 25% |
| and each of the last *R* = min(3, *W*) days, ending today, is individually below | baseline × 0.85 | baseline × 0.80 | baseline × 0.75 |

**Frequency test.** The average reported frequency over the recent window is above the platform's cap (Meta 5, LinkedIn 6, Pinterest 7, TikTok 8, Google 10; an unknown platform gets Meta's 5). A platform that reports no frequency stores 0 and never trips it.

**Verdict.**

| Status | Rule | Recommendation |
|---|---|---|
| `fatigued` | Two or more of CTR, CVR, ROAS are past their thresholds, **or** frequency is over the cap | `pause` |
| `warning` | Exactly one metric is past its threshold, **or** any metric's recent average is down by more than half its threshold (CTR −7.5%, CVR −10%, ROAS −12.5%), persistence not required | `rotate` |
| `healthy` | Neither | `keep` |
| `unknown` | Fewer than 3 days with impressions | `keep` |

**Confidence** is a function of *N* and nothing else: 0.5 under 7 days, 0.7 under 14, 0.85 under 30, 0.95 from 30 days. It says how much history the comparison rests on. It does not look at volume or variance, so it is not a probability that the verdict is right.

### The CTR half-life projection

Separately from the verdict, the engine projects **the day CTR reaches half of the creative's own baseline**. The drop between the two windows is converted to a daily decay rate (the two windows' midpoints are *N* / 2 days apart), extrapolated as exponential decay, and counted from today. It is anchored to the baseline, not to today's level: a creative already down 40% has only ten points left to fall, and the projection says so. One already below half is at zero days. The horizon is capped at 90 days.

It is returned as `fatigueDate` and `daysRemaining` (`fatigue_date`, `days_remaining` in the database and API). The field names are historical; read them as "CTR half-life date" and "days to CTR half-life". Both are `null` when CTR is flat or rising against its baseline, whatever the status is, because there is no CTR decline to extrapolate. The projection uses CTR only: it says nothing about CVR, ROAS or frequency, and it is not the date the status will change.

## Diagnosis

`predict()` says what the status is. `diagnose(prediction, dailyMetrics)` says why, and whether replacing the creative would fix it. It is a pure function of the prediction and the same daily rows; it changes neither, so the stored prediction shape is untouched. The demo calls it in the browser; the API does not store or return it yet.

It returns:

- `definition` — the rule as applied to this creative: window, baseline days, history days, required run, thresholds, frequency cap, how many metrics are past (of the 2 needed), whether frequency is over the cap.
- `signals.ctr | cvr | roas` — baseline, current, change, the threshold as a level in the metric's own units (`thresholdValue` = baseline × (1 − threshold)), a `state`, the trailing run of days below the line, the day that run started (`crossedIndex`, `crossedDate`), the recent daily trend, and `evidence`. States: `past` (the per-metric test above), `bending` (down by more than half the threshold, including over it without the run), `improving` (up by more than half the threshold), `holding` (anything else).
- `evidence` — how likely the move is to be more than day-to-day noise: a two-proportion z-test on pooled counts for CTR (clicks of impressions) and CVR (conversions of clicks), a Welch t on daily values for ROAS. |z| ≥ 3 is `strong`, ≥ 2 `moderate`, below that `weak`.
- `frequency` — whether the platform reported one at all, latest value, window average, slope, the first day over the cap, and days until the cap at the current slope.
- `cost` — CPM, CPC, CPA, order value and spend per day, baseline against recent, from pooled sums. When rows carry no revenue it is reconstructed as ROAS × spend.
- `lead` — the signal that moved first. `cpm` when the pattern is cost pressure; `frequency` when it is over the cap (repeat exposure is the cause, the triad is the effect); otherwise the bending metric with the longest run below its line, ties going to the one furthest past its own threshold.
- `projection` — the CTR half-life again (`engineDays` is `daysRemaining`), plus a second estimate from the latest level at the recent trend's rate (`trendDays`). When the decline started late the two disagree, and the honest answer is the range. `note` says why there is no projection when there is none.
- `pattern` — the named diagnosis below, with a `cause` sentence written from this creative's numbers and an `action`.

Patterns are tested in this order and the first match wins (`classifyPattern()`). "Bending" below includes "past".

| Code | Rule | Creative problem? | Action |
|---|---|---|---|
| `insufficient_data` | Status is `unknown` | n/a | Wait for more delivery |
| `healthy` | Status is `healthy` and there is no CTR half-life | No | None |
| `slow_drift` | Status is `healthy` but CTR is below baseline, so a half-life exists | No | None; have the next concept queued |
| `saturation_leading` | Frequency over the cap, and none of CTR, CVR, ROAS bending yet | Yes | Widen or swap the audience, or rotate a new creative in, before CTR falls |
| `cost_pressure` | CTR and CVR not bending, ROAS bending, CPM up 15% or more | **No** | Leave the creative; review bids, budget, placements, account-wide CPM |
| `post_click_problem` | CTR not bending, CVR bending | **No** | Keep the creative; check landing page, offer, stock, conversion tracking |
| `full_funnel_fatigue` | CTR and CVR both past threshold | Yes | Pause and replace with a new concept, not a variation |
| `creative_wearout` | CTR bending, frequency reported and rising over the recent window, and over the cap or at least 60% of it | Yes | Prepare a new hook or visual for the same audience, or widen the audience |
| `click_erosion` | CTR bending, none of the above (frequency low, flat, or not reported) | Yes | Prepare a replacement; no need to pause early if paid per click and ROAS holds |
| `efficiency_drop` | Nothing above matched: ROAS is down without CTR, CVR or a 15% CPM rise | No | Check order value and CPM before touching the creative |

The two bold rows are the reason this exists. A worn-out creative loses the click first. One that still earns the click and loses only the conversion, or one whose audience responds as before while the media price rises, is not fatigued in any sense a new creative would fix, even though the verdict rule above will flag it.

---

## What it does

- **Connects accounts** across Google Ads, Meta Marketing and TikTok Marketing through a common adapter interface (`src/adapters/base.js`), so adding a platform is one file. Pinterest and LinkedIn are planned (caps modeled, adapter not built); `POST /api/accounts` rejects them until they have adapters.
- **Syncs daily creative-level performance** on a cron and stores it in Postgres.
- **Scores each creative** — status, per-metric change vs. its own baseline, the CTR half-life projection (`fatigueDate`, `daysRemaining`), confidence, and a recommendation.
- **Diagnoses the decline** — which signal led, which pattern it fits, whether it is a creative problem at all, and what to do about it (`diagnose()`).
- **Alerts before the drop lands** via Slack webhook or email, so the rotation happens on a plan instead of in a panic.

## How it fits together

```
Google · Meta · TikTok    (Pinterest · LinkedIn: planned, caps modeled, adapter not built)
                  │  (adapter per platform, one interface)
                  ▼
        Sync service  ──►  Postgres (daily creative metrics)
                  │
                  ▼
        Fatigue predictor      status · CTR half-life (fatigueDate, daysRemaining) · confidence
                  │            diagnosis: lead signal · pattern · action
                  │
                  ▼
        Alert service  ──►  Slack / email    +    REST API ──► Dashboard
```

**Stack:** Node + Express + PostgreSQL · Next.js frontend · node-cron scheduling · Nodemailer and Slack webhooks

## API surface

Every `/api` route requires the shared secret in an `x-api-key` header (see [Security](#security)); `/health` is open.

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
openssl rand -hex 32          # -> API_KEY
openssl rand -hex 32          # -> TOKEN_ENCRYPTION_KEY
psql $DATABASE_URL < src/models/schema.sql
npm run dev
```

Then call it with the key:

```bash
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/creatives
```

Requires Node 20+ and PostgreSQL 14+. The server refuses to start until `API_KEY` and `TOKEN_ENCRYPTION_KEY` are set.

## Security

The API is built to run as a private service behind one dashboard, and the controls match that scope.

- **Shared-secret auth.** `src/api/middleware/apiKey.js` guards every `/api` route; the key is compared in constant time and a missing or wrong key is a `401`. There is one key for the whole deployment, not per-user accounts. The frontend sends it from `NEXT_PUBLIC_API_KEY`, which is compiled into the browser bundle, so anyone who can load the dashboard can read it: it keeps strangers out, it does not separate users.
- **CORS is an allow-list.** `FRONTEND_ORIGIN` names the browser origin(s) allowed to call the API. Unset means no browser origin is allowed.
- **Ad-platform tokens are encrypted at rest.** `POST /api/accounts` encrypts access and refresh tokens with AES-256-GCM (`src/services/tokenCrypto.js`) under `TOKEN_ENCRYPTION_KEY` before they reach Postgres; the adapters decrypt them on read, and the API never returns them. Losing the key makes every stored token unreadable, so keep it with the database backups.
- **Migrating existing rows.** Deployments created before encryption hold plaintext in `access_token_encrypted`. Such rows still work (the server logs a warning once) until you run `npm run encrypt-tokens`, which rewrites them in place inside a transaction and is safe to re-run.
- **Database TLS is verified.** In production the pool connects with certificate verification on. Provide the provider's CA as `DATABASE_SSL_CA`, or, as a last resort, set `DATABASE_SSL_ALLOW_SELF_SIGNED=true`, which disables verification and is logged as a warning at every start.

## Known limits

- **The decay model is deliberately simple.** Exponential decay against a self-baseline is legible and defensible; it is not a survival model and it does not decompose seasonality. That is a conscious first cut — a model a marketer cannot explain is a model a marketer will not act on. A hazard model with covariates is the honest next step, once there is enough labelled rotation history to validate one against.
- **Thresholds are global, not learned.** They should eventually be fit per account and per objective. Right now they are informed defaults, not fitted parameters.
- **No holdout.** The system asserts a verdict and a CTR half-life but does not yet score itself against what actually happened. The measurement I would build next: log every prediction, compare it to the realised decay, and publish precision at the alert level — an alerting product that never grades itself is asking for trust it has not earned.
- **The verdict still counts CVR.** The status rule is "two of three", and CVR and the ROAS it drags down are two. A sold-out size or a broken checkout can therefore read as Warning or Fatigued with a `pause` recommendation while the ad is doing its job. Only the diagnosis separates it (`post_click_problem`, `cost_pressure`, `isCreativeProblem: false`); the stored status, the recommendation and the alert trigger do not. Until the verdict is gated on the pattern, read the status as "this needs a human" and the diagnosis as "this is why."
- **Evidence strength is reported, not enforced.** `diagnose()` says whether a drop is strong, moderate or weak evidence given the volume behind it, but a metric that crosses its threshold on a few dozen clicks raises the same verdict as one that crosses on thousands. `confidence` does not cover this either: it counts days, not impressions.
- **The baseline can include the start of the decline.** Everything before the recent window is baseline, so a creative that began sliding before that window has a baseline that is already lower than its real peak, which understates the drop. It also means the windows are fixed positions in the history, not a detected change point.
- **Frequency is only read from Meta, and the cap assumes a frequency the adapter does not yet supply.** The caps are meant as average impressions per person over the life of the ad, which is how the demo data is generated (cumulative since launch). The Meta adapter (`src/adapters/meta.js`) reads `frequency` off each row of a date-ranged insights report, but does not list it among the fields it requests, and a per-row value from such a report describes that row's date range, not the run since launch. So against a live account the frequency rule is either silent or comparing a short-period number with a lifetime cap. For the cap to mean what it says, the adapter needs to request a cumulative (since launch) or rolling 7-day frequency and the cap needs to be stated for that same period. Platforms that report nothing fall back to the metric triad alone.
- **The CTR half-life is a CTR statement.** It is not when ROAS breaks even or when the status changes, and the first-window-to-last-window rate behind it lags a decline that started late. `diagnose().projection` gives the range; the stored `days_remaining` is the single engine number.

## License

MIT
