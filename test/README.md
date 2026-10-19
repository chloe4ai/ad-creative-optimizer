# Fatigue model tests

```bash
npm ci
npm test        # node --test test/prediction.test.js test/sync.test.js
```

`prediction.test.js` runs against `../src/services/prediction.js` directly — the module the
API actually serves, not a copy that can drift. `sync.test.js` drives `SyncService` and
`AlertService` with a stub pg Pool and a stub adapter, so it covers the call sites that feed
the model (platform, DB row shapes) and needs the root dependencies installed.

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
