import { format } from 'date-fns';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { pct, pluralDays } from '../lib/demoData';
import { FatiguePredictor } from '../../src/services/prediction.js';
import { CreativeThumb } from './CreativePreview';

const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok', pinterest: 'Pinterest', linkedin: 'LinkedIn' };
const STATUS_LABEL = { healthy: 'Healthy', warning: 'Warning', fatigued: 'Fatigued', unknown: 'Unknown' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const dollars = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const wholePct = (fraction) => `${Math.round(fraction * 100)}%`;

// The verdict rule, written from the engine's own thresholds so the copy cannot drift.
const { thresholds } = new FatiguePredictor();
const VERDICT_RULE = `Fatigued means at least two of CTR, CVR and ROAS are down more than ${wholePct(thresholds.ctrDropPercent)}, ${wholePct(thresholds.cvrDropPercent)} and ${wholePct(thresholds.roasDropPercent)} against the creative's own baseline for ${thresholds.consecutiveDays} days running with CTR among those slipping, or frequency is over the platform cap; warning means a metric is past its threshold or more than halfway there.`;

// The signal that moved first and how far, e.g. "CTR −31%", "Frequency 6.5 of 5", "CPM +25%".
const leadSignal = (creative) => {
  const lead = creative.lead_signal;
  if (!lead) return null;
  if (lead === 'frequency') {
    const value = num(creative.frequency);
    if (!isNum(value)) return null;
    const limit = num(creative.frequency_limit);
    return `Frequency ${value.toFixed(1)}${isNum(limit) ? ` of ${limit}` : ''}`;
  }
  const change = num(creative[`${lead}_change`]);
  return isNum(change) ? `${lead.toUpperCase()} ${pct(change)}` : null;
};

const AXIS_TICK = { fontSize: 11, fill: '#6b7280' };

function TrendTooltip({ active, payload, label, name, formatValue }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{name}: {formatValue(payload[0].value)}</div>
    </div>
  );
}

