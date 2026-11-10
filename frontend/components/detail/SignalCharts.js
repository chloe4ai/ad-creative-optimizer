// Charts for the creative detail panel: the per-signal evidence grid and the CTR projection.
import { format } from 'date-fns';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';
import { pct, pluralDays } from '../../lib/demoData';
import { COLORS, FORMATTERS, dayOf, daysFrom, platformName } from './format';

// Longest projection drawn; beyond this the chart would be mostly empty future.
const MAX_PROJECTION_DAYS = 30;

const AXIS_TICK = { fontSize: 11, fill: '#6b7280' };

const dayLabels = (series) => series.map((day, i) => {
  const d = dayOf(day);
  return Number.isNaN(d.getTime()) ? `Day ${i + 1}` : format(d, 'MMM d');
});

// A y domain that hugs the data (so a 15% move is visible) but still contains every
// reference line, snapped to round tick values.
function niceAxis(values, divisions = 3) {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return { domain: [0, 1], ticks: [0, 1], decimals: 0 };
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const rough = (hi - lo) / divisions;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rough) || rough;
  const start = Math.floor(lo / step + 1e-9) * step;
  const ticks = [];
  for (let v = start; v < hi + step - 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  // Fewest decimals that print the step exactly (0.25 needs two, 0.5 one, 2 none).
  const decimals = [0, 1, 2, 3].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-9) ?? 3;
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, decimals };
}

function Swatch({ color, dash, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width="18" height="6" aria-hidden="true">
        <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dash} />
      </svg>
      {label}
    </span>
  );
}

function PanelTooltip({ active, payload, label, fmt, name }) {
  if (!active || !payload?.length) return null;
  const point = payload.find((p) => p.value !== null && p.value !== undefined);
  if (!point) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-2.5 py-1.5 text-xs">
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{name}: {fmt(point.payload.raw)}</div>
    </div>
  );
}

