import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { FatiguePredictor } from '../../src/services/prediction.js';
import { buildDemoState, pct, pluralDays, joinList } from '../lib/demoData';

// The single-page answer to "how is fatigue defined, and why does the engine think a
// creative will decline". Every threshold on this page is read from the engine
// (new FatiguePredictor().thresholds), the pattern labels and actions come from
// classifyPattern(), and the worked example is a demo creative scored by predict() and
// diagnose(), so the page cannot drift from the code.

// The creative used for the worked example (Flash Sale Countdown in lib/demoData.js).
const EXAMPLE_ID = 7;

const predictor = new FatiguePredictor();
const T = predictor.thresholds;

const whole = (v) => `${Number((v * 100).toFixed(1))}%`;         // 0.15 -> "15%", 0.075 -> "7.5%"
const drop = (v) => `−${whole(v)}`;                              // threshold as a change
const rate = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'n/a'); // a CTR level
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const PLATFORM_NAME = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', pinterest: 'Pinterest', linkedin: 'LinkedIn' };
const platformName = (key) => PLATFORM_NAME[key] || cap(key);

const METRICS = [
  { key: 'ctr', label: 'CTR', threshold: T.ctrDropPercent },
  { key: 'cvr', label: 'CVR', threshold: T.cvrDropPercent },
  { key: 'roas', label: 'ROAS', threshold: T.roasDropPercent },
];
const thresholdList = joinList(METRICS.map((m) => `${m.label} ${drop(m.threshold)}`));
const halfwayList = joinList(METRICS.map((m) => `${m.label} ${drop(m.threshold / 2)}`));

const STATUS_BADGE = {
  healthy: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  fatigued: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};
const STATUS_EDGE = {
  healthy: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  fatigued: 'border-l-red-500',
};

// ---------------------------------------------------------------------------
// Pattern catalogue. The label, the "is it a creative problem" flag and the action are
// whatever classifyPattern() returns for a minimal input that satisfies each rule; only
// the rule-in-words column is written here. Order is the engine's: first match wins.
// ---------------------------------------------------------------------------
const sig = (state, change = 0, level = 'strong') => ({ state, change, evidence: { z: null, level } });
const HOLD = sig('holding');
const noFrequency = { reported: false, isHigh: false, limit: T.frequencyLimit.meta, latest: null, windowAvg: null, slopePerDay: null };
const flatCost = { cpm: { change: 0 } };
const classify = (status, signals, frequency = noFrequency, cost = flatCost, fatigueDate = null) => predictor.classifyPattern(
  { status, fatigueDate },
  { ctr: HOLD, cvr: HOLD, roas: HOLD, ...signals },
  frequency,
  cost,
);

const PATTERN_RULES = [
  {
    code: 'healthy',
    rule: 'The verdict is Healthy and CTR is flat, rising, or down by less than its day-to-day noise.',
    build: () => classify('healthy', {}),
  },
  {
    code: 'slow_drift',
    rule: 'The verdict is Healthy, but average CTR is 3% or more below its baseline and the gap is larger than its day-to-day noise, so a CTR half-life can be projected.',
    build: () => classify('healthy', { ctr: sig('holding', -0.05) }, noFrequency, flatCost, new Date()),
  },
  {
    code: 'saturation_leading',
    rule: 'Frequency is over the platform cap while CTR, CVR and ROAS are all less than halfway to their thresholds.',
    build: () => classify('fatigued', {}, { ...noFrequency, reported: true, isHigh: true, windowAvg: T.frequencyLimit.meta + 1, latest: T.frequencyLimit.meta + 1, slopePerDay: 0.2 }),
  },
  {
    code: 'saturation_compound',
    rule: 'Frequency is over the platform cap and the metrics match one of the "look elsewhere" rules below (auction cost, post-click, or return down). Both are stated, frequency first.',
    build: () => classify('fatigued', { cvr: sig('past', -0.22) }, { ...noFrequency, reported: true, isHigh: true, windowAvg: T.frequencyLimit.meta + 1, latest: T.frequencyLimit.meta + 1, slopePerDay: 0.2 }),
  },
  {
    code: 'cost_pressure',
    rule: 'CTR and CVR are less than halfway to their thresholds, ROAS is more than halfway to its threshold, and CPM is up 15% or more.',
    build: () => classify('warning', { roas: sig('bending', -0.18) }, noFrequency, { cpm: { change: 0.2 } }),
  },
  {
    code: 'post_click_problem',
    rule: 'CTR is less than halfway to its threshold while CVR is more than halfway to its own.',
    build: () => classify('warning', { cvr: sig('past', -0.22) }),
  },
  {
    code: 'full_funnel_fatigue',
    rule: 'CTR and CVR are both more than halfway to their thresholds, and at least one of them is past its threshold.',
    build: () => classify('fatigued', { ctr: sig('past', -0.3), cvr: sig('past', -0.25), roas: sig('past', -0.4) }),
  },
  {
    code: 'creative_wearout',
    rule: 'CTR is more than halfway to its threshold while CVR is not, and frequency is reported, still rising, and either over the cap or at 60% of it or more.',
    build: () => classify('warning', { ctr: sig('past', -0.2) }, { ...noFrequency, reported: true, latest: T.frequencyLimit.meta * 0.8, windowAvg: T.frequencyLimit.meta * 0.7, slopePerDay: 0.2 }),
  },
  {
    code: 'click_erosion',
    rule: 'CTR is more than halfway to its threshold while CVR is not, and frequency does not explain it (for example the platform does not report frequency).',
    build: () => classify('warning', { ctr: sig('past', -0.2) }),
  },
  {
    code: 'efficiency_drop',
    rule: 'Only ROAS is more than halfway to its threshold, and CPM has not risen 15%.',
    build: () => classify('warning', { roas: sig('bending', -0.18) }),
  },
  {
    code: 'insufficient_data',
    rule: `Fewer than ${T.minDataDays} days with impressions. No verdict is given.`,
    build: () => predictor.diagnose(null, null).pattern,
  },
];