export default function Dashboard({ stats, onSelectCreative, onShowMethod }) {
  if (!stats) return null;

  const statusColors = {
    healthy: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    fatigued: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-800',
  };

  const platformColors = {
    google: 'bg-blue-100 text-blue-800',
    meta: 'bg-indigo-100 text-indigo-800',
    tiktok: 'bg-pink-100 text-pink-800',
  };

  const countOf = (status) => Number(stats.statusStats?.find((s) => s.status === status)?.count || 0);
  const fatiguedCount = countOf('fatigued');
  const warningCount = countOf('warning');

  const dailySpend = num(stats.dailySpend);
  const dailySpendAtRisk = num(stats.dailySpendAtRisk);
  const hasSpend = isNum(dailySpend) && isNum(dailySpendAtRisk);
  const spendShare = hasSpend && dailySpend > 0 ? Math.min(1, dailySpendAtRisk / dailySpend) : 0;

  const hasNeedsAction = Array.isArray(stats.needsAction);
  const needsAction = hasNeedsAction ? stats.needsAction : (stats.upcomingFatigue || []);

  const trend = (stats.weeklyTrend || []).map((day) => {
    const impressions = Number(day.impressions) || 0;
    const clicks = Number(day.clicks) || 0;
    const ctr = day.ctr !== undefined && day.ctr !== null ? Number(day.ctr) : (impressions > 0 ? clicks / impressions : null);
    const date = new Date(day.date);
    return {
      label: Number.isNaN(date.getTime()) ? '' : format(date, 'MMM d'),
      ctrPct: isNum(ctr) ? ctr * 100 : null,
      spend: day.spend === undefined || day.spend === null ? null : Number(day.spend),
      impressions,
    };
  });
  const hasTrendSpend = trend.some((d) => isNum(d.spend));
  const ctrValues = trend.map((d) => d.ctrPct).filter(isNum);
  // Evenly spaced, round CTR ticks that hug the data so a small move is visible.
  let ctrTicks = [0, 1];
  if (ctrValues.length) {
    const lo = Math.min(...ctrValues);
    const hi = Math.max(...ctrValues);
    const rough = ((hi - lo) || hi * 0.1 || 0.1) / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rough);
    const first = Math.max(0, Math.floor(lo / step) * step);
    const last = Math.ceil(hi / step) * step;
    ctrTicks = [];
    for (let v = first; v <= last + step / 2; v += step) ctrTicks.push(Number(v.toFixed(6)));
  }
  const ctrDomain = [ctrTicks[0], ctrTicks[ctrTicks.length - 1]];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Creative status</h3>
          <div className="space-y-2">
            {stats.statusStats?.map((stat) => (
              <div key={stat.status} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[stat.status] || statusColors.unknown}`}>
                  {STATUS_LABEL[stat.status] || stat.status || 'Unknown'}
                </span>
                <span className="text-lg font-semibold">{stat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {hasSpend ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Daily spend needing a decision</h3>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-bold text-gray-900">{dollars(dailySpendAtRisk)}</span>
              <span className="text-sm text-gray-500">of {dollars(dailySpend)} per day</span>
            </div>
            <div
              className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(spendShare * 100)}
              aria-label="Share of daily spend on creatives with a warning or fatigued status"
            >
              <div className="h-full rounded-full bg-yellow-500" style={{ width: `${spendShare * 100}%` }} />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {wholePct(spendShare)} of spend is on creatives with a warning or fatigued status.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">By platform</h3>
            <div className="space-y-2">
              {stats.platformStats?.map((stat) => (
                <div key={stat.platform} className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${platformColors[stat.platform] || 'bg-gray-100'}`}>
                    {PLATFORM_LABEL[stat.platform] || stat.platform}
                  </span>
                  <span className="text-lg font-semibold">{stat.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Alerts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Today's alerts</h3>
          <div className={`text-4xl font-bold ${Number(stats.todayAlerts) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.todayAlerts ?? 0}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors.fatigued}`}>{fatiguedCount} fatigued</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors.warning}`}>{warningCount} warning</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Last 7 days</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-2xl font-bold">
                {((stats.weeklyTrend?.reduce((sum, d) => sum + Number(d.impressions), 0) || 0) / 1000000).toFixed(1)}M
              </div>
              <div className="text-xs text-gray-500">Impressions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {(stats.weeklyTrend?.reduce((sum, d) => sum + Number(d.clicks), 0) || 0).toLocaleString('en-US')}
              </div>
              <div className="text-xs text-gray-500">Clicks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Needs action */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Needs action</h2>
          <p className="text-sm text-gray-500 mt-1">
            {hasNeedsAction
              ? `Every creative with a fatigued or warning status today. ${VERDICT_RULE}`
              : `Creatives whose CTR is projected to reach half its own baseline within 7 days. ${VERDICT_RULE}`}
            {' '}Select one to see the ad and the evidence.{' '}
            {onShowMethod && (
              <button
                type="button"
                onClick={onShowMethod}
                className="text-blue-600 hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                How is this defined?
              </button>
            )}
          </p>
        </div>
        <div className="divide-y">
          {needsAction.length > 0 ? (
            needsAction.map((creative) => {
              const status = creative.status ?? creative.prediction_status;
              const lead = leadSignal(creative);
              const spend = num(creative.spend_per_day);
              const days = num(creative.days_remaining);
              const notCreative = creative.is_creative_problem === false && (status === 'warning' || status === 'fatigued');
              const where = [PLATFORM_LABEL[creative.platform] || creative.platform, creative.adgroup_name || creative.campaign_name]
                .filter(Boolean).join(' · ');
              return (
                <button
                  type="button"
                  key={creative.id}
                  onClick={() => onSelectCreative?.(creative.id)}
                  className="w-full text-left px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <CreativeThumb creative={creative} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{creative.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || statusColors.unknown}`}>
                          {STATUS_LABEL[status] || status || 'Unknown'}
                        </span>
                      </div>
                      {where && <div className="text-sm text-gray-500">{where}</div>}
                      {creative.pattern_label && (
                        <div className="mt-1 text-sm text-gray-700">
                          {creative.pattern_label}
                          {notCreative && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded-sm bg-gray-100 border border-gray-300 text-[11px] font-medium text-gray-700 align-middle">
                              Not the creative
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 pl-15 sm:pl-0 sm:text-right text-sm">
                    {lead && <div className="font-semibold text-gray-900 tabular-nums">{lead}</div>}
                    {isNum(spend) && <div className="text-gray-500 tabular-nums">{dollars(spend)} per day</div>}
                    {isNum(days) && (
                      <div className="text-gray-500">
                        {days <= 0 ? 'CTR already below half its baseline' : `CTR half-life in ${pluralDays(days)}`}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No creatives need action today.
            </div>
          )}
        </div>
      </div>

      {/* Performance Trend */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
        <h2 className="text-lg font-semibold">7-day portfolio trend</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">All creatives combined, per day.</p>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-500">No daily metrics synced yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <figure className="m-0 min-w-0">
              <figcaption className="text-sm font-medium text-gray-700 mb-2">Portfolio CTR</figcaption>
              <div
                className="h-48"
                role="img"
                aria-label={`Portfolio CTR per day: ${trend.filter((d) => isNum(d.ctrPct)).map((d) => `${d.label} ${d.ctrPct.toFixed(2)}%`).join(', ')}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d1d5db' }} />
                    <YAxis
                      domain={ctrDomain}
                      ticks={ctrTicks}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v) => `${v.toFixed(2)}%`}
                    />
                    <Tooltip content={<TrendTooltip name="CTR" formatValue={(v) => `${Number(v).toFixed(2)}%`} />} />
                    <Line
                      type="monotone"
                      dataKey="ctrPct"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#2563eb', stroke: '#fff', strokeWidth: 1 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="text-sm font-medium text-gray-700 mb-2">
                {hasTrendSpend ? 'Spend per day' : 'Impressions per day'}
              </figcaption>
              <div
                className="h-48"
                role="img"
                aria-label={hasTrendSpend
                  ? `Spend per day: ${trend.filter((d) => isNum(d.spend)).map((d) => `${d.label} ${dollars(d.spend)}`).join(', ')}`
                  : `Impressions per day: ${trend.map((d) => `${d.label} ${d.impressions.toLocaleString('en-US')}`).join(', ')}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d1d5db' }} />
                    <YAxis
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v) => (hasTrendSpend
                        ? (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`)
                        : (v >= 1000 ? `${Math.round(v / 1000)}k` : v))}
                    />
                    <Tooltip
                      cursor={{ fill: '#f3f4f6' }}
                      content={(
                        <TrendTooltip
                          name={hasTrendSpend ? 'Spend' : 'Impressions'}
                          formatValue={(v) => (hasTrendSpend ? dollars(Number(v)) : Number(v).toLocaleString('en-US'))}
                        />
                      )}
                    />
                    <Bar
                      dataKey={hasTrendSpend ? 'spend' : 'impressions'}
                      fill="#60a5fa"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          </div>
        )}
      </div>
    </div>
  );
}
