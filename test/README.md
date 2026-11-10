# Fatigue model tests

```bash
npm ci
npm test
```

`prediction.test.js` runs against `../src/services/prediction.js` directly — the module the
API actually serves, not a copy that can drift. `sync.test.js` drives `SyncService` and
`AlertService` with a stub pg Pool and a stub adapter, so it covers the call sites that feed
the model (platform, DB row shapes) and needs the root dependencies installed.
`diagnose.test.js` covers `diagnose()` and `classifyPattern()`, the layer that explains a
verdict, on the same module.

`demoData.test.js` checks the hosted demo's sample data (`frontend/lib/demoData.js`), which
depends only on the engine, so it runs in the same `npm test`.

The decay model is the part of this project that can be wrong quietly: a bad prediction still
returns a plausible-looking date, a status and a recommendation, so nothing crashes and nobody
notices until a campaign gets paused for no reason. Each test group pins one behaviour that
failed that way:

| Group | What it pins |
|---|---|
| Baseline window | A 3–7 day creative gets a real baseline. Slicing `[0, -7]` left it empty, so every metric was compared against zero, every change read as +100%, and an 80% CTR collapse reported `healthy`. |
| Platform frequency caps | The per-platform table is actually used. Every creative was checked against Meta's cap of 5, so a Google creative at a normal frequency of 6 was called `fatigued` and recommended for `pause`. |
| Warning threshold | A drop has to clear half the alert threshold. Any negative change at all used to raise `warning`, which means ordinary day-to-day noise did. |
| Consecutive days | `consecutiveDays` was declared in the thresholds and never read. One bad day can no longer condemn a creative. |
| Days remaining | The window-level change is converted to a daily decay rate before extrapolating. It used to be extrapolated as if it were a daily rate, compressing the forecast by roughly the length of the window — a 15% weekly decline predicted fatigue in 4 days instead of about 30. |
| Degenerate input | CTR falling to zero and missing metric fields return finite numbers. A flat or rising series returns `fatigueDate: null, daysRemaining: null` ("stable") instead of a made-up 14 days. |
| Input hygiene | pg `DECIMAL` strings are coerced to numbers, rows are sorted by date, zero-impression days are dropped, and fewer than 3 non-empty days returns `unknown`. Date math is UTC, so results do not depend on the runner's time zone. |
| Sync path | `SyncService` passes the creative's platform to the model (a Google creative at frequency 6 is not `fatigued`), reads active accounts with plain SQL, and normalizes the previous prediction row before deciding whether to alert. |

The diagnosis is a second way to be wrong quietly: a confident sentence about the cause is
worse than no sentence if it names the wrong one. `diagnose.test.js` builds each series from
counts (impressions, clicks, conversions, spend, revenue) so the expected answer can be worked
out by hand:

| Group | What it pins |
|---|---|
| Patterns | One synthetic series per pattern code, including the two that are not creative problems: CVR down with CTR flat is `post_click_problem`, and CPM up 30% with CTR and CVR flat is `cost_pressure` with `lead: 'cpm'`. The same CTR decline is `creative_wearout` with rising Meta frequency and `click_erosion` without it. |
| Lead signal | Frequency over the cap leads; otherwise the metric with the longest run below its line, ties going to the one furthest past its own threshold. |
| Signal detail | `state` (past, bending, holding, improving), `thresholdValue = baseline x (1 - threshold)`, and `crossedIndex` / `crossedDate` equal to the first day of the trailing run, also when rows arrive newest first. |
| Evidence | The same 25% CTR drop is `strong` on 100,000 impressions a day and `weak` on 200. The verdict is the same in both cases: evidence is reported, it does not gate the status. |
| Frequency | `reported: false` with every field null when all rows are 0 (never a made-up 0 against a cap), first day over the cap, days to the cap at the current slope. |
| Definition and projection | Window, baseline days and required run for 3 to 40 days of history; `projection.engineDays` is `prediction.daysRemaining`; no days and a `note` when CTR is not declining, whatever the status. |
| Verdict vs. diagnosis | A post-click problem still returns `status: 'fatigued'` with no CTR half-life. Pinned as a known limit so that changing it is a decision, not an accident. |
| Purity and input shapes | `diagnose()` mutates neither the rows nor the prediction, and `predict()` returns the same object before and after. DB-shaped rows (`metric_date`, DECIMAL strings, no `revenue` or `cpm`) and rate-only rows diagnose without NaN. |

`demoData.test.js` pins what the demo claims about itself: on every generated row
`roas = revenue / spend` and revenue per conversion is the creative's order value; only Meta
rows carry a frequency; the engine scores the ten samples 3 healthy, 5 warning, 2 fatigued;
each pattern the demo illustrates appears at least once; the sample set contains a fatigued
creative with no CTR half-life and a healthy one with one; `needsAction` holds every warning
and fatigued creative; and a different `now` changes dates and nothing else.

The remaining files pin the hardening rather than the model:

| File | What it pins |
|---|---|
| `auth.test.js` | The `x-api-key` middleware over real HTTP: no key, wrong key, a prefix of the key and the key plus one byte are all `401`; the right key passes under any header casing; `/health` needs none. |
| `tokenCrypto.test.js` | AES-256-GCM round trip, a fresh IV per call, authentication failure on a wrong key or a flipped ciphertext byte, legacy plaintext passthrough with a single warning, key parsing (hex or base64, exactly 32 bytes). |
| `config.test.js` | `API_KEY` is required and may not be a placeholder; `FRONTEND_ORIGIN` must be bare origins; database TLS verifies certificates by default in production and only skips verification behind an explicit flag that warns. |
