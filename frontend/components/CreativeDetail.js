import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';
import { FatiguePredictor } from '../../src/services/prediction.js';
import { fetchAPI } from '../lib/api';
import { pct, pluralDays, joinList } from '../lib/demoData';

const predictor = new FatiguePredictor();
const { thresholds } = predictor;

// Longest projection drawn; beyond this the chart would be mostly empty future.
const MAX_PROJECTION_DAYS = 30;

const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok' };

const COLORS = {
  ctr: '#2563eb', // blue-600
  baseline: '#6b7280', // gray-500
  threshold: '#d97706', // amber-600
  projection: '#dc2626', // red-600
};

const statusStyles = {
  healthy: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  fatigued: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};

const METRICS = [
  { key: 'ctr', label: 'CTR', threshold: thresholds.ctrDropPercent, fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: 'cvr', label: 'CVR', threshold: thresholds.cvrDropPercent, fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: 'roas', label: 'ROAS', threshold: thresholds.roasDropPercent, fmt: (v) => `${v.toFixed(2)}x` },
];

// One sentence on why the engine reached its verdict, in the README's terms.
function explainVerdict(prediction) {
  const m = prediction.metricsChange;
  const crossed = METRICS.filter((x) => m[x.key].isFatigued).map((x) => x.label);
  // Average past threshold but not for enough consecutive days: persistence rule at work.
  const notPersistent = METRICS.filter((x) => m[x.key].change < -x.threshold && !m[x.key].isFatigued);
  const platform = PLATFORM_LABEL[prediction.platform] || prediction.platform;

  if (prediction.status === 'fatigued') {
    if (crossed.length >= 2) {
      return `${joinList(crossed)} have all crossed their thresholds for at least ${m.requiredRun} days running — two or more metrics agreeing is what makes it fatigue, not noise.`;
    }
    return `Frequency ${m.frequency.current.toFixed(1)} is over the ${platform} cap of ${m.frequency.limit}${crossed.length ? `, and only ${crossed[0]} crossed its threshold` : ' while CTR, CVR and ROAS are still within threshold'} — the audience is saturated, so frequency alone calls fatigue before the metrics bend.`;
  }
  if (prediction.status === 'warning') {
    if (crossed.length === 1) {
      return `Only ${crossed[0]} crossed its threshold — one metric is not enough to call fatigue, so this is a warning to prepare a replacement.`;
    }
    if (notPersistent.length) {
      return `${joinList(notPersistent.map((x) => x.label))} averaged past threshold but not for ${m.requiredRun} consecutive days yet — a dip has to persist before it counts.`;
    }
    return 'No metric has crossed its threshold yet, but at least one is more than halfway there — an early warning.';
  }
  if (prediction.status === 'healthy') {
    return prediction.fatigueDate
      ? 'Every metric is within half of its threshold of its own baseline; CTR is drifting down slowly, so the curve already has a date, but nothing needs doing yet.'
      : 'Every metric is within half of its threshold of its own baseline and CTR is flat or rising — no decline to extrapolate.';
  }
  return prediction.message || 'Not enough data to judge.';
}

