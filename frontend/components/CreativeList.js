import { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api';
import { pct } from '../lib/demoData';
import { CreativeThumb } from './CreativePreview';

const PLATFORM_LABEL = { google: 'Google', meta: 'Meta', tiktok: 'TikTok', pinterest: 'Pinterest', linkedin: 'LinkedIn' };
const STATUS_LABEL = { healthy: 'Healthy', warning: 'Warning', fatigued: 'Fatigued', unknown: 'Unknown' };
const STATUS_ORDER = { fatigued: 0, warning: 1, healthy: 2 };
const FORMAT_LABEL = { image: 'Static image', video: 'Video', carousel: 'Carousel', text: 'Search text ad', display: 'Display banner' };
const RECOMMENDATION_LABEL = { keep: 'Keep running', rotate: 'Rotate', pause: 'Pause' };

const HALF_LIFE_DEFINITION = 'CTR half-life: the day this creative\'s CTR is projected to reach half of its own baseline, if the current trend continues. It is a projection, separate from the status: a creative can be fatigued with no CTR decline, or healthy with a distant half-life.';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// DECIMAL columns arrive from a real backend as strings.
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const Dash = ({ title }) => <span className="text-gray-400" title={title}>-</span>;

// Fatigued, then warning, then healthy; within a group the soonest CTR half-life first.
const sortRows = (rows) => [...rows].sort((a, b) => {
  const rank = (r) => STATUS_ORDER[r.prediction_status ?? r.status] ?? 3;
  const days = (r) => (isNum(num(r.days_remaining)) ? num(r.days_remaining) : Infinity);
  return (rank(a) - rank(b)) || (days(a) - days(b));
});

// Daily CTR as a small line, with the creative's own baseline as a dashed tick line.
function CtrSparkline({ series, baseline, failing }) {
  const values = Array.isArray(series) ? series.map(Number).filter(Number.isFinite) : [];
  if (values.length < 2) return <Dash />;
  const W = 80;
  const H = 30;
  const PAD = 3;
  const base = isNum(num(baseline)) ? num(baseline) : null;
  // One relative scale for every row (baseline -50% to +25%, widened only if the data
  // goes beyond it), so the same height means the same relative change in each row and a
  // flat creative looks flat.
  const ref = base ?? values[0];
  const lo = Math.min(ref * 0.5, ...values);
  const hi = Math.max(ref * 1.25, ...values);
  const span = hi - lo || 1;
  const x = (i) => PAD + (i / (values.length - 1)) * (W - PAD * 2 - 2);
  const y = (v) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const stroke = failing ? '#dc2626' : '#2563eb';
  const label = `CTR over ${values.length} days, latest ${(last * 100).toFixed(2)}%`
    + (base === null ? '' : `, baseline ${(base * 100).toFixed(2)}%`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block">
      <title>{label}</title>
      {base !== null && (
        <line x1="0" x2={W} y1={y(base)} y2={y(base)} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="2.5" fill={stroke} />
    </svg>
  );
}

export default function CreativeList({ onSelectCreative, onShowMethod }) {
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState({ platform: '', status: '' });
  // Result of the last pause / rotate, shown above the table until dismissed.
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    fetchCreatives();
  }, [filter]);

  const fetchCreatives = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.platform) params.set('platform', filter.platform);
      if (filter.status) params.set('status', filter.status);

      const data = await fetchAPI(`/api/creatives?${params}`);
      setCreatives(data.data || []);
    } catch (error) {
      console.error('Failed to fetch creatives:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (creative) => {
    if (!confirm(`Pause "${creative.name}"? This will stop the ad on ${PLATFORM_LABEL[creative.platform] || creative.platform}.`)) return;
    setActionLoading(creative.id);
    try {
      const result = await fetchAPI(`/api/creatives/${creative.id}/pause`, { method: 'POST' });
      setNotice({ type: 'success', text: result.message || 'Creative paused successfully' });
      fetchCreatives();
    } catch (error) {
      setNotice({ type: 'error', text: `Failed to pause: ${error.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRotate = async (creative) => {
    if (!confirm(`Mark "${creative.name}" for rotation? This will pause it and flag it for a new creative.`)) return;
    setActionLoading(creative.id);
    try {
      const result = await fetchAPI(`/api/creatives/${creative.id}/rotate`, { method: 'POST' });
      setNotice({ type: 'success', text: result.message || 'Creative marked for rotation' });
      fetchCreatives();
    } catch (error) {
      setNotice({ type: 'error', text: `Failed to rotate: ${error.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      fatigued: 'bg-red-100 text-red-800',
      unknown: 'bg-gray-100 text-gray-800',
    };
    return `inline-block px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.unknown}`;
  };

  const changeCell = (creative, key) => {
    const value = num(creative[`${key}_change`]);
    if (!isNum(value)) return <Dash />;
    const failing = Array.isArray(creative.failing_metrics) && creative.failing_metrics.includes(key);
    return (
      <span
        className={failing ? 'font-semibold text-red-600' : 'text-gray-700'}
        title={failing ? 'Past its threshold for the required number of days' : undefined}
      >
        {pct(value)}
      </span>
    );
  };

  const frequencyCell = (creative) => {
    if (creative.frequency === undefined) return <Dash />;
    const value = num(creative.frequency);
    if (!isNum(value)) {
      return <Dash title={`${PLATFORM_LABEL[creative.platform] || 'This platform'} does not report frequency`} />;
    }
    const limit = num(creative.frequency_limit);
    const over = isNum(limit) && value > limit;
    return (
      <span className={over ? 'font-semibold text-red-600' : 'text-gray-700'} title={over ? 'Over the platform cap' : undefined}>
        {value.toFixed(1)}
        {isNum(limit) && <span className={over ? '' : 'text-gray-500'}> of {limit}</span>}
      </span>
    );
  };

  const halfLifeCell = (creative, status) => {
    const days = num(creative.days_remaining);
    if (isNum(days)) {
      if (days <= 0) return <span className="font-medium text-red-600">reached</span>;
      const tone = days <= 3 ? 'text-red-600' : days <= 7 ? 'text-yellow-700' : 'text-gray-700';
      return <span className={`font-medium ${tone}`}>in {days} {days === 1 ? 'day' : 'days'}</span>;
    }
    if (!status || status === 'unknown') return <Dash />;
    return <span className="text-gray-500">no CTR decline</span>;
  };

  const th = 'px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap';
  const thNum = 'px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap';
  const COLS = 11;
  const rows = sortRows(creatives);

  return (
    <div className="bg-white rounded-xl shadow-sm min-w-0">
      {/* Filters */}
      <div className="px-4 sm:px-6 py-4 border-b flex flex-wrap items-center gap-3 sm:gap-4">
        <select
          aria-label="Filter by platform"
          value={filter.platform}
          onChange={(e) => setFilter({ ...filter, platform: e.target.value })}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All platforms</option>
          <option value="google">Google</option>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
        </select>
        <select
          aria-label="Filter by status"
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All statuses</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="fatigued">Fatigued</option>
        </select>
        <p className="text-sm text-gray-500 sm:ml-auto">
          Changes compare the recent window with each creative's own baseline. Red means past its threshold.{' '}
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

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`mx-4 sm:mx-6 my-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-medium underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            Dismiss
          </button>
        </div>
      )}

      <p className="sm:hidden px-4 pt-3 text-xs text-gray-500">Scroll the table sideways for the metrics and actions.</p>

      {/* Table: scrolls sideways inside this container on narrow screens */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Creatives table">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${th} pl-4 sm:pl-6`}>Creative</th>
              <th className={th}>Platform</th>
              <th className={th}>Status and reason</th>
              <th className={th} title="Daily CTR since launch. The dashed line is the creative's own baseline.">CTR trend</th>
              <th className={thNum} title="CTR change, recent window vs own baseline">CTR</th>
              <th className={thNum} title="CVR change, recent window vs own baseline">CVR</th>
              <th className={thNum} title="ROAS change, recent window vs own baseline">ROAS</th>
              <th className={thNum} title="Average impressions per person since launch, against the platform cap. Only Meta reports it.">Frequency</th>
              <th className={thNum}>Spend / day</th>
              <th className={th} title={HALF_LIFE_DEFINITION}>
                <abbr title={HALF_LIFE_DEFINITION} className="no-underline cursor-help border-b border-dotted border-gray-400">CTR half-life</abbr>
              </th>
              <th className={`${th} pr-4 sm:pr-6`}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={COLS} className="px-6 py-8 text-center">Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-6 py-8 text-center text-gray-500">
                  {filter.platform || filter.status ? (
                    <>
                      No creatives match these filters.{' '}
                      <button type="button" className="text-blue-600 underline" onClick={() => setFilter({ platform: '', status: '' })}>Clear filters</button>
                    </>
                  ) : 'No creatives found. Add an ad account to get started.'}
                </td>
              </tr>
            ) : (
              rows.map((creative) => {
                const status = creative.prediction_status ?? creative.status;
                const recommendation = creative.recommendation || 'keep';
                const notCreative = creative.is_creative_problem === false && status !== 'healthy' && status !== 'unknown' && Boolean(status);
                const subline = [FORMAT_LABEL[creative.format] || FORMAT_LABEL[creative.creative_type], creative.placement]
                  .filter(Boolean).join(' · ') || creative.headline;
                const spend = num(creative.spend_per_day);
                const ctrFailing = Array.isArray(creative.failing_metrics) && creative.failing_metrics.includes('ctr');
                return (
                  <tr
                    key={creative.id}
                    onClick={() => onSelectCreative?.(creative.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelectCreative?.(creative.id);
                      }
                    }}
                    tabIndex={0}
                    title="See the ad and why it got this status"
                    className="hover:bg-gray-50 cursor-pointer focus:outline-none focus-visible:bg-blue-50"
                  >
                    <td className="pl-4 pr-2 sm:pl-6 py-3">
                      <div className="flex items-center gap-3">
                        <CreativeThumb creative={creative} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 whitespace-nowrap">{creative.name || creative.creative_id}</div>
                          {subline && <div className="text-xs text-gray-500 whitespace-nowrap">{subline}</div>}
                          <span className={`sm:hidden mt-1 ${getStatusBadge(status)}`}>{STATUS_LABEL[status] || status || 'Unknown'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">{PLATFORM_LABEL[creative.platform] || creative.platform || <Dash />}</td>
                    <td className="px-2 py-3 max-w-[190px]">
                      <span className={getStatusBadge(status)}>{STATUS_LABEL[status] || status || 'Unknown'}</span>
                      {creative.pattern_label && status !== 'healthy' && (
                        <div className="mt-1 text-xs text-gray-600 leading-snug">{creative.pattern_label}</div>
                      )}
                      {creative.pattern_label && status === 'healthy' && creative.pattern_label !== STATUS_LABEL.healthy && (
                        <div className="mt-1 text-xs text-gray-500 leading-snug">{creative.pattern_label}</div>
                      )}
                      {notCreative && (
                        <span className="mt-1 inline-block px-1.5 py-0.5 rounded-sm bg-gray-100 border border-gray-300 text-[11px] font-medium text-gray-700">
                          Not the creative
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <CtrSparkline series={creative.ctr_series} baseline={creative.ctr_baseline} failing={ctrFailing} />
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{changeCell(creative, 'ctr')}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{changeCell(creative, 'cvr')}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{changeCell(creative, 'roas')}</td>
                    <td className="px-2 py-3 text-right tabular-nums whitespace-nowrap">{frequencyCell(creative)}</td>
                    <td className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                      {isNum(spend) ? `$${Math.round(spend).toLocaleString('en-US')}` : <Dash />}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">{halfLifeCell(creative, status)}</td>
                    <td className="pl-2 pr-4 sm:pr-6 py-3">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {notCreative ? (
                          <button
                            type="button"
                            onClick={() => onSelectCreative?.(creative.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-sm hover:bg-gray-200 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            title="The diagnosis says replacing this creative would not fix the decline"
                          >
                            See why
                          </button>
                        ) : recommendation === 'keep' ? (
                          <span className="text-xs text-gray-500 whitespace-nowrap">{RECOMMENDATION_LABEL.keep}</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRotate(creative)}
                              disabled={actionLoading === creative.id}
                              className={`px-2.5 py-1 text-xs font-medium rounded-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                recommendation === 'rotate' ? 'bg-orange-100 text-orange-800 hover:bg-orange-200' : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                              }`}
                              title={recommendation === 'rotate' ? 'Recommended by the engine' : undefined}
                            >
                              {actionLoading === creative.id ? '...' : 'Rotate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePause(creative)}
                              disabled={actionLoading === creative.id}
                              className={`px-2.5 py-1 text-xs font-medium rounded-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                recommendation === 'pause' ? 'bg-red-100 text-red-800 hover:bg-red-200' : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                              }`}
                              title={recommendation === 'pause' ? 'Recommended by the engine' : undefined}
                            >
                              {actionLoading === creative.id ? '...' : 'Pause'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