const buildPatterns = () => PATTERN_RULES.map((entry) => {
  try {
    const pattern = entry.build();
    // If the engine's rules change and this input no longer lands on the pattern, drop
    // the row rather than show a label that belongs to a different rule.
    return pattern && pattern.code === entry.code ? { ...entry, pattern } : null;
  } catch (error) {
    return null;
  }
}).filter(Boolean);

const NO_ISSUE_CODES = new Set(['healthy', 'slow_drift']);

function CreativeProblemBadge({ pattern }) {
  if (pattern.isCreativeProblem === true) {
    return <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-800">Yes, the creative</span>;
  }
  if (pattern.isCreativeProblem === false && !NO_ISSUE_CODES.has(pattern.code)) {
    return <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">No, look elsewhere</span>;
  }
  return (
    <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
      {pattern.isCreativeProblem === false ? 'Nothing is wrong' : 'Cannot tell yet'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
function Section({ id, title, lead, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-white rounded-xl shadow-sm p-4 sm:p-6 scroll-mt-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900">{title}</h2>
      {lead && <p className="mt-2 text-sm text-gray-600 max-w-3xl">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// A table on wide screens, a stack of labelled cards on narrow ones (one DOM, no
// horizontal scroll). `columns` is [{ key, label, span }] on a 12-column grid.
const SPAN = { 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4', 5: 'md:col-span-5' };

function ResponsiveTable({ caption, columns, rows }) {
  return (
    <div role="table" aria-label={caption} className="text-sm">
      <div role="row" className="hidden md:grid md:grid-cols-12 md:gap-4 pb-2 border-b border-gray-200">
        {columns.map((col) => (
          <div key={col.key} role="columnheader" className={`${SPAN[col.span]} text-xs font-medium uppercase tracking-wide text-gray-500`}>
            {col.label}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} role="row" className="py-4 border-b border-gray-100 last:border-b-0 space-y-3 md:space-y-0 md:grid md:grid-cols-12 md:gap-4">
          {columns.map((col, i) => (
            <div key={col.key} role={i === 0 ? 'rowheader' : 'cell'} className={`${SPAN[col.span]} min-w-0 text-gray-700`}>
              {i > 0 && <div className="md:hidden text-xs font-medium uppercase tracking-wide text-gray-500 mb-0.5">{col.label}</div>}
              {row[col.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ExampleButton({ creative, onSelectCreative, prefix = 'See' }) {
  return (
    <button
      type="button"
      onClick={() => onSelectCreative(creative.spec.id)}
      className="text-left text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {prefix} {creative.spec.name}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Worked diagram: one creative's daily CTR with every part of the rule drawn on it.
// Geometry is in real pixels of the measured width, so text stays readable on a phone.
// ---------------------------------------------------------------------------
const useWidth = (ref) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
};

// Everything the diagram and its captions need, from the engine's output for one creative.
const buildExample = (creative) => {
  if (!creative || !creative.diagnosis || !creative.diagnosis.signals) return null;
  const { prediction, diagnosis, dailyMetrics, spec } = creative;
  const ctr = diagnosis.signals.ctr;
  if (!(ctr.baseline > 0)) return null;
  const series = dailyMetrics.map((d) => d.ctr);
  const n = series.length;
  const window = diagnosis.definition.window;
  const baselineDays = diagnosis.definition.baselineDays;
  const halfLevel = diagnosis.projection.level;

  // The curve the engine extrapolates along (see estimateFatigueDate): from the recent
  // window's midpoint, at the daily rate implied by the window-to-window change, until it
  // meets half the baseline. The day count in the copy is the engine's own daysRemaining.
  const retention = 1 + ctr.change;
  const midIndex = n - 1 - (window - 1) / 2;
  let projection = null;
  if (prediction.daysRemaining !== null && ctr.change < 0 && retention > diagnosis.definition.fatigueLevel) {
    const dailyRetention = Math.pow(retention, 1 / prediction.spanDays);
    const crossIndex = midIndex + Math.log(diagnosis.definition.fatigueLevel / retention) / Math.log(dailyRetention);
    projection = { dailyRetention, crossIndex, valueAt: (i) => ctr.current * Math.pow(dailyRetention, i - midIndex) };
  }

  return {
    name: spec.name, id: spec.id, prediction, diagnosis, dailyMetrics, ctr, series, n, window, baselineDays,
    halfLevel, midIndex, projection,
    runStart: ctr.crossedIndex,
    run: ctr.consecutiveDaysBelow,
    requiredRun: diagnosis.definition.requiredRun,
  };
};

const COLOR = {
  line: '#2563eb',        // blue-600
  below: '#dc2626',       // red-600
  threshold: '#dc2626',
  baseline: '#4b5563',    // gray-600
  half: '#6b7280',        // gray-500
  ink: '#374151',         // gray-700
  muted: '#6b7280',
  baselineBand: '#f3f4f6',
  recentBand: '#eff6ff',
};

function WorkedDiagram({ example }) {
  const wrapRef = useRef(null);
  const measured = useWidth(wrapRef);
  const [hover, setHover] = useState(null);

  const { series, n, window, baselineDays, ctr, halfLevel, projection, prediction } = example;
  const width = Math.max(280, measured || 640);
  const narrow = width < 520;
  const height = narrow ? 300 : 340;
  const pad = { top: 40, right: 6, bottom: 50, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const lastIndex = Math.max(n - 1, projection ? projection.crossIndex : n - 1);
  const xMin = -0.5;
  const xMax = lastIndex + 0.7;
  const x = (i) => pad.left + ((i - xMin) / (xMax - xMin)) * plotW;
  const yMax = Math.max(...series, ctr.baseline) * 1.05;
  const yMin = Math.max(0, Math.min(halfLevel, ...series) - (yMax - halfLevel) * 0.24);
  const y = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const bottom = pad.top + plotH;
  const right = pad.left + plotW;

  // y ticks every 0.25 percentage points (0.5 when the range is wide)
  const step = (yMax - yMin) > 0.015 ? 0.005 : 0.0025;
  const ticks = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v);

  const linePath = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  let projectionPath = null;
  if (projection) {
    const points = [];
    const steps = 24;
    for (let k = 0; k <= steps; k++) {
      const i = example.midIndex + ((projection.crossIndex - example.midIndex) * k) / steps;
      points.push(`${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(projection.valueAt(i)).toFixed(1)}`);
    }
    projectionPath = points.join(' ');
  }

  const inRun = (i) => example.runStart !== null && i >= example.runStart;
  const text = { fontSize: 11, fill: COLOR.ink };
  const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' };
  const bandLabel = (from, to, line1, line2) => (
    <g>
      <text x={(x(from) + x(to)) / 2} y={14} textAnchor="middle" style={{ ...text, fontWeight: 600 }}>{line1}</text>
      <text x={(x(from) + x(to)) / 2} y={28} textAnchor="middle" style={{ ...text, fill: COLOR.muted }}>{line2}</text>
    </g>
  );

  const days = prediction.daysRemaining;
  const halfLifeLabel = days === 0 ? 'CTR half-life: already there' : `CTR half-life: about ${pluralDays(days)} away`;
  const summary = `Daily CTR for the sample creative ${example.name} over ${pluralDays(n)}. `
    + `The first ${pluralDays(baselineDays)} are the baseline window, averaging ${rate(ctr.baseline)}. `
    + `The last ${pluralDays(window)} are the recent window, averaging ${rate(ctr.current)}, which is ${pct(ctr.change)} against the baseline. `
    + `The threshold line sits at ${rate(ctr.thresholdValue)}, ${whole(ctr.threshold)} under the baseline. `
    + `${cap(pluralDays(example.run))} in a row, ending today, are below that line. `
    + (projection ? `A dashed projection continues the decline until CTR reaches half its baseline, ${rate(halfLevel)}, about ${pluralDays(days)} from today.` : '');

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(xMin + ((px - pad.left) / plotW) * (xMax - xMin));
    setHover(index >= 0 && index < n ? index : null);
  };

  const hovered = hover === null ? null : {
    index: hover,
    value: series[hover],
    left: Math.min(Math.max(x(hover), 76), width - 76),
    top: y(series[hover]),
    date: example.dailyMetrics[hover].metric_date,
  };

  return (
    <figure className="m-0">
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby="hiw-diagram-title hiw-diagram-desc"
          className="block max-w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <title id="hiw-diagram-title">How the CTR rule is applied to one creative</title>
          <desc id="hiw-diagram-desc">{summary}</desc>

          {/* the two windows */}
          <rect x={x(-0.5)} y={pad.top} width={x(baselineDays - 0.5) - x(-0.5)} height={plotH} fill={COLOR.baselineBand} />
          <rect x={x(baselineDays - 0.5)} y={pad.top} width={x(n - 0.5) - x(baselineDays - 0.5)} height={plotH} fill={COLOR.recentBand} />
          {bandLabel(-0.5, baselineDays - 0.5, narrow ? 'Baseline' : 'Baseline window', `${pluralDays(baselineDays)}, avg ${rate(ctr.baseline)}`)}
          {bandLabel(baselineDays - 0.5, n - 0.5, narrow ? 'Recent' : 'Recent window', `${pluralDays(window)}, avg ${rate(ctr.current)}`)}
          {projection && x(n - 0.5) < right - 50 && (
            <text x={(x(n - 0.5) + right) / 2} y={14} textAnchor="middle" style={{ ...text, fontWeight: 600 }}>Projection</text>
          )}

          {/* y axis */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={bottom} stroke="#d1d5db" />
          <line x1={pad.left} y1={bottom} x2={right} y2={bottom} stroke="#d1d5db" />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.left - 3} y1={y(v)} x2={pad.left} y2={y(v)} stroke="#9ca3af" />
              <text x={pad.left - 6} y={y(v) + 3.5} textAnchor="end" style={{ ...text, fontSize: 10, fill: COLOR.muted }}>{(v * 100).toFixed(2)}%</text>
            </g>
          ))}

          {/* reference levels */}
          <line x1={pad.left} y1={y(ctr.baseline)} x2={right} y2={y(ctr.baseline)} stroke={COLOR.baseline} strokeWidth={1.5} />
          <text x={right - 3} y={y(ctr.baseline) - 5} textAnchor="end" style={{ ...text, ...halo }}>
            {narrow ? 'Baseline' : 'Baseline average'} {rate(ctr.baseline)}
          </text>

          <line x1={pad.left} y1={y(ctr.thresholdValue)} x2={right} y2={y(ctr.thresholdValue)} stroke={COLOR.threshold} strokeWidth={1.5} strokeDasharray="6 4" />
          <text x={right - 3} y={y(ctr.thresholdValue) - 5} textAnchor="end" style={{ ...text, ...halo }}>
            {drop(ctr.threshold)} {narrow ? 'line' : 'threshold'} {rate(ctr.thresholdValue)}
          </text>

          <line x1={pad.left} y1={y(halfLevel)} x2={right} y2={y(halfLevel)} stroke={COLOR.half} strokeWidth={1.5} strokeDasharray="2 4" />
          <text x={pad.left + 5} y={y(halfLevel) - 5} style={{ ...text, ...halo }}>Half of baseline {rate(halfLevel)}</text>

          {/* recent window average */}
          <line x1={x(baselineDays - 0.5)} y1={y(ctr.current)} x2={x(n - 0.5)} y2={y(ctr.current)} stroke={COLOR.line} strokeWidth={1.5} strokeOpacity={0.45} />

          {/* projection */}
          {projectionPath && (
            <g>
              <path d={projectionPath} fill="none" stroke={COLOR.line} strokeWidth={2} strokeDasharray="6 5" />
              <circle cx={x(projection.crossIndex)} cy={y(halfLevel)} r={5} fill="#fff" stroke={COLOR.line} strokeWidth={2} />
              <text x={Math.min(right - 3, x(projection.crossIndex) + 8)} y={y(halfLevel) + 18} textAnchor="end" style={{ ...text, ...halo, fontWeight: 600 }}>
                {halfLifeLabel}
              </text>
            </g>
          )}

          {/* daily CTR */}
          <path d={linePath} fill="none" stroke={COLOR.line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {series.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} fill={inRun(i) ? COLOR.below : COLOR.line} stroke="#fff" strokeWidth={2} />
          ))}

          {/* x axis */}
          {[[0, 'Day 1'], [baselineDays - 1, `Day ${baselineDays}`], [n - 1, 'Today']]
            .filter(([i], k, all) => all.findIndex(([j]) => j === i) === k)
            .map(([i, label]) => (
              <text key={label} x={x(i)} y={bottom + 14} textAnchor="middle" style={{ ...text, fontSize: 10, fill: COLOR.muted }}>{label}</text>
            ))}

          {/* the consecutive run */}
          {example.runStart !== null && example.run > 0 && (
            <g>
              <rect x={x(example.runStart) - 7} y={bottom + 21} width={x(n - 1) - x(example.runStart) + 14} height={5} rx={2.5} fill={COLOR.below} />
              <text
                x={Math.min(Math.max((x(example.runStart) + x(n - 1)) / 2, 130), width - 130)}
                y={bottom + 41}
                textAnchor="middle"
                style={text}
              >
                {example.run} {example.run === 1 ? 'day' : 'days in a row'} under the threshold ({example.requiredRun} needed)
              </text>
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: hovered.left, top: hovered.top - 10 }}
          >
            <div className="text-gray-500">Day {hovered.index + 1}{hovered.date ? `, ${hovered.date}` : ''}</div>
            <div className="font-semibold text-gray-900">CTR {rate(hovered.value)}</div>
            <div className="text-gray-600">{pct((hovered.value - ctr.baseline) / ctr.baseline)} vs baseline</div>
          </div>
        )}
      </div>

      <figcaption className="mt-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <li className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={COLOR.line} strokeWidth="2" /><circle cx="11" cy="5" r="3.5" fill={COLOR.line} /></svg>
            Daily CTR
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="12" height="10" aria-hidden="true"><circle cx="6" cy="5" r="4" fill={COLOR.below} /></svg>
            Day under the threshold
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={COLOR.line} strokeWidth="1.5" strokeOpacity="0.45" /></svg>
            Recent window average
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={COLOR.line} strokeWidth="2" strokeDasharray="6 5" /></svg>
            Projection
          </li>
        </ul>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-blue-600 hover:text-blue-800 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Show these numbers as a table
          </summary>
          <table className="mt-2 w-full max-w-md text-left text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th scope="col" className="py-1 pr-2 font-medium">Day</th>
                <th scope="col" className="py-1 pr-2 font-medium">Window</th>
                <th scope="col" className="py-1 pr-2 font-medium">CTR</th>
                <th scope="col" className="py-1 font-medium">Vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {series.map((v, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 pr-2">{i + 1}</td>
                  <td className="py-1 pr-2">{i < baselineDays ? 'Baseline' : 'Recent'}</td>
                  <td className="py-1 pr-2 tabular-nums">{rate(v)}</td>
                  <td className="py-1 tabular-nums">
                    {pct((v - ctr.baseline) / ctr.baseline)}{inRun(i) ? ', under the threshold' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const NAV = [
  ['definition', 'Definition'],
  ['worked-example', 'Worked example'],
  ['signals', 'The four signals'],
  ['why', 'Why it declines'],
  ['patterns', 'Fatigue or something else'],
  ['projection', 'The projection'],
  ['limits', 'Limits'],
];

export default function HowItWorks({ onSelectCreative, isDemo = true }) {
  const state = useMemo(() => {
    try {
      return buildDemoState();
    } catch (error) {
      return null;
    }
  }, []);
  const creatives = state ? state.creatives : [];
  const patterns = useMemo(buildPatterns, []);
  const example = useMemo(
    () => buildExample(creatives.find((c) => c.spec.id === EXAMPLE_ID)
      || creatives.find((c) => c.diagnosis?.signals?.ctr.state === 'past' && c.prediction.daysRemaining > 0)),
    [creatives],
  );

  // Sample creatives only exist in the demo dataset; against a real backend their ids
  // would open someone else's creative, so the links are demo-only.
  const canOpen = Boolean(isDemo && onSelectCreative);
  const examplesFor = (code) => creatives.filter((c) => c.diagnosis?.pattern?.code === code);
  const exampleLinks = (list, prefix) => (canOpen && list.length > 0 ? (
    <div className="mt-2 flex flex-col items-start gap-1">
      {list.map((c) => <ExampleButton key={c.spec.id} creative={c} onSelectCreative={onSelectCreative} prefix={prefix} />)}
    </div>
  ) : null);

  const run = T.consecutiveDays;
  const caps = Object.entries(T.frequencyLimit);
  const capsOtherThanMeta = caps.filter(([key]) => key !== 'meta');

  const ladder = [
    {
      status: 'healthy',
      when: 'None of the conditions below.',
      detail: `All three metrics are less than halfway to their thresholds and frequency is under the cap. A healthy creative can still have a CTR half-life projection if its CTR is drifting down.`,
    },
    {
      status: 'warning',
      when: `Exactly one metric is past its threshold, or any metric's recent average is more than halfway to its threshold (${halfwayList}).`,
      detail: 'The halfway rule looks at the window average only. It does not wait for a run of days, so it fires early on purpose.',
    },
    {
      status: 'fatigued',
      when: `Two or more of CTR, CVR and ROAS are past their thresholds (${thresholdList}) and CTR is itself down at least ${whole(T.ctrDropPercent / 2)}, or frequency is over the platform cap.`,
      detail: 'CTR has to be part of it: a worn-out creative loses the click first. CVR and ROAS falling while CTR holds is a warning to look past the ad. Frequency over the cap is enough by itself.',
    },
  ];

  const signalRows = [
    {
      id: 'ctr',
      signal: <SignalName name="CTR" full="Click-through rate" />,
      measures: 'Clicks divided by impressions: of the people shown the ad, how many clicked.',
      threshold: <Threshold value={drop(T.ctrDropPercent)} note="vs own baseline" />,
      why: 'The cheapest metric to move, the noisiest, and the first to bend, so it gets the smallest drop and trips earliest.',
      alone: 'The ad is losing attention, but the people who still click buy as before. One metric is a Warning, not Fatigued.',
    },
    {
      id: 'cvr',
      signal: <SignalName name="CVR" full="Conversion rate" />,
      measures: 'Conversions divided by clicks: of the people who clicked, how many bought.',
      threshold: <Threshold value={drop(T.cvrDropPercent)} note="vs own baseline" />,
      why: 'It is contaminated by the landing page and the offer, which are not the creative, so it needs more evidence before it counts.',
      alone: 'Usually not the creative. The ad still earns the click; look after the click, at the landing page, price, stock or tracking.',
    },
    {
      id: 'roas',
      signal: <SignalName name="ROAS" full="Return on ad spend" />,
      measures: 'Revenue divided by spend.',
      threshold: <Threshold value={drop(T.roasDropPercent)} note="vs own baseline" />,
      why: 'It is the number a marketer has to defend, so a false alarm here is the most expensive. It gets the largest drop.',
      alone: 'Usually not the creative. If people click and convert as before, what changed is order value or the price of media (CPM).',
    },
    {
      id: 'frequency',
      signal: <SignalName name="Frequency" full="Impressions per person" />,
      measures: 'Average number of times each person reached has seen the ad since launch. It only goes up.',
      threshold: <Threshold value={`Over ${T.frequencyLimit.meta}`} note={`on Meta, averaged over the recent window`} />,
      why: 'It is a ceiling, not a drop, and it is set per platform because one impression is not the same amount of attention everywhere.',
      alone: 'The audience is saturated and the metrics have not bent yet. Frequency is the cause, so it can cross first.',
    },
  ];

  const patternRows = patterns.map(({ code, rule, pattern }) => ({
    id: code,
    pattern: (
      <div>
        <div className="font-medium text-gray-900">{pattern.label}</div>
        {exampleLinks(examplesFor(code), 'See')}
      </div>
    ),
    rule,
    creative: <CreativeProblemBadge pattern={pattern} />,
    action: pattern.action,
  }));

  const d = example ? example.diagnosis : null;
  const perClickExample = creatives.filter((c) => c.spec.buying === 'cpc' && c.diagnosis?.pattern?.code === 'click_erosion');

  const chain = [
    {
      title: 'Fixed audience, continued spend',
      body: 'The budget keeps buying impressions from the same pool of people.',
      role: 'Cause',
      sample: null,
    },
    {
      title: 'Frequency rises',
      body: 'Each person has now seen the ad more times.',
      role: 'Leads',
      sample: d && d.frequency.reported
        ? `${example.dailyMetrics[0].frequency.toFixed(1)} to ${d.frequency.latest.toFixed(1)} views per person`
        : null,
    },
    {
      title: 'Fewer people click',
      body: 'The people who were going to respond already have. Each repeat view is less likely to earn a click.',
      role: 'Leads',
      sample: d ? `CTR ${pct(d.signals.ctr.change)}` : null,
    },
    {
      title: 'Each click and conversion costs more',
      body: 'The same spend now buys fewer clicks, so cost per click and cost per conversion go up.',
      role: 'Lags',
      sample: d && d.cost.cpc.change !== null
        ? `CPC ${pct(d.cost.cpc.change)}${d.cost.cpa.change !== null ? `, CPA ${pct(d.cost.cpa.change)}` : ''}`
        : null,
    },
    {
      title: 'Return falls',
      body: 'Revenue per dollar spent drops. By the time this shows, the money is already spent.',
      role: 'Lags',
      sample: d ? `ROAS ${pct(d.signals.roas.change)}` : null,
    },
  ];
  const ROLE_BADGE = { Cause: 'bg-gray-100 text-gray-700', Leads: 'bg-blue-100 text-blue-800', Lags: 'bg-gray-200 text-gray-800' };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">How it works</h2>
        <p className="mt-1 text-sm text-gray-600 max-w-3xl">
          How fatigue is defined here, which signals are watched, and why the engine thinks a creative will decline.
          Every number on this page is read from the prediction engine, not typed in.
        </p>
        <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-2">
          {NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-700 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* 1. Definition */}
      <Section id="definition" title="The definition">
        <div className="max-w-3xl space-y-2 text-gray-800">
          <p>
            A creative is <strong>fatigued</strong> when at least two of CTR, CVR and ROAS have dropped past their
            thresholds ({thresholdList}) against the creative&apos;s own earlier performance and stayed there for {run} days
            in a row, with CTR among the metrics slipping, or when frequency is over the platform&apos;s cap.
          </p>
          <p>
            The comparison is always the creative against itself: the average of its most recent days against the
            average of everything before them, never an industry benchmark.
          </p>
        </div>

        <h3 className="mt-6 text-sm font-medium text-gray-500">The verdict ladder</h3>
        <ol className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          {ladder.map((step) => (
            <li key={step.status} className={`rounded-lg border border-gray-200 border-l-4 ${STATUS_EDGE[step.status]} p-4`}>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[step.status]}`}>
                {cap(step.status)}
              </span>
              <p className="mt-3 text-sm text-gray-900">{step.when}</p>
              <p className="mt-2 text-sm text-gray-600">{step.detail}</p>
            </li>
          ))}
        </ol>

        <dl className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="font-medium text-gray-900">What &quot;past its threshold&quot; means</dt>
            <dd className="mt-1 text-gray-600">
              Two things at once, checked separately for each metric: the recent average is down by more than the
              threshold, and each of the last {run} days was itself below the threshold level. A metric with a bad
              average but a good day yesterday does not count yet.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Which days are compared</dt>
            <dd className="mt-1 text-gray-600">
              The recent window is the last 7 days, or half the history if the creative has run for less than 14 days.
              The baseline is every day before that. With a short window the run needed is min({run}, window) days.
              Days with no impressions are skipped.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">When there is no verdict</dt>
            <dd className="mt-1 text-gray-600">
              With fewer than {T.minDataDays} days of delivery there is no baseline to compare against, so the status is{' '}
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE.unknown}`}>Unknown</span>{' '}
              rather than a guess.
            </dd>
          </div>
        </dl>
      </Section>

      {/* 2. Worked example */}
      {example && (
        <Section
          id="worked-example"
          title="A worked example"
          lead={`The CTR rule applied to one sample creative, ${example.name}. The chart is computed from that creative's ${pluralDays(example.n)} of data, the same data the engine scores.`}
        >
          <WorkedDiagram example={example} />

          <ol className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3 text-sm text-gray-700 list-decimal pl-5">
            <li>
              <strong className="text-gray-900">Baseline.</strong> The first {pluralDays(example.baselineDays)} average{' '}
              {rate(example.ctr.baseline)}. That is this creative&apos;s own normal.
            </li>
            <li>
              <strong className="text-gray-900">Recent window.</strong> With {pluralDays(example.n)} of history the window is{' '}
              {pluralDays(example.window)}. They average {rate(example.ctr.current)}, which is {pct(example.ctr.change)}{' '}
              against the baseline. The threshold is {drop(example.ctr.threshold)}.
            </li>
            <li>
              <strong className="text-gray-900">Persistence.</strong> {cap(pluralDays(example.run))} in a row, ending today,{' '}
              {example.run === 1 ? 'is' : 'are'} below {rate(example.ctr.thresholdValue)}; {example.requiredRun}{' '}
              {example.requiredRun === 1 ? 'is' : 'are'} needed. So CTR {example.ctr.state === 'past' ? 'counts as past its threshold' : 'does not count as past its threshold yet'}.
            </li>
            <li>
              <strong className="text-gray-900">Verdict.</strong>{' '}
              {d.failing.length > 0
                ? `${joinList(d.failing.map((key) => d.signals[key].label))} ${d.failing.length === 1 ? 'is' : 'are'} past threshold`
                : 'No metric is past its threshold'}{' '}
              ({d.definition.metricsPast} of 3, {d.definition.metricsNeeded} needed for Fatigued)
              {['cvr', 'roas'].filter((key) => !d.failing.includes(key)).map((key) => `, ${d.signals[key].label} is ${pct(d.signals[key].change)}`).join('')}
              {d.frequency.reported
                ? `, and frequency averages ${d.frequency.windowAvg.toFixed(1)} against a cap of ${d.frequency.limit}`
                : ', and this platform does not report frequency'}
              . The verdict is{' '}
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[example.prediction.status] || STATUS_BADGE.unknown}`}>
                {cap(example.prediction.status)}
              </span>.
            </li>
            {example.projection && (
              <li>
                <strong className="text-gray-900">Projection.</strong> Continuing at the rate between the two windows
                ({((1 - example.projection.dailyRetention) * 100).toFixed(1)}% a day), CTR reaches half its baseline,{' '}
                {rate(example.halfLevel)}, in about {pluralDays(example.prediction.daysRemaining)}. That is the CTR half-life.
                It is a separate number from the verdict.
              </li>
            )}
            <li>
              <strong className="text-gray-900">Diagnosis.</strong> {d.pattern.label}. {d.pattern.action}
            </li>
          </ol>
          {canOpen && (
            <div className="mt-4">
              <ExampleButton creative={{ spec: { id: example.id, name: example.name } }} onSelectCreative={onSelectCreative} prefix="Open" />
            </div>
          )}
        </Section>
      )}

      {/* 3. Signals */}
      <Section
        id="signals"
        title="The four signals"
        lead="Three metrics that show the effect, and one that shows the cause. The thresholds differ on purpose."
      >
        <ResponsiveTable
          caption="The four signals, their thresholds and what each means alone"
          columns={[
            { key: 'signal', label: 'Signal', span: 2 },
            { key: 'measures', label: 'What it measures', span: 3 },
            { key: 'threshold', label: 'Threshold', span: 2 },
            { key: 'why', label: 'Why that number', span: 2 },
            { key: 'alone', label: 'If only this one moves', span: 3 },
          ]}
          rows={signalRows}
        />
        <p className="mt-4 text-sm text-gray-600 max-w-3xl">
          Only Meta reports frequency to this product. For every other platform frequency is shown as not reported
          and the verdict rests on CTR, CVR and ROAS alone.
          {capsOtherThanMeta.length > 0 && (
            <> Caps are also set for {joinList(capsOtherThanMeta.map(([key, limit]) => `${platformName(key)} (${limit})`))},
              but they cannot fire until those platforms send frequency.</>
          )}
        </p>
      </Section>

      {/* 4. Why it declines */}
      <Section
        id="why"
        title="Why it declines"
        lead="Creative fatigue is one specific chain of cause and effect. The engine watches each link."
      >
        <ol className="flex flex-col md:flex-row md:items-stretch gap-2">
          {chain.map((link, i) => (
            <li key={link.title} className="flex flex-col md:flex-row md:items-stretch gap-2 md:flex-1 min-w-0">
              {i > 0 && (
                <span className="flex items-center justify-center text-gray-400" aria-hidden="true">
                  <ArrowDown className="md:hidden h-5 w-5" />
                  <ArrowRight className="hidden md:block h-5 w-5" />
                </span>
              )}
              <div className="flex-1 min-w-0 rounded-lg border border-gray-200 p-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[link.role]}`}>{link.role}</span>
                <div className="mt-2 text-sm font-medium text-gray-900">{link.title}</div>
                <p className="mt-1 text-sm text-gray-600">{link.body}</p>
                {link.sample && (
                  <p className="mt-2 text-xs text-gray-500">
                    In the sample: <span className="font-medium text-gray-800">{link.sample}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
        {example && (
          <p className="mt-2 text-xs text-gray-500">Sample figures are {example.name}, recent window against its baseline.</p>
        )}

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-gray-50 p-4">
            <h3 className="font-medium text-gray-900">What leads and what lags</h3>
            <p className="mt-1 text-gray-600">
              Frequency and CTR move first: frequency is the cause and CTR is its first visible effect. Cost per click,
              cost per conversion and ROAS follow. Waiting for ROAS means acting after the money is spent, which is why
              the CTR threshold is the tightest.
            </p>
            <p className="mt-2 text-gray-600">
              The cost step assumes media is paid for per impression. When it is paid for per click, spend falls with
              the clicks and ROAS can hold while CTR drops.
            </p>
            {exampleLinks(perClickExample, 'See')}
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <h3 className="font-medium text-gray-900">CVR is not a link in this chain</h3>
            <p className="mt-1 text-gray-700">
              A worn-out ad loses the click first. When only CVR falls and CTR holds, the ad is still doing its job and
              the cause is after the click: the landing page, the price, stock or tracking. Replacing the creative
              would not fix it.
            </p>
            {exampleLinks(examplesFor('post_click_problem'), 'See')}
          </div>
        </div>
      </Section>

      {/* 5. Patterns */}
      <Section
        id="patterns"
        title="Fatigue or something else"
        lead="The verdict says how far the numbers have moved. The diagnosis says what kind of problem it is, and whether a new creative would fix it. Rules are checked from the top and the first match wins."
      >
        <p className="mb-4 text-sm text-gray-600 max-w-3xl">
          &quot;More than halfway&quot; means the recent average has dropped by more than half the metric&apos;s threshold ({halfwayList}).
        </p>
        <ResponsiveTable
          caption="Diagnosis patterns, in the order the engine checks them"
          columns={[
            { key: 'pattern', label: 'Pattern', span: 3 },
            { key: 'rule', label: 'When it applies', span: 4 },
            { key: 'creative', label: 'Creative problem?', span: 2 },
            { key: 'action', label: 'What to do', span: 3 },
          ]}
          rows={patternRows}
        />
      </Section>

      {/* 6. Projection */}
      <Section id="projection" title="The projection: CTR half-life">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm text-gray-700">
          <div className="space-y-2">
            <p>
              The date shown next to a creative is its <strong>CTR half-life</strong>: the day its CTR is projected to
              reach {whole(0.5)} of its own baseline. It is this product&apos;s own yardstick for &quot;how long does this have
              left&quot;, not an industry standard.
            </p>
            <p>
              It is worked out by assuming CTR keeps shrinking by the same percentage every day (exponential decay) and
              extending that curve forward. It is anchored to the baseline, not to today: a creative already down 40%
              has only ten points left to fall. One that is already below half is dated today. Nothing is projected
              further than {T.maxHorizonDays} days out.
            </p>
            <p>
              The half-life is separate from the verdict. A creative can be Fatigued with no half-life, because
              frequency crossed its cap while CTR held, and Healthy with one, because CTR is drifting down slowly.
              When CTR is flat or rising there is nothing to extend and no date is shown.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">Why two rates can disagree</h3>
            <p>
              There are two fair ways to measure how fast CTR is falling. The engine&apos;s date uses the drop between the
              baseline average and the recent average, spread over the days between the two windows. The diagnosis
              also fits a trend line through the recent window only and projects from the latest level.
            </p>
            <p>
              When a decline started late or is speeding up, the recent trend is steeper and its date is sooner. When
              the decline is levelling off, it is later. When the two differ, the detail view shows both as a range
              rather than pretend to one exact day; when they round to the same day, it shows one.
            </p>
            {d && d.projection.engineDays !== null && d.projection.trendDays !== null && (
              <p className="rounded-lg bg-gray-50 p-3 text-gray-700">
                For {example.name}: window to window, about {pluralDays(d.projection.engineDays)}. Recent trend
                ({pct(d.signals.ctr.trendRatePerDay)} a day), about {pluralDays(d.projection.trendDays)}.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 7. Limits */}
      <Section id="limits" title="What this does not do yet">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm text-gray-700 list-disc pl-5">
          <li>
            <strong className="text-gray-900">The decay model is simple.</strong> Exponential decay against the
            creative&apos;s own baseline is easy to explain, but it is not a survival model and it does not separate out
            seasonality, weekdays or promotions.
          </li>
          <li>
            <strong className="text-gray-900">Thresholds are defaults, not fitted.</strong> {thresholdList}, a run of{' '}
            {run} days and the frequency caps are informed starting points, the same for every account and objective.
            They have not been learned from data.
          </li>
          <li>
            <strong className="text-gray-900">It does not grade itself.</strong> Projections are not yet compared with
            what happened afterwards, so there is no measured precision for the alerts.
          </li>
          <li>
            <strong className="text-gray-900">Frequency is only reported by Meta.</strong> On other platforms the cause
            cannot be observed, only its effects, so a CTR drop there cannot be confirmed as repeat exposure.
          </li>
          <li>
            <strong className="text-gray-900">A warning is not always about the creative.</strong> Fatigued needs CTR
            to be slipping, so a broken landing page or a more expensive auction cannot produce it. They do still raise
            a Warning, because something needs a human; the diagnosis says it is not the creative and the
            recommendation is to keep it.
          </li>
          <li>
            <strong className="text-gray-900">No significance gate on the verdict.</strong> The detail view shows how
            strong the evidence is that a metric moved by more than day-to-day noise, but weak evidence does not block
            a verdict. Low-volume creatives deserve a second look.
          </li>
          <li>
            <strong className="text-gray-900">Confidence is history length only.</strong> The confidence figure rises
            with the number of days of data. It says nothing about how well the curve fits.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function SignalName({ name, full }) {
  return (
    <div>
      <div className="font-medium text-gray-900">{name}</div>
      <div className="text-xs text-gray-500">{full}</div>
    </div>
  );
}

function Threshold({ value, note }) {
  return (
    <div>
      <div className="font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500">{note}</div>
    </div>
  );
}
