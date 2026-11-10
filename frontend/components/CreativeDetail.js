import { useEffect, useMemo, useRef, useState } from 'react';
import { FatiguePredictor } from '../../src/services/prediction.js';
import { fetchAPI } from '../lib/api';
import { pct, pluralDays, joinList } from '../lib/demoData';
import CreativePreview from './CreativePreview';
import { EvidenceCharts, ProjectionChart } from './detail/SignalCharts';
import {
  FORMATTERS, money, platformName, dayOf, shortDate, daysFrom, calendarDaysUntil,
} from './detail/format';

const predictor = new FatiguePredictor();
const { thresholds } = predictor;

const TRIAD = ['ctr', 'cvr', 'roas'];

const STATUS_LABEL = { healthy: 'Healthy', warning: 'Warning', fatigued: 'Fatigued', unknown: 'Not enough data' };

const statusPill = {
  healthy: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  fatigued: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};

const statusStrip = {
  healthy: 'bg-green-50 border-green-200 text-green-900',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  fatigued: 'bg-red-50 border-red-200 text-red-900',
  unknown: 'bg-gray-50 border-gray-200 text-gray-900',
};

const STATE = {
  past: { label: 'Past threshold', chip: 'border-red-200 bg-red-50', text: 'text-red-700' },
  bending: { label: 'Bending', chip: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-800' },
  holding: { label: 'Holding', chip: 'border-gray-200 bg-white', text: 'text-gray-600' },
  improving: { label: 'Improving', chip: 'border-green-200 bg-green-50', text: 'text-green-700' },
  neutral: { label: '', chip: 'border-gray-200 bg-gray-50', text: 'text-gray-500' },
};

const FORMAT_LABEL = {
  image: 'Static image',
  video: 'Vertical video',
  carousel: 'Carousel',
  text: 'Search text ad',
  display: 'Display banner',
};

const BUYING_LABEL = {
  cpm: 'CPM (pays per impression)',
  cpc: 'CPC (pays per click)',
};

// The z-score bands in diagnose(), in words.
const EVIDENCE = {
  strong: 'Strong evidence of a change: far outside day-to-day noise.',
  moderate: 'Moderate evidence of a change: outside day-to-day noise, but not by much.',
  weak: 'Weak evidence of a change: within day-to-day noise.',
  unknown: 'Too little data to tell a change from day-to-day noise.',
};

const percentOf = (fraction) => `${Math.round(fraction * 100)}%`;
const drop = (fraction) => `−${percentOf(fraction)}`;

// One sentence on how the rule produced today's verdict.
function verdictSentence(prediction, diagnosis, platform) {
  const { definition, signals, frequency } = diagnosis;
  const past = TRIAD.filter((k) => signals[k].state === 'past').map((k) => signals[k].label);
  const bending = TRIAD.filter((k) => signals[k].state === 'bending').map((k) => signals[k].label);
  const run = pluralDays(definition.requiredRun);

  if (prediction.status === 'fatigued') {
    if (past.length >= definition.metricsNeeded) {
      return `${joinList(past)} are past their thresholds for at least ${run} running. ${definition.metricsNeeded} or more metrics agreeing is the rule for fatigued.${frequency.isHigh ? ` Frequency is also over the ${platformName(platform)} cap of ${frequency.limit}.` : ''}`;
    }
    return `Frequency ${frequency.windowAvg.toFixed(1)} is over the ${platformName(platform)} cap of ${frequency.limit}. That alone makes the verdict fatigued${past.length ? `; ${joinList(past)} is also past its threshold.` : ', even though CTR, CVR and ROAS are within their thresholds.'}`;
  }
  if (prediction.status === 'warning') {
    if (past.length === 1) {
      return `Only ${past[0]} is past its threshold for ${run} running. One metric is a warning; ${definition.metricsNeeded} are needed for fatigued.`;
    }
    return `No metric is past its threshold for ${run} running, but ${joinList(bending)} ${bending.length === 1 ? 'is' : 'are'} more than halfway there.`;
  }
  return 'CTR, CVR and ROAS are all within half of their thresholds of this creative’s own baseline.';
}

// The verdict rule with this creative's numbers filled in.
function ruleEvaluated(prediction, diagnosis, platform) {
  const { definition, signals, frequency } = diagnosis;
  const parts = [`${definition.metricsPast} of ${TRIAD.length} metrics past threshold, ${definition.metricsNeeded} needed`];
  parts.push(frequency.reported
    ? `frequency ${frequency.windowAvg.toFixed(1)} ${frequency.isHigh ? 'over' : 'under'} the cap of ${frequency.limit}`
    : `frequency not reported by ${platformName(platform)}`);
  if (prediction.status === 'warning' && definition.metricsPast === 0) {
    const bending = TRIAD.filter((k) => signals[k].state === 'bending').map((k) => signals[k].label);
    if (bending.length) parts.push(`${joinList(bending)} more than halfway to ${bending.length === 1 ? 'its threshold' : 'their thresholds'}`);
  }
  return `${parts.join('; ')}, so: ${prediction.status}`;
}

// What a click or a conversion costs now, when that moved by 10% or more.
function moneyLines(cost) {
  const lines = [];
  const build = (metric, unit, units) => {
    const { baseline, current, change } = metric;
    if (change === null || baseline === null || current === null || Math.abs(change) < 0.1 || !(current > 0)) return;
    const bought = baseline / current - 1; // units per dollar, now vs before
    lines.push(`Each ${unit} now costs ${money(current)}, ${change > 0 ? 'up' : 'down'} from ${money(baseline)}: the same budget buys ${percentOf(Math.abs(bought))} ${bought < 0 ? 'fewer' : 'more'} ${units}.`);
  };
  build(cost.cpc, 'click', 'clicks');
  build(cost.cpa, 'conversion', 'conversions');
  return lines;
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h3 className="text-base font-semibold text-gray-900">{children}</h3>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SignalChip({ label, value, state, stateLabel, isLead }) {
  const s = STATE[state] || STATE.neutral;
  return (
    <div className={`rounded-lg border px-3 py-2 min-w-0 ${s.chip} ${isLead ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {isLead && <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 whitespace-nowrap">Moved first</span>}
      </div>
      <div className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</div>
      <div className={`text-xs font-medium ${s.text}`}>{stateLabel || s.label}</div>
    </div>
  );
}

function SpecList({ creative, diagnosis }) {
  const launched = shortDate(creative.launched_at);
  const flightEnd = shortDate(creative.flight_end);
  const spend = diagnosis?.cost?.spendPerDay?.current;
  const buying = typeof creative.buying_model === 'string'
    ? (BUYING_LABEL[creative.buying_model.toLowerCase()] || creative.buying_model)
    : null;
  const rows = [
    ['Format', FORMAT_LABEL[creative.format] || FORMAT_LABEL[creative.creative_type] || creative.format || creative.creative_type],
    ['Placement', creative.placement],
    ['Objective', creative.objective],
    ['Audience', creative.audience],
    ['Buying model', buying],
    ['Launched', launched && `${launched}${Number.isFinite(creative.days_live) ? `, ${pluralDays(creative.days_live)} live` : ''}`],
    ['Flight ends', flightEnd],
    ['Spend per day', typeof spend === 'number' && Number.isFinite(spend) ? `${money(spend)} (recent average)` : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
  if (!rows.length) return null;
  return (
    <dl className="mt-4 text-sm divide-y divide-gray-100 border-t border-gray-100">
      {rows.map(([term, value]) => (
        <div key={term} className="py-2 grid grid-cols-[6.5rem_1fr] gap-2">
          <dt className="text-gray-500">{term}</dt>
          <dd className="text-gray-900 min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SignalItem({ sig, run, moved }) {
  const fmt = FORMATTERS[sig.key];
  const below = sig.consecutiveDaysBelow;
  return (
    <li>
      <span className="font-medium text-gray-900">{sig.label}</span>
      {': '}{fmt(sig.baseline)} to {fmt(sig.current)}{' '}
      <span className={`font-medium ${moved ? (sig.state === 'past' ? 'text-red-600' : 'text-yellow-700') : 'text-gray-900'}`}>({pct(sig.change)})</span>
      {`. Threshold ${drop(sig.threshold)}`}
      {moved
        ? `; below it ${pluralDays(below)} running (${run} needed)${below > 0 && shortDate(sig.crossedDate) ? `, since ${shortDate(sig.crossedDate)}` : ''}. `
        : '. '}
      <span className="text-gray-500">{EVIDENCE[sig.evidence.level] || EVIDENCE.unknown}</span>
    </li>
  );
}

function Why({ prediction, diagnosis, platform }) {
  const { pattern, signals, frequency, cost, definition } = diagnosis;
  const triad = TRIAD.map((k) => signals[k]);
  const moved = triad.filter((s) => s.state === 'past' || s.state === 'bending');
  const held = triad.filter((s) => s.state !== 'past' && s.state !== 'bending');
  const cpmMoved = cost.cpm.change !== null && Math.abs(cost.cpm.change) >= 0.1;
  const cpmItem = cost.cpm.change === null ? null : (
    <li key="cpm">
      <span className="font-medium text-gray-900">CPM</span> (cost per 1,000 impressions): {money(cost.cpm.baseline)} to {money(cost.cpm.current)}{' '}
      <span className="font-medium text-gray-900">({pct(cost.cpm.change)})</span>.
    </li>
  );
  const slope = frequency.reported && frequency.slopePerDay !== null && Math.abs(frequency.slopePerDay) >= 0.005
    ? ` ${frequency.slopePerDay > 0 ? 'Rising' : 'Falling'} ${Math.abs(frequency.slopePerDay).toFixed(2)} per day${frequency.daysToCap !== null ? `, about ${pluralDays(frequency.daysToCap)} to the cap` : ''}.`
    : '';
  const freqItem = frequency.reported ? (
    <li key="frequency">
      <span className="font-medium text-gray-900">Frequency</span>: {frequency.windowAvg.toFixed(1)} average over the last {pluralDays(definition.window)}
      {frequency.latest !== null && frequency.latest.toFixed(1) !== frequency.windowAvg.toFixed(1) ? ` (${frequency.latest.toFixed(1)} on the latest day)` : ''},{' '}
      {frequency.isHigh
        ? <span className="font-medium text-red-600">over the cap of {frequency.limit}</span>
        : `under the cap of ${frequency.limit}`}
      {frequency.firstOverIndex !== null && shortDate(frequency.firstOverDate) ? `. First over the cap on ${shortDate(frequency.firstOverDate)}` : ''}.{slope}
    </li>
  ) : null;
  const movedItems = [
    ...moved.map((s) => <SignalItem key={s.key} sig={s} run={definition.requiredRun} moved />),
    frequency.isHigh ? freqItem : null,
    cpmMoved ? cpmItem : null,
  ].filter(Boolean);
  const heldItems = [
    ...held.map((s) => <SignalItem key={s.key} sig={s} run={definition.requiredRun} />),
    frequency.reported && !frequency.isHigh ? freqItem : null,
    !cpmMoved ? cpmItem : null,
  ].filter(Boolean);
  const lines = moneyLines(cost);

  return (
    <section aria-labelledby="detail-why">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Why</p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 id="detail-why" className="text-base font-semibold text-gray-900">{pattern.label}</h3>
        {pattern.isCreativeProblem === false && prediction.status !== 'healthy' && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white">Not a creative problem</span>
        )}
        {pattern.isCreativeProblem === true && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Creative problem</span>
        )}
      </div>
      <p className="text-sm text-gray-700">{pattern.cause}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1.5">What moved</h4>
          {movedItems.length
            ? <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">{movedItems}</ul>
            : <p className="text-sm text-gray-500">Nothing has moved more than halfway to its threshold.</p>}
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1.5">What held</h4>
          {heldItems.length
            ? <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">{heldItems}</ul>
            : <p className="text-sm text-gray-500">Nothing: every signal has moved.</p>}
          {!frequency.reported && (
            <p className="text-sm text-gray-500 mt-2">
              Frequency: not reported by {platformName(platform)}, so repeat exposure cannot be checked.
            </p>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 text-sm text-gray-700 border-l-2 border-gray-300 pl-3 space-y-1">
          {lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-blue-900">What to do</h4>
        <p className="text-sm text-blue-900 mt-0.5">{pattern.action}</p>
      </div>
    </section>
  );
}

function Projection({ creative, series, prediction, diagnosis, now }) {
  const proj = diagnosis.projection;
  const window = diagnosis.definition.window;
  const half = FORMATTERS.ctr(proj.level);
  const fatigued = prediction.status === 'fatigued';
  const flightEnd = creative.flight_end ? new Date(creative.flight_end) : null;
  const hasFlight = flightEnd && !Number.isNaN(flightEnd.getTime());
  const dateIn = (days) => shortDate(daysFrom(now, days));

  if (proj.engineDays === null) {
    return (
      <section aria-labelledby="detail-projection">
        <SectionTitle>
          <span id="detail-projection">Projection: when CTR reaches half its own baseline</span>
        </SectionTitle>
        <p className="text-sm text-gray-700">
          {proj.note} There is no CTR half-life date for this creative.
          {fatigued && ' That does not change the verdict: the creative is already fatigued by the rule, which does not depend on this date.'}
        </p>
      </section>
    );
  }

  let when;
  if (proj.maxDays === 0) {
    when = `CTR is already at or below half its own baseline (${half}).`;
  } else if (proj.trendDays === null || proj.trendDays === proj.engineDays) {
    when = `CTR reaches half its own baseline (${half}) in ${pluralDays(proj.engineDays)}, around ${dateIn(proj.engineDays)}, at the average rate since the baseline.`;
  } else {
    when = `CTR reaches half its own baseline (${half}) in ${proj.minDays} to ${pluralDays(proj.maxDays)} (${dateIn(proj.minDays)} to ${dateIn(proj.maxDays)}): ${proj.engineDays} at the average rate since the baseline, ${proj.trendDays} at the last ${pluralDays(window)}' trend. The chart draws the first.`;
  }

  let flight = null;
  if (hasFlight) {
    const left = calendarDaysUntil(now, flightEnd);
    const ends = `The flight ends ${shortDate(flightEnd)}${left > 0 ? ` (in ${pluralDays(left)})` : ''}`;
    if (proj.maxDays < left) flight = `${ends}: CTR is projected to reach half its baseline before the flight is over.`;
    else if (proj.minDays >= left) flight = `${ends}: the flight is over before CTR is projected to reach half its baseline.`;
    else flight = `${ends}, inside that range: CTR may or may not reach half its baseline before the flight is over.`;
  }

  return (
    <section aria-labelledby="detail-projection">
      <SectionTitle sub={`Half of baseline is where the engine stops projecting (${percentOf(diagnosis.definition.fatigueLevel)} of the baseline CTR). It is a projection of CTR only, not the verdict.`}>
        <span id="detail-projection">Projection: when CTR reaches half its own baseline</span>
      </SectionTitle>
      <ProjectionChart series={series} prediction={prediction} diagnosis={diagnosis} now={now} />
      <div className="text-sm text-gray-700 mt-2 space-y-1">
        <p>{when}</p>
        {flight && <p>{flight}</p>}
        {fatigued && <p className="font-medium text-red-700">This creative is already fatigued by the rule, regardless of this date.</p>}
      </div>
    </section>
  );
}

function Definition({ series, prediction, diagnosis, platform }) {
  const { definition, signals, frequency } = diagnosis;
  const n = series.length;
  const dateAt = (i) => {
    const d = series[i] ? dayOf(series[i]) : null;
    return d && !Number.isNaN(d.getTime()) ? shortDate(d) : null;
  };
  const range = (from, to) => (dateAt(from) && dateAt(to) ? ` (${dateAt(from)} to ${dateAt(to)})` : '');
  const recentStart = n - definition.window;
  const yes = <span className="text-red-600 font-semibold">Yes</span>;
  const no = <span className="text-gray-600">No</span>;

  return (
    <section aria-labelledby="detail-definition">
      <SectionTitle>
        <span id="detail-definition">How fatigue is defined, applied to this creative</span>
      </SectionTitle>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4 text-sm text-gray-700">
        <p>
          Each metric is compared with this creative&apos;s own past, not with other ads:
          the <span className="font-medium text-gray-900">last {pluralDays(definition.window)}</span>{range(recentStart, n - 1)} against
          the <span className="font-medium text-gray-900">{pluralDays(definition.baselineDays)} before</span>{range(0, recentStart - 1)}, its baseline.
          A metric is past its threshold when the recent average has dropped by more than the threshold and every one of
          the last {pluralDays(definition.requiredRun)} was below it.
          {definition.requiredRun < thresholds.consecutiveDays && ` (Normally ${pluralDays(thresholds.consecutiveDays)}; shortened because the history is short.)`}
        </p>

        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500">
                <th scope="col" className="px-2 sm:px-3 py-2">Metric</th>
                <th scope="col" className="hidden sm:table-cell px-2 sm:px-3 py-2">Baseline</th>
                <th scope="col" className="hidden sm:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">Last {definition.window}d</th>
                <th scope="col" className="px-2 sm:px-3 py-2">Change</th>
                <th scope="col" className="px-2 sm:px-3 py-2">Threshold</th>
                <th scope="col" className="px-2 sm:px-3 py-2">Days below</th>
                <th scope="col" className="px-2 sm:px-3 py-2">Past?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TRIAD.map((key) => {
                const sig = signals[key];
                const fmt = FORMATTERS[key];
                return (
                  <tr key={key}>
                    <th scope="row" className="px-2 sm:px-3 py-2 font-medium text-left text-gray-900">{sig.label}</th>
                    <td className="hidden sm:table-cell px-2 sm:px-3 py-2">{fmt(sig.baseline)}</td>
                    <td className="hidden sm:table-cell px-2 sm:px-3 py-2">{fmt(sig.current)}</td>
                    <td className={`px-2 sm:px-3 py-2 font-medium ${sig.change < -sig.threshold ? 'text-red-600' : 'text-gray-900'}`}>{pct(sig.change)}</td>
                    <td className="px-2 sm:px-3 py-2">{drop(definition.thresholds[key])}</td>
                    <td className="px-2 sm:px-3 py-2 whitespace-nowrap">{sig.consecutiveDaysBelow} of {definition.requiredRun}</td>
                    <td className="px-2 sm:px-3 py-2">{sig.state === 'past' ? yes : no}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row" className="px-2 sm:px-3 py-2 font-medium text-left text-gray-900">
                  Frequency
                  {!frequency.reported && <span className="block text-xs font-normal text-gray-500 whitespace-nowrap">Not reported</span>}
                </th>
                <td className="hidden sm:table-cell px-2 sm:px-3 py-2 text-gray-400">n/a</td>
                <td className="hidden sm:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">
                  {frequency.reported ? `${frequency.windowAvg.toFixed(1)} avg` : <span className="text-gray-400">n/a</span>}
                </td>
                <td className="px-2 sm:px-3 py-2 whitespace-nowrap">
                  {frequency.reported && <span className="sm:hidden font-medium text-gray-900">{frequency.windowAvg.toFixed(1)} avg</span>}
                  <span className={`${frequency.reported ? 'hidden sm:inline ' : ''}text-gray-400`}>n/a</span>
                </td>
                <td className="px-2 sm:px-3 py-2 whitespace-nowrap">cap {definition.frequencyLimit}</td>
                <td className="px-2 sm:px-3 py-2 text-gray-400">n/a</td>
                <td className="px-2 sm:px-3 py-2">
                  {!frequency.reported
                    ? <span className="text-gray-400">n/a</span>
                    : frequency.isHigh ? <span className="text-red-600 font-semibold whitespace-nowrap">Over<span className="hidden sm:inline"> cap</span></span> : no}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          <span className="font-medium text-gray-900">The rule, evaluated: </span>
          {ruleEvaluated(prediction, diagnosis, platform)}.
        </p>

        <ul className="space-y-1.5 list-disc pl-5">
          <li>
            <span className="font-medium text-gray-900">Fatigued</span>: {definition.metricsNeeded} or more of CTR, CVR and ROAS past
            their thresholds ({TRIAD.map((k) => drop(definition.thresholds[k])).join(', ')}), or frequency over
            the {platformName(platform)} cap of {definition.frequencyLimit}. Frequency is impressions per person since launch.
          </li>
          <li>
            <span className="font-medium text-gray-900">Warning</span>: exactly one metric past its threshold, or any metric more
            than halfway to it (CTR {drop(definition.thresholds.ctr / 2)}, CVR {drop(definition.thresholds.cvr / 2)}, ROAS {drop(definition.thresholds.roas / 2)}).
            It means prepare, not pause.
          </li>
          <li>
            <span className="font-medium text-gray-900">Healthy</span>: neither of the above.
          </li>
          <li>
            <span className="font-medium text-gray-900">Confidence {percentOf(prediction.confidence)}</span>: reflects days of history
            only ({pluralDays(definition.historyDays)} here). It does not measure how clear the decline is; the evidence levels above do that.
          </li>
        </ul>
      </div>
    </section>
  );
}

export default function CreativeDetail({ creativeId, onClose }) {
  const [creative, setCreative] = useState(null);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);

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

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous && typeof previous.focus === 'function') previous.focus(); };
  }, []);

  // Score the history in the browser with the same engine the API runs, so the panel
  // explains exactly the numbers it shows (and works the same against a real backend).
  const analysis = useMemo(() => {
    if (!Array.isArray(creative?.dailyMetrics)) return null;
    const now = new Date();
    // The API returns days newest first; normalizeMetrics sorts them oldest first.
    const series = predictor.normalizeMetrics(creative.dailyMetrics);
    const prediction = predictor.predict(creative.dailyMetrics, { platform: creative.platform, now });
    const diagnosis = predictor.diagnose(prediction, creative.dailyMetrics);
    return { now, series, prediction, diagnosis };
  }, [creative]);

  const p = analysis?.prediction;
  const d = analysis?.diagnosis;
  const scored = Boolean(p && d?.signals);
  const platform = creative?.platform;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-gray-900/50 sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="creative-detail-title"
        className="bg-white w-full sm:max-w-6xl sm:rounded-xl shadow-xl overflow-y-auto overflow-x-hidden max-h-full focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-start justify-between gap-4 z-20">
          <div className="min-w-0">
            <h2 id="creative-detail-title" className="text-lg font-semibold truncate">
              {creative?.name || (error ? 'Creative' : 'Loading...')}
            </h2>
            {creative && (
              <div className="text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                <span>{platformName(platform)}</span>
                {creative.campaign_name && <span aria-hidden="true">·</span>}
                {creative.campaign_name && <span>{creative.campaign_name}</span>}
                {p && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill[p.status] || statusPill.unknown}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5">
          {error && <p className="text-red-600 text-sm">Failed to load creative: {error}</p>}
          {!creative && !error && (
            <div className="flex items-center justify-center h-64" role="status" aria-label="Loading creative">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          )}

          {creative && (
            <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
              {/* What is the ad */}
              <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto mb-6 lg:mb-0" aria-label="The ad">
                <div className="max-w-sm mx-auto lg:max-w-none">
                  <CreativePreview creative={creative} />
                  <SpecList creative={creative} diagnosis={d} />
                </div>
              </aside>

              <div className="min-w-0 space-y-8">
                {p && !scored && (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${statusStrip.unknown}`}>
                    <div className="font-semibold mb-1">{d?.pattern?.label || STATUS_LABEL.unknown}</div>
                    <p>{d?.pattern?.cause || p.message}</p>
                    {d?.pattern?.action && <p className="mt-1">{d.pattern.action}</p>}
                  </div>
                )}

                {scored && (
                  <>
                    {/* Verdict and which signal */}
                    <section aria-label="Verdict">
                      <div className={`rounded-lg border px-4 py-3 text-sm ${statusStrip[p.status] || statusStrip.unknown}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-base font-semibold">{STATUS_LABEL[p.status] || p.status}</span>
                          <span className="text-xs opacity-80">verdict today</span>
                        </div>
                        <p>{verdictSentence(p, d, platform)}</p>
                      </div>
                      <div className={`grid grid-cols-2 gap-2 mt-3 ${d.lead === 'cpm' ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                        {TRIAD.map((key) => {
                          const sig = d.signals[key];
                          return (
                            <SignalChip key={key} label={sig.label} value={pct(sig.change)} state={sig.state} isLead={d.lead === key} />
                          );
                        })}
                        {d.frequency.reported ? (
                          <SignalChip
                            label={`Frequency, ${d.definition.window}d avg`}
                            value={d.frequency.windowAvg.toFixed(1)}
                            state={d.frequency.isHigh ? 'past' : 'holding'}
                            stateLabel={`${d.frequency.isHigh ? 'Over' : 'Under'} cap of ${d.frequency.limit}`}
                            isLead={d.lead === 'frequency'}
                          />
                        ) : (
                          <SignalChip label="Frequency" value="n/a" state="neutral" stateLabel="Not reported" />
                        )}
                        {d.lead === 'cpm' && d.cost.cpm.change !== null && (
                          <SignalChip label="CPM" value={pct(d.cost.cpm.change)} state="bending" stateLabel="Media cost up" isLead />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Change is the last {pluralDays(d.definition.window)} against the creative&apos;s own baseline.
                      </p>
                    </section>

                    <Why prediction={p} diagnosis={d} platform={platform} />

                    <section aria-labelledby="detail-evidence">
                      <SectionTitle sub="One chart per signal, same dates on every x axis. Scales are zoomed to the data, so they do not start at zero.">
                        <span id="detail-evidence">Evidence</span>
                      </SectionTitle>
                      <EvidenceCharts series={analysis.series} prediction={p} diagnosis={d} platform={platform} />
                    </section>

                    <Projection creative={creative} series={analysis.series} prediction={p} diagnosis={d} now={analysis.now} />

                    <Definition series={analysis.series} prediction={p} diagnosis={d} platform={platform} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