// One small chart: daily line, baseline average, threshold (or cap), shaded recent
// window, and a dot on the day the metric crossed.
function SignalPanel({ panel, labels, recentFrom }) {
  const { scale, values, baseline, threshold, crossedIndex } = panel;
  const rows = values.map((v, i) => ({
    label: labels[i],
    raw: v,
    value: typeof v === 'number' && Number.isFinite(v) ? v * scale : null,
  }));
  const ref = (v) => (typeof v === 'number' && Number.isFinite(v) ? v * scale : null);
  const axis = niceAxis([...rows.map((r) => r.value), ref(baseline), ref(threshold)]);
  const crossed = crossedIndex !== null && crossedIndex !== undefined ? rows[crossedIndex] : null;
  const last = labels[labels.length - 1];

  return (
    <figure className="m-0 border border-gray-200 rounded-lg p-3 min-w-0" role="group" aria-label={panel.aria}>
      <figcaption className="mb-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-sm font-medium text-gray-900">
            {panel.title}
            {panel.headline && <span className={`ml-1.5 ${panel.headlineClass || 'text-gray-900'}`}>{panel.headline}</span>}
          </span>
          {panel.isLead && <span className="text-[11px] font-medium text-blue-700">moved first</span>}
        </div>
        <div className="text-xs text-gray-500">{panel.sub}</div>
      </figcaption>
      <div className="h-36" role="img" aria-label={panel.aria}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="creative-evidence" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={28} interval="preserveStartEnd" />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={46}
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(v) => panel.tick(v, axis.decimals)}
            />
            <Tooltip content={<PanelTooltip fmt={panel.fmt} name={panel.title} />} />
            {recentFrom && <ReferenceArea x1={recentFrom} x2={last} fill="#9ca3af" fillOpacity={0.14} />}
            {ref(baseline) !== null && <ReferenceLine y={ref(baseline)} stroke={COLORS.baseline} strokeWidth={1.5} />}
            {ref(threshold) !== null && <ReferenceLine y={ref(threshold)} stroke={COLORS.threshold} strokeWidth={1.5} strokeDasharray="4 3" />}
            <Line type="monotone" dataKey="value" stroke={COLORS.line} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {crossed && crossed.value !== null && (
              <ReferenceDot x={crossed.label} y={crossed.value} r={5} fill={COLORS.crossed} stroke="#fff" strokeWidth={2} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const percentTick = (v, decimals) => `${v.toFixed(decimals)}%`;

export function EvidenceCharts({ series, prediction, diagnosis, platform }) {
  const { signals, frequency, cost, definition, lead } = diagnosis;
  const labels = dayLabels(series);
  const n = series.length;
  const recentFrom = labels[n - definition.window];
  const run = definition.requiredRun;

  const triad = [
    { key: 'ctr', scale: 100, tick: percentTick },
    { key: 'cvr', scale: 100, tick: percentTick },
    { key: 'roas', scale: 1, tick: (v, d) => `${v.toFixed(d)}x` },
  ].map(({ key, scale, tick }) => {
    const sig = signals[key];
    const below = sig.consecutiveDaysBelow;
    const sub = `${below} ${below === 1 ? 'day' : 'days in a row'} below threshold (${run} needed)${sig.crossedDate && below > 0 ? `, since ${labels[sig.crossedIndex]}` : ''}${sig.state !== 'past' && below >= run ? '; average not past it yet' : ''}`;
    return {
      key,
      title: sig.label,
      headline: pct(sig.change),
      headlineClass: sig.state === 'past' ? 'text-red-600' : sig.state === 'bending' ? 'text-yellow-700' : 'text-gray-600',
      sub,
      isLead: lead === key,
      scale,
      tick,
      fmt: FORMATTERS[key],
      values: series.map((d) => d[key]),
      baseline: sig.baseline,
      threshold: sig.thresholdValue,
      crossedIndex: sig.consecutiveDaysBelow > 0 ? sig.crossedIndex : null,
      aria: `${sig.label} by day. Baseline ${FORMATTERS[key](sig.baseline)}, last ${definition.window} days ${FORMATTERS[key](sig.current)}, change ${pct(sig.change)}. ${sub}.`,
    };
  });

  let fourth;
  if (frequency.reported) {
    const over = frequency.firstOverIndex !== null;
    const sub = over
      ? `Over the cap of ${frequency.limit} since ${labels[frequency.firstOverIndex]}`
      : `Under the cap of ${frequency.limit}`;
    fourth = {
      key: 'frequency',
      title: 'Frequency',
      headline: `${frequency.windowAvg.toFixed(1)} avg`,
      headlineClass: frequency.isHigh ? 'text-red-600' : 'text-gray-600',
      sub,
      isLead: lead === 'frequency',
      scale: 1,
      tick: (v, d) => v.toFixed(d),
      fmt: FORMATTERS.frequency,
      values: series.map((d) => d.frequency),
      baseline: null,
      threshold: frequency.limit,
      crossedIndex: frequency.firstOverIndex,
      aria: `Frequency by day, impressions per person since launch. Last ${definition.window} days average ${frequency.windowAvg.toFixed(1)}. ${sub}.`,
    };
  } else {
    const cpm = cost.cpm;
    const sub = `Cost per 1,000 impressions. ${platformName(platform)} does not report frequency.`;
    fourth = {
      key: 'cpm',
      title: 'CPM',
      headline: cpm.change === null ? null : pct(cpm.change),
      headlineClass: 'text-gray-600',
      sub,
      isLead: lead === 'cpm',
      scale: 1,
      tick: (v, d) => `$${v.toFixed(d)}`,
      fmt: FORMATTERS.cpm,
      values: series.map((d) => {
        const own = Number(d.cpm);
        if (d.cpm !== undefined && d.cpm !== null && Number.isFinite(own)) return own;
        const impressions = Number(d.impressions);
        return impressions > 0 ? (Number(d.spend) / impressions) * 1000 : null;
      }),
      baseline: cpm.baseline,
      threshold: null,
      crossedIndex: null,
      aria: `CPM by day. Baseline ${FORMATTERS.cpm(cpm.baseline)}, last ${definition.window} days ${FORMATTERS.cpm(cpm.current)}.`,
    };
  }
  const panels = [...triad, fourth];
  const anyCrossed = panels.some((p) => p.crossedIndex !== null && p.crossedIndex !== undefined);

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-3">
        <Swatch color={COLORS.line} label="Daily value" />
        <Swatch color={COLORS.baseline} label="Baseline average" />
        <Swatch color={COLORS.threshold} dash="4 3" label={frequency.reported ? 'Threshold or cap' : 'Threshold'} />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-3 h-3 rounded-xs bg-gray-400/30 border border-gray-300" aria-hidden="true" />
          Last {pluralDays(prediction.window)}
        </span>
        {anyCrossed && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" aria-hidden="true" />
            Day it crossed
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {panels.map((panel) => (
          <SignalPanel key={panel.key} panel={panel} labels={labels} recentFrom={recentFrom} />
        ))}
      </div>
    </div>
  );
}

// The engine's decay: the window change spread over spanDays, compounding daily, i.e. an
// exponential through the baseline window's midpoint and the recent window's midpoint,
// extended to where it reaches half the creative's own baseline.
function buildProjection(series, prediction, diagnosis, now) {
  const m = prediction.metricsChange;
  const n = series.length;
  const recentStart = n - prediction.window;
  const baseline = m.ctr.baseline;
  const labels = dayLabels(series);

  const hasDecay = Boolean(prediction.fatigueDate);
  const dailyRetention = hasDecay ? Math.pow(1 + m.ctr.change, 1 / prediction.spanDays) : 1;
  const baselineMid = (recentStart - 1) / 2;
  const trendAt = (t) => baseline * Math.pow(dailyRetention, t - baselineMid);

  const projectionDays = hasDecay ? Math.min(prediction.daysRemaining, MAX_PROJECTION_DAYS) : 0;

  const rows = series.map((day, t) => ({
    label: labels[t],
    ctr: day.ctr * 100,
    trend: hasDecay && t >= baselineMid ? trendAt(t) * 100 : null,
  }));
  const today = rows[n - 1]?.label;
  for (let k = 1; k <= projectionDays; k++) {
    rows.push({
      label: format(daysFrom(now, k), 'MMM d'),
      ctr: null,
      trend: trendAt(n - 1 + k) * 100,
    });
  }

  const endPoint = hasDecay && prediction.daysRemaining <= MAX_PROJECTION_DAYS
    ? { x: rows[rows.length - 1].label, y: rows[rows.length - 1].trend }
    : null;

  return {
    rows,
    today,
    hasFuture: rows.length > n,
    recentFrom: rows[recentStart]?.label,
    baseline: baseline * 100,
    threshold: diagnosis.signals.ctr.thresholdValue * 100,
    halfLine: diagnosis.projection.level * 100,
    endPoint,
    truncated: hasDecay && prediction.daysRemaining > MAX_PROJECTION_DAYS,
  };
}

function ProjectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const names = { ctr: 'Daily CTR', trend: 'Decay curve' };
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
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

export function ProjectionChart({ series, prediction, diagnosis, now }) {
  const chart = buildProjection(series, prediction, diagnosis, now);
  const thresholdPct = Math.round(diagnosis.signals.ctr.threshold * 100);
  const axis = niceAxis([0, chart.baseline, ...chart.rows.map((r) => r.ctr), ...chart.rows.map((r) => r.trend)], 4);
  const aria = `Daily CTR with the fitted decay curve extended to half of the baseline CTR, ${FORMATTERS.ctr(diagnosis.projection.level)}${chart.endPoint ? `, reached on ${chart.endPoint.x}` : ''}.`;
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
        <Swatch color={COLORS.line} label="Daily CTR" />
        <Swatch color={COLORS.baseline} label="Baseline average" />
        <Swatch color={COLORS.threshold} dash="4 3" label={`−${thresholdPct}% threshold`} />
        <Swatch color={COLORS.projection} dash="6 4" label="Decay curve" />
        <Swatch color="#f87171" dash="2 3" label="Half of baseline" />
      </div>
      <div className="h-64 sm:h-72" role="img" aria-label={aria}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.rows} margin={{ top: 20, right: 52, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={28} />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={46}
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(v) => `${v.toFixed(axis.decimals)}%`}
            />
            <Tooltip content={<ProjectionTooltip />} />
            {chart.recentFrom && <ReferenceArea x1={chart.recentFrom} x2={chart.today} fill="#9ca3af" fillOpacity={0.14} />}
            <ReferenceLine y={chart.baseline} stroke={COLORS.baseline} strokeWidth={1.5} />
            <ReferenceLine y={chart.threshold} stroke={COLORS.threshold} strokeWidth={1.5} strokeDasharray="4 3" />
            <ReferenceLine y={chart.halfLine} stroke="#f87171" strokeWidth={1} strokeDasharray="2 3" />
            {chart.hasFuture && (
              <ReferenceLine x={chart.today} stroke="#9ca3af" strokeDasharray="2 3" label={{ value: 'Today', position: 'top', fontSize: 11, fill: '#6b7280' }} />
            )}
            <Line type="monotone" dataKey="ctr" stroke={COLORS.line} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="trend" stroke={COLORS.projection} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {chart.endPoint && (
              <ReferenceDot
                x={chart.endPoint.x}
                y={chart.endPoint.y}
                r={5}
                fill={COLORS.projection}
                stroke="#fff"
                strokeWidth={2}
                label={{ value: 'Half of baseline', position: 'bottom', fontSize: 11, fill: '#991b1b', offset: 8 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {chart.truncated && (
        <p className="text-xs text-gray-500 mt-1">The chart shows the first {MAX_PROJECTION_DAYS} days of the projection.</p>
      )}
    </div>
  );
}