function buildChart(series, prediction, now) {
  const m = prediction.metricsChange;
  const n = series.length;
  const recentStart = n - prediction.window;
  const baseline = m.ctr.baseline;
  const label = (date) => format(date, 'MM/dd');

  // Engine's decay: the window change spread over spanDays, compounding daily, i.e. an
  // exponential through the baseline window's midpoint and the recent window's midpoint.
  const hasDecay = Boolean(prediction.fatigueDate);
  const dailyRetention = hasDecay ? Math.pow(1 + m.ctr.change, 1 / prediction.spanDays) : 1;
  const baselineMid = (recentStart - 1) / 2;
  const trendAt = (t) => baseline * Math.pow(dailyRetention, t - baselineMid);

  const projectionDays = hasDecay ? Math.min(prediction.daysRemaining, MAX_PROJECTION_DAYS) : 0;

  const rows = series.map((day, t) => ({
    label: label(new Date(day.date ?? day.metric_date)),
    ctr: day.ctr * 100,
    trend: hasDecay && t >= baselineMid ? trendAt(t) * 100 : null,
  }));
  const today = rows[n - 1]?.label;
  for (let k = 1; k <= projectionDays; k++) {
    rows.push({
      label: label(new Date(now.getTime() + k * 864e5)),
      ctr: null,
      trend: trendAt(n - 1 + k) * 100,
    });
  }

  const fatiguePoint = hasDecay && prediction.daysRemaining <= MAX_PROJECTION_DAYS
    ? { x: rows[rows.length - 1].label, y: rows[rows.length - 1].trend }
    : null;

  return {
    rows,
    today,
    recentFrom: rows[recentStart]?.label,
    baseline: baseline * 100,
    threshold: baseline * (1 - thresholds.ctrDropPercent) * 100,
    fatiguePoint,
    truncated: hasDecay && prediction.daysRemaining > MAX_PROJECTION_DAYS,
  };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const names = { ctr: 'Daily CTR', trend: 'Decay curve' };
  return (
    <div className="bg-white border rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="font-medium text-gray-900 mb-1">{label}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-700">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          {names[p.dataKey]}: <span className="font-medium text-gray-900">{p.value.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function CreativeDetail({ creativeId, onClose }) {
  const [creative, setCreative] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setCreative(null);
    setError(null);
    fetchAPI(`/api/creatives/${creativeId}`)
      .then((res) => { if (!cancelled) setCreative(res.data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [creativeId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Score the history in the browser with the same engine the API runs, so the panel
  // explains exactly the numbers it shows (and works the same against a real backend).
  const analysis = useMemo(() => {
    if (!creative?.dailyMetrics) return null;
    const now = new Date();
    const series = predictor.normalizeMetrics(creative.dailyMetrics);
    const prediction = predictor.predict(creative.dailyMetrics, { platform: creative.platform, now });
    if (prediction.status === 'unknown') return { series, prediction, chart: null };
    return { series, prediction, chart: buildChart(series, prediction, now) };
  }, [creative]);

  const p = analysis?.prediction;
  const m = p?.metricsChange;
  const chart = analysis?.chart;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-gray-900/50 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creative-detail-title"
        className="bg-white w-full sm:max-w-3xl sm:rounded-xl shadow-xl overflow-y-auto max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <h2 id="creative-detail-title" className="text-lg font-semibold truncate">
              {creative?.name || 'Loading…'}
            </h2>
            {creative && (
              <div className="text-sm text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                <span>{PLATFORM_LABEL[creative.platform] || creative.platform}</span>
                <span>•</span>
                <span>{creative.campaign_name}</span>
                {p && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[p.status] || statusStyles.unknown}`}>
                    {p.status}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-6">
          {error && <p className="text-red-600 text-sm">Failed to load creative: {error}</p>}
          {!creative && !error && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          )}

          {p && (
            <>
              {/* Verdict */}
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                p.status === 'fatigued' ? 'bg-red-50 border-red-200 text-red-900'
                  : p.status === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-900'
                    : 'bg-green-50 border-green-200 text-green-900'
              }`}>
                <div className="font-semibold mb-1">
                  {p.status === 'fatigued' && 'Fatigued — pause or replace now'}
                  {p.status === 'warning' && (Number.isFinite(p.daysRemaining)
                    ? `Warning — CTR projected to halve in ${pluralDays(p.daysRemaining)} (${format(p.fatigueDate, 'MMM d')})`
                    : 'Warning — prepare a replacement')}
                  {p.status === 'healthy' && (Number.isFinite(p.daysRemaining)
                    ? `Healthy — CTR projected to halve in ${pluralDays(p.daysRemaining)}`
                    : 'Healthy — stable')}
                  {p.status === 'unknown' && 'Not enough data'}
                </div>
                <p>{explainVerdict(p)}</p>
              </div>

              {/* Chart */}
              {chart && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Daily CTR vs. its own baseline</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Shaded: the last {p.window} days, compared with the {analysis.series.length - p.window} days before.
                    {p.fatigueDate
                      ? ' Red dashed: the exponential decay the engine fits, extended from today.'
                      : ' CTR is not declining, so there is no decay to project.'}
                  </p>
                  <div className="h-64 sm:h-72 -ml-2 sm:ml-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chart.rows} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={16} />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                          domain={[0, 'auto']}
                          tickFormatter={(v) => `${v.toFixed(1)}%`}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          height={28}
                          iconType="plainline"
                          wrapperStyle={{ fontSize: 12 }}
                          payload={[
                            { value: 'Daily CTR', type: 'line', color: COLORS.ctr },
                            { value: 'Baseline avg', type: 'plainline', color: COLORS.baseline, payload: { strokeDasharray: '0' } },
                            { value: `−${thresholds.ctrDropPercent * 100}% threshold`, type: 'plainline', color: COLORS.threshold, payload: { strokeDasharray: '4 3' } },
                            ...(p.fatigueDate ? [{ value: 'Decay curve', type: 'plainline', color: COLORS.projection, payload: { strokeDasharray: '6 4' } }] : []),
                          ]}
                        />
                        {chart.recentFrom && (
                          <ReferenceArea x1={chart.recentFrom} x2={chart.today} fill="#9ca3af" fillOpacity={0.12} ifOverflow="extendDomain" />
                        )}
                        <ReferenceLine y={chart.baseline} stroke={COLORS.baseline} strokeWidth={1.5} />
                        <ReferenceLine y={chart.threshold} stroke={COLORS.threshold} strokeWidth={1.5} strokeDasharray="4 3" />
                        {chart.rows.length > analysis.series.length && (
                          <ReferenceLine x={chart.today} stroke="#9ca3af" strokeDasharray="2 3" label={{ value: 'Today', position: 'top', fontSize: 11, fill: '#6b7280' }} />
                        )}
                        <Line type="monotone" dataKey="ctr" stroke={COLORS.ctr} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                        {p.fatigueDate && (
                          <Line type="monotone" dataKey="trend" stroke={COLORS.projection} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                        )}
                        {chart.fatiguePoint && (
                          <ReferenceDot
                            x={chart.fatiguePoint.x}
                            y={chart.fatiguePoint.y}
                            r={5}
                            fill={COLORS.projection}
                            stroke="#fff"
                            strokeWidth={2}
                            label={{ value: 'Fatigue', position: 'left', fontSize: 11, fill: '#991b1b' }}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {p.fatigueDate && (
                    <p className="text-xs text-gray-500 mt-2">
                      Fatigue date = when the fitted curve falls to half of today&apos;s level
                      ({format(p.fatigueDate, 'MMM d')}, {pluralDays(p.daysRemaining)} out
                      {chart.truncated ? `; the chart shows the first ${MAX_PROJECTION_DAYS}` : ''}).
                    </p>
                  )}
                </div>
              )}

              {/* Rules table */}
              {m && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">The rules, applied</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                          <th className="px-3 py-2">Metric</th>
                          <th className="hidden sm:table-cell px-3 py-2">Baseline</th>
                          <th className="hidden sm:table-cell px-3 py-2">Last {p.window}d</th>
                          <th className="px-3 py-2">Change</th>
                          <th className="px-3 py-2">Threshold</th>
                          <th className="px-3 py-2 whitespace-nowrap">Days below</th>
                          <th className="px-3 py-2">Past?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {METRICS.map((x) => {
                          const v = m[x.key];
                          return (
                            <tr key={x.key}>
                              <td className="px-3 py-2 font-medium">{x.label}</td>
                              <td className="hidden sm:table-cell px-3 py-2 text-gray-600">{x.fmt(v.baseline)}</td>
                              <td className="hidden sm:table-cell px-3 py-2 text-gray-600">{x.fmt(v.current)}</td>
                              <td className={`px-3 py-2 font-medium ${v.change < -x.threshold ? 'text-red-600' : 'text-gray-900'}`}>{pct(v.change)}</td>
                              <td className="px-3 py-2 text-gray-600">−{Math.round(x.threshold * 100)}%</td>
                              <td className="px-3 py-2 text-gray-600">{v.consecutiveDaysBelow} / {m.requiredRun}</td>
                              <td className="px-3 py-2">
                                {v.isFatigued
                                  ? <span className="text-red-600 font-semibold" aria-label="past threshold">✗ yes</span>
                                  : <span className="text-green-600 font-semibold" aria-label="within threshold">✓ no</span>}
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="px-3 py-2 font-medium">Frequency</td>
                          <td className="hidden sm:table-cell px-3 py-2 text-gray-400">—</td>
                          <td className="hidden sm:table-cell px-3 py-2 text-gray-400">—</td>
                          <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap" title={`Last ${p.window} days average`}>
                            {creative.platform === 'meta' || m.frequency.current > 0
                              ? `${m.frequency.current.toFixed(1)} avg`
                              : <span className="text-gray-400 font-normal">not reported</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">cap {m.frequency.limit}</td>
                          <td className="px-3 py-2 text-gray-400">—</td>
                          <td className="px-3 py-2">
                            {m.frequency.isHigh
                              ? <span className="text-red-600 font-semibold" aria-label="over cap">✗ over</span>
                              : <span className="text-green-600 font-semibold" aria-label="under cap">✓ under</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Fatigued = 2+ of CTR, CVR, ROAS past threshold for {thresholds.consecutiveDays} consecutive days, or frequency over the {PLATFORM_LABEL[creative.platform] || creative.platform} cap.
                    {' '}Confidence {Math.round(p.confidence * 100)}% ({pluralDays(analysis.series.length)} of history).
                    {creative.platform !== 'meta' && m.frequency.current === 0 && ` ${PLATFORM_LABEL[creative.platform] || creative.platform} does not report frequency, so this creative is judged on the metric triad alone.`}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
