# Fatigue model tests

No dependencies beyond Node 18+:

```bash
node --test test/prediction.test.js
```

`prediction.test.js` runs against `../src/services/prediction.js` directly — the module the
API actually serves, not a copy that can drift.

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
| Degenerate input | CTR falling to zero, missing metric fields, and rising series all return finite numbers and a valid date. |
