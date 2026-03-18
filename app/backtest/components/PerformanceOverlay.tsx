"use client";

import { useMemo } from "react";
import { ClosedTrade } from "@/lib/backtestTypes";

interface Props {
  trades: ClosedTrade[];
  onClose: () => void;
}

export default function PerformanceOverlay({ trades, onClose }: Props) {
  const stats = useMemo(() => computeStats(trades), [trades]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div
        className="w-[90vw] max-w-[1200px] h-[85vh] flex flex-col rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0c0f15, #12161e)",
          border: "1px solid var(--border)",
          borderTopColor: "rgba(192, 132, 252, 0.25)",
          boxShadow: "0 8px 64px rgba(0,0,0,0.6), 0 0 60px rgba(192, 132, 252, 0.05), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          background: "linear-gradient(180deg, rgba(192, 132, 252, 0.05) 0%, transparent 100%)",
          borderBottom: "1px solid var(--border)",
        }}>
          <div className="flex gap-1.5">
            <div className="w-[8px] h-[8px] rounded-full cursor-pointer hover:opacity-100" style={{ background: "rgba(255, 82, 82, 0.5)" }} onClick={onClose} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(255, 171, 64, 0.35)" }} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(0, 230, 118, 0.35)" }} />
          </div>
          <div className="w-px h-4 bg-[var(--border)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "rgba(192, 132, 252, 0.7)" }}>
            Performance Dashboard
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">{trades.length} trades</span>
          <button
            onClick={onClose}
            className="ml-auto text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] px-3 py-1 rounded transition-colors hover:bg-[var(--surface-hover)]"
          >
            ESC to close
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {trades.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
              No trades yet. Start trading to see performance data.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Key Metrics Row */}
              <div className="grid grid-cols-6 gap-3">
                <MetricCard label="Total P&L" value={`${stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(1)}`} color={stats.totalPnl >= 0 ? "var(--green)" : "var(--red)"} />
                <MetricCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 50 ? "var(--green)" : "var(--red)"} />
                <MetricCard label="Profit Factor" value={stats.profitFactor === Infinity ? "—" : stats.profitFactor.toFixed(2)} color={stats.profitFactor >= 1 ? "var(--green)" : "var(--red)"} />
                <MetricCard label="Avg Win" value={stats.avgWin > 0 ? `+${stats.avgWin.toFixed(1)}` : "—"} color="var(--green)" />
                <MetricCard label="Avg Loss" value={stats.avgLoss < 0 ? stats.avgLoss.toFixed(1) : "—"} color="var(--red)" />
                <MetricCard label="Expectancy" value={`${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy.toFixed(2)}`} color={stats.expectancy >= 0 ? "var(--green)" : "var(--red)"} />
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-6 gap-3">
                <MetricCard label="Total Trades" value={`${stats.totalTrades}`} color="var(--text)" />
                <MetricCard label="Winners" value={`${stats.winners}`} color="var(--green)" />
                <MetricCard label="Losers" value={`${stats.losers}`} color="var(--red)" />
                <MetricCard label="Best Trade" value={`+${stats.bestTrade.toFixed(1)}`} color="var(--green)" />
                <MetricCard label="Worst Trade" value={stats.worstTrade.toFixed(1)} color="var(--red)" />
                <MetricCard label="R:R Ratio" value={stats.avgWin > 0 && stats.avgLoss < 0 ? (stats.avgWin / Math.abs(stats.avgLoss)).toFixed(2) : "—"} color="var(--accent)" />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Large Equity Curve */}
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">Equity Curve</h3>
                  <LargeEquityCurve data={stats.equityCurve} />
                </div>

                {/* P&L Distribution */}
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">P&L Distribution</h3>
                  <PnlDistribution trades={trades} />
                </div>
              </div>

              {/* More Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Win/Loss Streak */}
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">Streaks & Drawdown</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <StatRow label="Max Win Streak" value={`${stats.maxWinStreak}`} color="var(--green)" />
                    <StatRow label="Max Loss Streak" value={`${stats.maxLoseStreak}`} color="var(--red)" />
                    <StatRow label="Max Drawdown" value={stats.maxDrawdown.toFixed(1)} color="var(--red)" />
                    <StatRow label="Max Runup" value={`+${stats.maxRunup.toFixed(1)}`} color="var(--green)" />
                    <StatRow label="Avg Trade" value={`${stats.avgTrade >= 0 ? "+" : ""}${stats.avgTrade.toFixed(2)}`} color={stats.avgTrade >= 0 ? "var(--green)" : "var(--red)"} />
                    <StatRow label="Median Trade" value={`${stats.medianTrade >= 0 ? "+" : ""}${stats.medianTrade.toFixed(2)}`} color={stats.medianTrade >= 0 ? "var(--green)" : "var(--red)"} />
                    <StatRow label="Std Dev" value={stats.stdDev.toFixed(2)} color="var(--text-secondary)" />
                    <StatRow label="Sharpe (approx)" value={stats.sharpe.toFixed(2)} color={stats.sharpe >= 0 ? "var(--green)" : "var(--red)"} />
                  </div>
                </div>

                {/* By Exit Reason */}
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">By Exit Reason</h3>
                  <div className="space-y-2">
                    {stats.byExitReason.map((r) => (
                      <div key={r.reason} className="flex items-center gap-3 text-[11px]">
                        <span className="text-[10px] font-semibold uppercase w-16 text-[var(--text-muted)]">{r.reason}</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${(r.count / stats.totalTrades) * 100}%`,
                            background: r.pnl >= 0 ? "var(--green)" : "var(--red)",
                            opacity: 0.6,
                          }} />
                        </div>
                        <span className="text-[10px] text-[var(--text-dim)] w-6 text-right">{r.count}</span>
                        <span className="text-[10px] font-mono font-semibold w-16 text-right" style={{ color: r.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                          {r.pnl >= 0 ? "+" : ""}{r.pnl.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mt-4 mb-3">By Direction</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <StatRow label="Long Trades" value={`${stats.longTrades}`} color="var(--green)" />
                    <StatRow label="Short Trades" value={`${stats.shortTrades}`} color="var(--red)" />
                    <StatRow label="Long P&L" value={`${stats.longPnl >= 0 ? "+" : ""}${stats.longPnl.toFixed(1)}`} color={stats.longPnl >= 0 ? "var(--green)" : "var(--red)"} />
                    <StatRow label="Short P&L" value={`${stats.shortPnl >= 0 ? "+" : ""}${stats.shortPnl.toFixed(1)}`} color={stats.shortPnl >= 0 ? "var(--green)" : "var(--red)"} />
                    <StatRow label="Long Win%" value={stats.longTrades > 0 ? `${stats.longWinRate.toFixed(0)}%` : "—"} color={stats.longWinRate >= 50 ? "var(--green)" : "var(--red)"} />
                    <StatRow label="Short Win%" value={stats.shortTrades > 0 ? `${stats.shortWinRate.toFixed(0)}%` : "—"} color={stats.shortWinRate >= 50 ? "var(--green)" : "var(--red)"} />
                  </div>
                </div>
              </div>

              {/* Trade-by-Trade Bars */}
              <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">Trade-by-Trade P&L</h3>
                <TradeByTradeBars trades={trades} />
              </div>

              {/* Full Trade Log */}
              <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-3">Full Trade Log</h3>
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-[var(--surface-2)]">
                        <th className="text-left py-1.5 px-3 font-semibold text-[var(--text-muted)]">#</th>
                        <th className="text-left py-1.5 px-3 font-semibold text-[var(--text-muted)]">Dir</th>
                        <th className="text-right py-1.5 px-3 font-semibold text-[var(--text-muted)]">Entry</th>
                        <th className="text-right py-1.5 px-3 font-semibold text-[var(--text-muted)]">Exit</th>
                        <th className="text-right py-1.5 px-3 font-semibold text-[var(--text-muted)]">P&L</th>
                        <th className="text-right py-1.5 px-3 font-semibold text-[var(--text-muted)]">Cum. P&L</th>
                        <th className="text-left py-1.5 px-3 font-semibold text-[var(--text-muted)]">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => {
                        const cumPnl = trades.slice(0, i + 1).reduce((s, tr) => s + tr.pnlPoints, 0);
                        return (
                          <tr key={t.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]">
                            <td className="py-1.5 px-3 text-[var(--text-dim)]">{i + 1}</td>
                            <td className="py-1.5 px-3">
                              <span className="font-bold" style={{ color: t.direction === "long" ? "var(--green)" : "var(--red)" }}>
                                {t.direction === "long" ? "LONG" : "SHORT"}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-[var(--text-secondary)]">{t.entryPrice.toFixed(1)}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[var(--text-secondary)]">{t.exitPrice.toFixed(1)}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold" style={{ color: t.pnlPoints >= 0 ? "var(--green)" : "var(--red)" }}>
                              {t.pnlPoints >= 0 ? "+" : ""}{t.pnlPoints.toFixed(1)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono" style={{ color: cumPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                              {cumPnl >= 0 ? "+" : ""}{cumPnl.toFixed(1)}
                            </td>
                            <td className="py-1.5 px-3 text-[9px] uppercase text-[var(--text-dim)]">{t.exitReason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-[8px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1">{label}</div>
      <div className="text-lg font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

function LargeEquityCurve({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="text-[var(--text-dim)] text-[10px] text-center py-8">Need at least 2 trades</div>;

  const w = 500;
  const h = 180;
  const pad = 4;

  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  const zeroY = pad + (1 - (0 - min) / range) * (h - 2 * pad);
  const lastValue = data[data.length - 1];
  const color = lastValue >= 0 ? "#3fb950" : "#f85149";

  // Y-axis labels
  const yLabels = [max, max * 0.5, 0, min * 0.5, min].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className="relative">
      <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((pct) => {
          const y = pad + pct * (h - 2 * pad);
          return <line key={pct} x1={pad} y1={y} x2={w - pad} y2={y} stroke="#161b22" strokeWidth="0.5" />;
        })}
        <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#21262d" strokeWidth="1" strokeDasharray="4,4" />
        {/* Fill */}
        <polyline
          points={`${pad},${zeroY} ${points} ${pad + (w - 2 * pad)},${zeroY}`}
          fill={`${color}10`}
          stroke="none"
        />
        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* End dot */}
        {data.length > 0 && (() => {
          const lastX = pad + ((data.length - 1) / (data.length - 1)) * (w - 2 * pad);
          const lastY = pad + (1 - (lastValue - min) / range) * (h - 2 * pad);
          return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
        })()}
      </svg>
      {/* Y labels */}
      <div className="absolute top-0 right-0 h-full flex flex-col justify-between py-1 text-[8px] font-mono text-[var(--text-dim)]">
        <span>{max.toFixed(0)}</span>
        <span>0</span>
        <span>{min.toFixed(0)}</span>
      </div>
    </div>
  );
}

function PnlDistribution({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length < 2) return <div className="text-[var(--text-dim)] text-[10px] text-center py-8">Need at least 2 trades</div>;

  const pnls = trades.map((t) => t.pnlPoints);
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);
  const range = max - min || 1;

  // Create histogram buckets
  const bucketCount = Math.min(20, Math.max(5, Math.ceil(trades.length / 2)));
  const bucketSize = range / bucketCount;
  const buckets: { from: number; to: number; count: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const from = min + i * bucketSize;
    const to = from + bucketSize;
    buckets.push({ from, to, count: 0 });
  }
  for (const p of pnls) {
    const idx = Math.min(Math.floor((p - min) / bucketSize), bucketCount - 1);
    buckets[idx].count++;
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));
  const w = 500;
  const h = 150;
  const barW = (w - 8) / bucketCount;

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {buckets.map((b, i) => {
        const barH = maxCount > 0 ? (b.count / maxCount) * (h - 20) : 0;
        const x = 4 + i * barW;
        const midPrice = (b.from + b.to) / 2;
        const color = midPrice >= 0 ? "#3fb950" : "#f85149";
        return (
          <rect
            key={i}
            x={x + 1}
            y={h - 10 - barH}
            width={Math.max(barW - 2, 1)}
            height={barH}
            fill={color}
            opacity={0.5}
            rx={1}
          />
        );
      })}
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line
          x1={4 + ((0 - min) / range) * (w - 8)}
          y1={4}
          x2={4 + ((0 - min) / range) * (w - 8)}
          y2={h - 10}
          stroke="#ffffff30"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      )}
      {/* X labels */}
      <text x={4} y={h - 1} fill="#3d4560" fontSize="7" fontFamily="monospace">{min.toFixed(0)}</text>
      <text x={w - 4} y={h - 1} fill="#3d4560" fontSize="7" fontFamily="monospace" textAnchor="end">{max.toFixed(0)}</text>
      {min < 0 && max > 0 && (
        <text x={4 + ((0 - min) / range) * (w - 8)} y={h - 1} fill="#7d8590" fontSize="7" fontFamily="monospace" textAnchor="middle">0</text>
      )}
    </svg>
  );
}

function TradeByTradeBars({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length === 0) return null;

  const w = 900;
  const h = 80;
  const maxAbs = Math.max(...trades.map((t) => Math.abs(t.pnlPoints)), 1);
  const barW = Math.max((w - 4) / trades.length - 1, 2);

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#21262d" strokeWidth="0.5" />
      {trades.map((t, i) => {
        const barH = (Math.abs(t.pnlPoints) / maxAbs) * (h / 2 - 4);
        const x = 2 + i * ((w - 4) / trades.length);
        const y = t.pnlPoints >= 0 ? h / 2 - barH : h / 2;
        const color = t.pnlPoints >= 0 ? "#3fb950" : "#f85149";
        return (
          <rect key={t.id} x={x} y={y} width={barW} height={barH} fill={color} opacity={0.6} rx={0.5} />
        );
      })}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════
// Stats computation
// ══════════════════════════════════════════════════════════

interface Stats {
  totalTrades: number;
  totalPnl: number;
  winners: number;
  losers: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  avgTrade: number;
  medianTrade: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  maxRunup: number;
  maxWinStreak: number;
  maxLoseStreak: number;
  stdDev: number;
  sharpe: number;
  equityCurve: number[];
  longTrades: number;
  shortTrades: number;
  longPnl: number;
  shortPnl: number;
  longWinRate: number;
  shortWinRate: number;
  byExitReason: { reason: string; count: number; pnl: number }[];
}

function computeStats(trades: ClosedTrade[]): Stats {
  const n = trades.length;
  if (n === 0) {
    return {
      totalTrades: 0, totalPnl: 0, winners: 0, losers: 0, winRate: 0,
      avgWin: 0, avgLoss: 0, avgTrade: 0, medianTrade: 0, bestTrade: 0, worstTrade: 0,
      profitFactor: 0, expectancy: 0, maxDrawdown: 0, maxRunup: 0,
      maxWinStreak: 0, maxLoseStreak: 0, stdDev: 0, sharpe: 0,
      equityCurve: [], longTrades: 0, shortTrades: 0, longPnl: 0, shortPnl: 0,
      longWinRate: 0, shortWinRate: 0, byExitReason: [],
    };
  }

  const pnls = trades.map((t) => t.pnlPoints);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);
  const winTrades = trades.filter((t) => t.pnlPoints > 0);
  const loseTrades = trades.filter((t) => t.pnlPoints < 0);
  const winners = winTrades.length;
  const losers = loseTrades.length;

  const grossWin = winTrades.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(loseTrades.reduce((s, t) => s + t.pnlPoints, 0));

  const avgWin = winners > 0 ? grossWin / winners : 0;
  const avgLoss = losers > 0 ? -grossLoss / losers : 0;

  const sorted = [...pnls].sort((a, b) => a - b);
  const medianTrade = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Equity curve, drawdown, runup
  const equityCurve: number[] = [];
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let maxRU = 0;
  let trough = 0;
  for (const p of pnls) {
    cum += p;
    equityCurve.push(cum);
    if (cum > peak) peak = cum;
    if (cum < trough) trough = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    const ru = cum - trough;
    if (ru > maxRU) maxRU = ru;
  }

  // Streaks
  let winStreak = 0, loseStreak = 0, maxWS = 0, maxLS = 0;
  for (const p of pnls) {
    if (p > 0) { winStreak++; loseStreak = 0; }
    else if (p < 0) { loseStreak++; winStreak = 0; }
    if (winStreak > maxWS) maxWS = winStreak;
    if (loseStreak > maxLS) maxLS = loseStreak;
  }

  // Std dev & Sharpe
  const mean = totalPnl / n;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? mean / stdDev : 0;

  // By direction
  const longs = trades.filter((t) => t.direction === "long");
  const shorts = trades.filter((t) => t.direction === "short");
  const longWins = longs.filter((t) => t.pnlPoints > 0).length;
  const shortWins = shorts.filter((t) => t.pnlPoints > 0).length;

  // By exit reason
  const reasonMap = new Map<string, { count: number; pnl: number }>();
  for (const t of trades) {
    const r = reasonMap.get(t.exitReason) || { count: 0, pnl: 0 };
    r.count++;
    r.pnl += t.pnlPoints;
    reasonMap.set(t.exitReason, r);
  }
  const byExitReason = Array.from(reasonMap.entries())
    .map(([reason, d]) => ({ reason, ...d }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTrades: n,
    totalPnl,
    winners,
    losers,
    winRate: (winners / n) * 100,
    avgWin,
    avgLoss,
    avgTrade: mean,
    medianTrade,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: mean,
    maxDrawdown: maxDD,
    maxRunup: maxRU,
    maxWinStreak: maxWS,
    maxLoseStreak: maxLS,
    stdDev,
    sharpe,
    equityCurve,
    longTrades: longs.length,
    shortTrades: shorts.length,
    longPnl: longs.reduce((s, t) => s + t.pnlPoints, 0),
    shortPnl: shorts.reduce((s, t) => s + t.pnlPoints, 0),
    longWinRate: longs.length > 0 ? (longWins / longs.length) * 100 : 0,
    shortWinRate: shorts.length > 0 ? (shortWins / shorts.length) * 100 : 0,
    byExitReason,
  };
}
