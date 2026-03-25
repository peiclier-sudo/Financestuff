"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChallengeHistoryRow, loadChallengeHistory } from "@/lib/challengeDb";

interface Props {
  onClose: () => void;
}

interface TradeGroupTag {
  market?: string;
  edge?: string;
  execution?: string;
}

export default function ChallengeHistoryModal({ onClose }: Props) {
  const [rows, setRows] = useState<ChallengeHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTarget, setFilterTarget] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    loadChallengeHistory(filterTarget ?? undefined).then(({ data, error: err }) => {
      setRows(data);
      setError(err);
      setLoading(false);
    });
  }, [filterTarget]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Aggregate stats across all loaded challenges
  const agg = useMemo(() => {
    if (rows.length === 0) return null;

    const totalChallenges = rows.length;
    const totalTrades = rows.reduce((s, r) => s + r.total_trades, 0);
    const totalWins = rows.reduce((s, r) => s + r.winners, 0);
    const totalLosses = rows.reduce((s, r) => s + r.losers, 0);
    const totalPnl = rows.reduce((s, r) => s + r.total_pnl, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgPnlPerChallenge = totalPnl / totalChallenges;
    const totalGrossWin = rows.reduce((s, r) => s + (r.avg_win * r.winners), 0);
    const totalGrossLoss = rows.reduce((s, r) => s + Math.abs(r.avg_loss * r.losers), 0);
    const profitFactor = totalGrossLoss > 0 ? totalGrossWin / totalGrossLoss : totalGrossWin > 0 ? Infinity : 0;
    const avgWin = totalWins > 0 ? totalGrossWin / totalWins : 0;
    const avgLoss = totalLosses > 0 ? -(totalGrossLoss / totalLosses) : 0;
    const bestChallenge = Math.max(...rows.map((r) => r.total_pnl));
    const worstChallenge = Math.min(...rows.map((r) => r.total_pnl));

    // Breakdown by tags from trade_group_reviews
    const byMarket: Record<string, { wins: number; total: number; pnl: number }> = {};
    const byEdge: Record<string, { wins: number; total: number; pnl: number }> = {};
    const byExecution: Record<string, { wins: number; total: number; pnl: number }> = {};

    for (const row of rows) {
      const reviews = row.trade_group_reviews as TradeGroupTag[] | null;
      if (!Array.isArray(reviews)) continue;
      for (const review of reviews) {
        const tags = (review as { tags?: string[] }).tags ?? [];
        const trades = (review as { trades?: { pnlPoints: number }[] }).trades ?? [];
        const groupPnl = trades.reduce((s: number, t: { pnlPoints: number }) => s + t.pnlPoints, 0);
        const isWin = groupPnl > 0;

        // Parse tags
        let market: string | null = null;
        let edge: string | null = null;
        let execution: string | null = null;

        for (const tag of tags) {
          if (["range", "trend", "unclear"].includes(tag)) market = tag;
          else if (["fade", "breakout", "continuation", "reversal"].includes(tag)) edge = tag;
          else if (["added", "not_added"].includes(tag)) execution = tag;
        }

        if (market) {
          if (!byMarket[market]) byMarket[market] = { wins: 0, total: 0, pnl: 0 };
          byMarket[market].total++;
          if (isWin) byMarket[market].wins++;
          byMarket[market].pnl += groupPnl;
        }
        if (edge) {
          if (!byEdge[edge]) byEdge[edge] = { wins: 0, total: 0, pnl: 0 };
          byEdge[edge].total++;
          if (isWin) byEdge[edge].wins++;
          byEdge[edge].pnl += groupPnl;
        }
        if (execution) {
          if (!byExecution[execution]) byExecution[execution] = { wins: 0, total: 0, pnl: 0 };
          byExecution[execution].total++;
          if (isWin) byExecution[execution].wins++;
          byExecution[execution].pnl += groupPnl;
        }
      }
    }

    // Equity curve across challenges (cumulative PnL per challenge, chronological)
    const chronological = [...rows].reverse();
    const equityCurve: number[] = [0];
    let cumPnl = 0;
    for (const r of chronological) {
      cumPnl += r.total_pnl;
      equityCurve.push(cumPnl);
    }

    return {
      totalChallenges,
      totalTrades,
      totalWins,
      totalLosses,
      totalPnl,
      winRate,
      avgPnlPerChallenge,
      profitFactor,
      avgWin,
      avgLoss,
      bestChallenge,
      worstChallenge,
      byMarket,
      byEdge,
      byExecution,
      equityCurve,
    };
  }, [rows]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl mx-4 max-h-[85vh] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(18,22,30,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-display font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
            Challenge Performance
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[null, 15, 30].map((t) => (
                <button
                  key={String(t)}
                  onClick={() => setFilterTarget(t)}
                  className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: filterTarget === t ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${filterTarget === t ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                    color: filterTarget === t ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {t === null ? "All" : `Challenge ${t}`}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-[var(--text-dim)] hover:text-white transition-colors text-lg leading-none">&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Loading...</p>
            </div>
          )}

          {error && (
            <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(248,81,73,0.1)", color: "#f85149", border: "1px solid rgba(248,81,73,0.2)" }}>
              {error}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>No challenges recorded yet.</p>
              <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Complete a challenge and save it to see your stats here.</p>
            </div>
          )}

          {!loading && agg && (
            <>
              {/* Headline */}
              <div className="text-center">
                <div className="text-[28px] font-mono font-bold" style={{ color: agg.totalPnl >= 0 ? "#3fb950" : "#f85149" }}>
                  {agg.totalPnl >= 0 ? "+" : ""}${agg.totalPnl.toFixed(2)}
                </div>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {agg.totalChallenges} challenge{agg.totalChallenges !== 1 ? "s" : ""} — {agg.totalTrades} trades
                </p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Win Rate", value: `${agg.winRate.toFixed(0)}%`, color: agg.winRate >= 50 ? "#3fb950" : "#f85149" },
                  { label: "Profit Factor", value: agg.profitFactor === Infinity ? "∞" : agg.profitFactor.toFixed(2), color: "rgba(255,255,255,0.85)" },
                  { label: "Avg Win", value: `$${agg.avgWin.toFixed(1)}`, color: "#3fb950" },
                  { label: "Avg Loss", value: `$${agg.avgLoss.toFixed(1)}`, color: "#f85149" },
                  { label: "Avg / Challenge", value: `$${agg.avgPnlPerChallenge.toFixed(1)}`, color: agg.avgPnlPerChallenge >= 0 ? "#3fb950" : "#f85149" },
                  { label: "Best Challenge", value: `$${agg.bestChallenge.toFixed(1)}`, color: "#3fb950" },
                  { label: "Worst Challenge", value: `$${agg.worstChallenge.toFixed(1)}`, color: "#f85149" },
                  { label: "W / L", value: `${agg.totalWins} / ${agg.totalLosses}`, color: "rgba(255,255,255,0.85)" },
                ].map((s) => (
                  <div key={s.label} className="text-center py-2.5 rounded-md" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[13px] font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Equity curve */}
              {agg.equityCurve.length > 2 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Cumulative P&L
                  </label>
                  <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                    <EquityCurve data={agg.equityCurve} />
                  </div>
                </div>
              )}

              {/* Breakdowns */}
              <div className="grid grid-cols-2 gap-4">
                <BreakdownTable
                  title="By Market Condition"
                  data={agg.byMarket}
                  labelMap={{ range: "Range", trend: "Trend", unclear: "Unclear" }}
                />
                <BreakdownTable
                  title="By Edge"
                  data={agg.byEdge}
                  labelMap={{ fade: "Fade", breakout: "Breakout", continuation: "Continuation", reversal: "Reversal" }}
                />
              </div>
              <BreakdownTable
                title="By Execution"
                data={agg.byExecution}
                labelMap={{ added: "Added to Winner", not_added: "Not Added" }}
              />

              {/* Individual challenges */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  All Challenges
                </label>
                <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Date</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Inst.</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Target</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Trades</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Win%</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>PF</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <td className="px-3 py-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.5)" }}>{r.instrument ?? "—"}</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.5)" }}>{r.target}</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.6)" }}>{r.total_trades}</td>
                          <td className="text-right px-2 py-2" style={{ color: r.win_rate >= 50 ? "#3fb950" : "#f85149" }}>{r.win_rate.toFixed(0)}%</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {r.profit_factor === Infinity ? "∞" : r.profit_factor.toFixed(2)}
                          </td>
                          <td className="text-right px-3 py-2 font-semibold" style={{ color: r.total_pnl >= 0 ? "#3fb950" : "#f85149" }}>
                            {r.total_pnl >= 0 ? "+" : ""}${r.total_pnl.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

function BreakdownTable({ title, data, labelMap }: {
  title: string;
  data: Record<string, { wins: number; total: number; pnl: number }>;
  labelMap: Record<string, string>;
}) {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return null;

  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
        {title}
      </label>
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              <th className="text-left px-2.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}></th>
              <th className="text-right px-2 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>N</th>
              <th className="text-right px-2 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Win%</th>
              <th className="text-right px-2.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const { wins, total, pnl } = data[key];
              const wr = total > 0 ? (wins / total) * 100 : 0;
              return (
                <tr key={key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td className="px-2.5 py-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>{labelMap[key] ?? key}</td>
                  <td className="text-right px-2 py-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>{total}</td>
                  <td className="text-right px-2 py-1.5" style={{ color: wr >= 50 ? "#3fb950" : "#f85149" }}>{wr.toFixed(0)}%</td>
                  <td className="text-right px-2.5 py-1.5 font-semibold" style={{ color: pnl >= 0 ? "#3fb950" : "#f85149" }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EquityCurve({ data }: { data: number[] }) {
  const w = 400;
  const h = 60;
  const pad = 2;
  const mn = Math.min(0, ...data);
  const mx = Math.max(0, ...data);
  const rng = mx - mn || 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - mn) / rng) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  const zeroY = pad + (1 - (0 - mn) / rng) * (h - 2 * pad);
  const last = data[data.length - 1];
  const color = last >= 0 ? "#3fb950" : "#f85149";

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3,3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <polyline
        points={`${pad},${zeroY} ${pts} ${pad + ((data.length - 1) / (data.length - 1)) * (w - 2 * pad)},${zeroY}`}
        fill={`${color}15`}
        stroke="none"
      />
    </svg>
  );
}
