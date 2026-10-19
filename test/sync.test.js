// SyncService / AlertService tests against a stub pg Pool and a stub adapter.
// These exercise the production code path (syncAccount -> predict -> checkAndAlert -> store),
// not FatiguePredictor in isolation, so a call site that forgets `{ platform }` is caught here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from '../src/services/syncService.js';
import { AlertService } from '../src/services/alertService.js';

const DAY_MS = 864e5;
const START = Date.UTC(2026, 8, 1);

/** 14 flat days at the given frequency, shaped like an adapter's getDailyMetrics() output. */
const flatDays = (frequency) =>
  Array.from({ length: 14 }, (_, i) => ({
    date: new Date(START + i * DAY_MS).toISOString().slice(0, 10),
    impressions: 1000,
    clicks: 50,
    conversions: 2,
    spend: 100,
    ctr: 0.05,
    cvr: 0.04,
    roas: 4,
    frequency,
  }));

/** Minimal stand-in for a pg Pool: only `query`, like the real thing. */
function stubDb({ accounts = [], previousPrediction = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM ad_accounts WHERE is_active = true/.test(sql)) return { rows: accounts };
      if (/FROM predictions/.test(sql)) return { rows: previousPrediction ? [previousPrediction] : [] };
      if (/INSERT INTO creatives/.test(sql)) return { rows: [{ id: 42 }] };
      return { rows: [] };
    },
  };
}

function stubAdapterFactory(creatives, metricsByCreative) {
  const created = [];
  const factory = (platform, config) => {
    created.push({ platform, config });
    return {
      async getCreatives() { return creatives; },
      async getDailyMetrics(creativeId) { return metricsByCreative[creativeId]; },
    };
  };
  factory.created = created;
  return factory;
}

const insertedPredictions = (db) =>
  db.calls.filter((c) => /INSERT INTO predictions/.test(c.sql)).map((c) => c.params);
const insertedAlerts = (db) => db.calls.filter((c) => /INSERT INTO alerts/.test(c.sql));

test('SyncService: a Google creative at frequency 6 is judged against Google\'s cap, not Meta\'s', async () => {
  const db = stubDb();
  const adapterFactory = stubAdapterFactory(
    [{ id: 'g1', platform: 'google', name: 'Google creative', type: 'image' }],
    { g1: flatDays(6) }
  );
  const sync = new SyncService(db, { adapterFactory });

  const results = await sync.syncAccount('google', { accountId: '123' });

  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'success');
  const { prediction } = results[0];
  assert.equal(prediction.metricsChange.frequency.limit, 10);
  assert.equal(prediction.metricsChange.frequency.isHigh, false);
  assert.notEqual(prediction.status, 'fatigued');
  assert.equal(prediction.status, 'healthy');

  // What gets stored is the same verdict, and a healthy creative raises no alert.
  const [stored] = insertedPredictions(db);
  assert.equal(stored[4], 'healthy');
  assert.equal(stored[5], 'keep');
  assert.equal(insertedAlerts(db).length, 0);
});

test('SyncService: falls back to the account platform when the adapter omits creative.platform', async () => {
  const db = stubDb();
  const adapterFactory = stubAdapterFactory([{ id: 'g2', name: 'No platform field' }], { g2: flatDays(6) });
  const sync = new SyncService(db, { adapterFactory });

  const [result] = await sync.syncAccount('google', { accountId: '123' });
  assert.equal(result.prediction.metricsChange.frequency.limit, 10);
  assert.equal(result.prediction.status, 'healthy');
});

test('SyncService: the same frequency on Meta is fatigued and alerts', async () => {
  const db = stubDb();
  const adapterFactory = stubAdapterFactory(
    [{ id: 'm1', platform: 'meta', name: 'Meta creative', type: 'image' }],
    { m1: flatDays(6) }
  );
  const sync = new SyncService(db, { adapterFactory });

  const [result] = await sync.syncAccount('meta', { accountId: 'act_1' });
  assert.equal(result.prediction.metricsChange.frequency.limit, 5);
  assert.equal(result.prediction.status, 'fatigued');
  const alerts = insertedAlerts(db);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].params[1], 'fatigue_detected');
  assert.match(alerts[0].params[3], /Meta creative is fatigued/);
});

test('SyncService.syncAllAccounts queries active accounts and maps DB columns', async () => {
  const db = stubDb({
    accounts: [
      { id: 1, platform: 'google', account_id: '123-456', access_token_encrypted: 'tok-g', refresh_token_encrypted: 'ref-g', is_active: true },
      { id: 2, platform: 'tiktok', account_id: 'TT_9', access_token_encrypted: 'tok-t', refresh_token_encrypted: null, is_active: true },
    ],
  });
  const adapterFactory = stubAdapterFactory(
    [{ id: 'c1', platform: 'google', name: 'C1', type: 'image' }],
    { c1: flatDays(2) }
  );
  const sync = new SyncService(db, { adapterFactory });

  const results = await sync.syncAllAccounts();

  assert.match(db.calls[0].sql, /SELECT \* FROM ad_accounts WHERE is_active = true/);
  assert.deepEqual(adapterFactory.created, [
    { platform: 'google', config: { accountId: '123-456', accessToken: 'tok-g', refreshToken: 'ref-g' } },
    { platform: 'tiktok', config: { accountId: 'TT_9', accessToken: 'tok-t', refreshToken: null } },
  ]);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.status === 'success'));
});

test('SyncService.getPreviousPrediction normalizes the snake_case DB row', async () => {
  const db = stubDb({ previousPrediction: { status: 'warning', days_remaining: 12, confidence: '0.700' } });
  const sync = new SyncService(db, {});
  const previous = await sync.getPreviousPrediction('x');
  assert.equal(previous.daysRemaining, 12);
  assert.equal(previous.status, 'warning');
  assert.equal(previous.confidence, 0.7);
});

test('AlertService: English messages, "stable" for null daysRemaining, entries for unknown', () => {
  const svc = new AlertService();
  const creative = { id: 'c', name: 'Creative X', platform: 'google' };

  for (const status of ['unknown', 'healthy', 'warning', 'fatigued']) {
    const alert = svc.formatAlert(creative, { status, daysRemaining: null, recommendation: 'keep' }, [{}]);
    assert.ok(alert.message, `no message for ${status}`);
    assert.ok(alert.type, `no type for ${status}`);
    assert.ok(alert.severity, `no severity for ${status}`);
    assert.doesNotMatch(alert.message, /[一-鿿]/, `${status} message is not English`);
  }

  assert.match(svc.generateMessage(creative, { status: 'warning', daysRemaining: null }), /stable/);
  assert.match(svc.generateMessage(creative, { status: 'warning', daysRemaining: 4 }), /about 4 days/);
  assert.equal(svc.formatDaysRemaining({ status: 'healthy', daysRemaining: null }), 'stable');
  assert.equal(svc.formatDaysRemaining({ status: 'unknown', daysRemaining: null }), 'Unknown');
  assert.equal(svc.formatDaysRemaining({ status: 'fatigued', daysRemaining: 0 }), '0');
});
