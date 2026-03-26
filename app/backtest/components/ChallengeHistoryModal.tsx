"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChallengeHistoryRow, loadChallengeHistory } from "@/lib/challengeDb";

interface Props {
  onClose: () => void;
}

type View = "overview" | "detail";

// Parse trade group reviews from the jsonb blob
interface ParsedTradeGroup {
  pnl: number;
  isWin: boolean;
  market: string | null;
  edge: string | null;
  execution: string | null;
  comment: string;
  entryTime: number;
  exitTime: number;
  tradeCount: number;
}

function parseTradeGroups(raw: unknown): ParsedTradeGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g) => {
    const trades = (g.trades ?? []) as { pnlPoints: number; entryTime: number; exitTime: number }[];
    const pnl = trades.reduce((s, t) => s + t.pnlPoints, 0);
    const tags: string[] = g.tags ?? [];
    let market: string | null = null;
    let edge: string | null = null;
    let execution: string | null = null;
    for (const tag of tags) {
      if (["range", "trend", "unclear"].includes(tag)) market = tag;
      else if (["fade", "breakout", "continuation", "reversal"].includes(tag)) edge = tag;
      else if (["added", "not_added"].includes(tag)) execution = tag;
    }
    return {
      pnl,
      isWin: pnl > 0,
      market,
      edge,
      execution,
      comment: g.idea ?? "",
      entryTime: trades.length > 0 ? Math.min(...trades.map((t) => t.entryTime)) : 0,
      exitTime: g.exitTime ?? 0,
      tradeCount: trades.length,
    };
  });
}

const MARKET_LABELS: Record<string, string> = { range: "Range", trend: "Trend", unclear: "Unclear" };
const EDGE_LABELS: Record<string, string> = { fade: "Fade", breakout: "Breakout", continuation: "Continuation", reversal: "Reversal" };
const EXEC_LABELS: Record<string, string> = { added: "Added to Winner", not_added: "Not Added" };

export default function ChallengeHistoryModal({ onClose }: Props) {
  const [allRows, setAllRows] = useState<ChallengeHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTarget, setFilterTarget] = useState<number | null>(null);
  const [filterInstrument, setFilterInstrument] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    loadChallengeHistory().then(({ data, error: err }) => {
      setAllRows(data);
      setError(err);
      setLoading(false);
    });
  }, []);

  // Extract unique instruments and targets from data
  const instruments = useMemo(() =>
    [...new Set(allRows.map((r) => r.instrument).filter(Boolean))].sort() as string[],
    [allRows]
  );
  const targets = useMemo(() =>
    [...new Set(allRows.map((r) => r.target))].sort((a, b) => a - b),
    [allRows]
  );

  // Client-side filtered rows
  const rows = useMemo(() =>
    allRows.filter((r) => {
      if (filterTarget && r.target !== filterTarget) return false;
      if (filterInstrument && r.instrument !== filterInstrument) return false;
      return true;
    }),
    [allRows, filterTarget, filterInstrument]
  );

  // Segment cards: every instrument × target combo
  const segments = useMemo(() => {
    const map = new Map<string, ChallengeHistoryRow[]>();
    for (const r of allRows) {
      const key = `${r.instrument ?? "Unknown"}|${r.target}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].map(([key, segRows]) => {
      const [inst, target] = key.split("|");
      const pnl = segRows.reduce((s, r) => s + r.total_pnl, 0);
      const trades = segRows.reduce((s, r) => s + r.total_trades, 0);
      const wins = segRows.reduce((s, r) => s + r.winners, 0);
      const winRate = trades > 0 ? (wins / trades) * 100 : 0;
      const profitablePct = segRows.length > 0 ? (segRows.filter((r) => r.total_pnl > 0).length / segRows.length) * 100 : 0;
      return { inst, target: Number(target), count: segRows.length, pnl, trades, winRate, profitablePct };
    }).sort((a, b) => a.inst.localeCompare(b.inst) || a.target - b.target);
  }, [allRows]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "detail") { setView("overview"); setSelectedId(null); }
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, view]);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  // All trade groups across all challenges (for global breakdowns)
  const allTradeGroups = useMemo(() => {
    const groups: ParsedTradeGroup[] = [];
    for (const row of rows) {
      groups.push(...parseTradeGroups(row.trade_group_reviews));
    }
    return groups;
  }, [rows]);

  // Aggregate stats
  const agg = useMemo(() => {
    if (rows.length === 0) return null;

    const n = rows.length;
    const totalTrades = rows.reduce((s, r) => s + r.total_trades, 0);
    const totalWins = rows.reduce((s, r) => s + r.winners, 0);
    const totalLosses = rows.reduce((s, r) => s + r.losers, 0);
    const totalPnl = rows.reduce((s, r) => s + r.total_pnl, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgPnlPerChallenge = totalPnl / n;
    const totalGrossWin = rows.reduce((s, r) => s + (r.avg_win * r.winners), 0);
    const totalGrossLoss = rows.reduce((s, r) => s + Math.abs(r.avg_loss * r.losers), 0);
    const profitFactor = totalGrossLoss > 0 ? totalGrossWin / totalGrossLoss : totalGrossWin > 0 ? Infinity : 0;
    const avgWin = totalWins > 0 ? totalGrossWin / totalWins : 0;
    const avgLoss = totalLosses > 0 ? -(totalGrossLoss / totalLosses) : 0;
    const bestChallenge = Math.max(...rows.map((r) => r.total_pnl));
    const worstChallenge = Math.min(...rows.map((r) => r.total_pnl));

    // Win streak / loss streak
    const chronological = [...rows].reverse();
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const r of chronological) {
      if (r.total_pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
      else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
    }

    // Equity curve
    const equityCurve: number[] = [0];
    let cumPnl = 0;
    for (const r of chronological) {
      cumPnl += r.total_pnl;
      equityCurve.push(cumPnl);
    }

    // P&L per challenge (for bar chart)
    const pnlBars = chronological.map((r) => r.total_pnl);

    // Profitable challenges %
    const profitableChallenges = rows.filter((r) => r.total_pnl > 0).length;
    const profitablePct = (profitableChallenges / n) * 100;

    return {
      n, totalTrades, totalWins, totalLosses, totalPnl, winRate,
      avgPnlPerChallenge, profitFactor, avgWin, avgLoss,
      bestChallenge, worstChallenge,
      maxWinStreak, maxLossStreak,
      equityCurve, pnlBars,
      profitableChallenges, profitablePct,
    };
  }, [rows]);

  // Breakdowns from trade groups
  const breakdowns = useMemo(() => {
    const build = (keyFn: (g: ParsedTradeGroup) => string | null) => {
      const map: Record<string, { wins: number; total: number; pnl: number; avgPnl: number }> = {};
      for (const g of allTradeGroups) {
        const key = keyFn(g);
        if (!key) continue;
        if (!map[key]) map[key] = { wins: 0, total: 0, pnl: 0, avgPnl: 0 };
        map[key].total++;
        if (g.isWin) map[key].wins++;
        map[key].pnl += g.pnl;
      }
      for (const key of Object.keys(map)) {
        map[key].avgPnl = map[key].total > 0 ? map[key].pnl / map[key].total : 0;
      }
      return map;
    };

    const byHour = (g: ParsedTradeGroup) => {
      if (!g.entryTime) return null;
      const h = new Date(g.entryTime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", hour12: false, timeZone: "America/New_York" });
      return h + ":00";
    };

    return {
      byMarket: build((g) => g.market),
      byEdge: build((g) => g.edge),
      byExecution: build((g) => g.execution),
      byHour: build(byHour),
    };
  }, [allTradeGroups]);

  // Detail view: parse selected challenge's trade groups
  const detailGroups = useMemo(() => {
    if (!selectedRow) return [];
    return parseTradeGroups(selectedRow.trade_group_reviews);
  }, [selectedRow]);

  const detailEquity = useMemo(() => {
    const pts: number[] = [0];
    let cum = 0;
    for (const g of detailGroups) { cum += g.pnl; pts.push(cum); }
    return pts;
  }, [detailGroups]);

  const openDetail = (id: string) => { setSelectedId(id); setView("detail"); };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl mx-4 max-h-[90vh] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(14,17,24,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            {view === "detail" && (
              <button
                onClick={() => { setView("overview"); setSelectedId(null); }}
                className="text-[10px] transition-colors hover:text-white"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                &larr;
              </button>
            )}
            <h2 className="text-[13px] font-display font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
              {view === "overview" ? "Performance Dashboard" : "Challenge Detail"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {view === "overview" && (
              <div className="flex items-center gap-2">
                {/* Target filter */}
                <div className="flex gap-1">
                  {[null, ...targets].map((t) => (
                    <button
                      key={String(t)}
                      onClick={() => setFilterTarget(t)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-all"
                      style={{
                        background: filterTarget === t ? "rgba(255,255,255,0.12)" : "transparent",
                        border: `1px solid ${filterTarget === t ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                        color: filterTarget === t ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {t === null ? "All" : `${t} Trades`}
                    </button>
                  ))}
                </div>
                {/* Instrument filter */}
                {instruments.length > 0 && (
                  <>
                    <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.1)" }} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setFilterInstrument(null)}
                        className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: filterInstrument === null ? "rgba(255,255,255,0.12)" : "transparent",
                          border: `1px solid ${filterInstrument === null ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                          color: filterInstrument === null ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                        }}
                      >
                        All
                      </button>
                      {instruments.map((inst) => (
                        <button
                          key={inst}
                          onClick={() => setFilterInstrument(inst)}
                          className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-all"
                          style={{
                            background: filterInstrument === inst ? "rgba(255,255,255,0.12)" : "transparent",
                            border: `1px solid ${filterInstrument === inst ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                            color: filterInstrument === inst ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                          }}
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={onClose} className="text-[var(--text-dim)] hover:text-white transition-colors text-lg leading-none">&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Loading performance data...</p>
            </div>
          )}

          {error && (
            <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(248,81,73,0.1)", color: "#f85149", border: "1px solid rgba(248,81,73,0.2)" }}>
              {error}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>No challenges saved yet</p>
              <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                Complete a challenge, review your trades, and click &ldquo;Save to Account&rdquo; to track your performance.
              </p>
            </div>
          )}

          {/* ===== OVERVIEW ===== */}
          {!loading && view === "overview" && agg && (
            <>
              {/* Segment cards — shown when not fully filtered */}
              {segments.length > 1 && (filterTarget === null || filterInstrument === null) && (
                <div>
                  <SectionLabel>Performance by Instrument &times; Challenge</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {segments.map((seg) => {
                      const isActive = filterTarget === seg.target && filterInstrument === seg.inst;
                      return (
                        <button
                          key={`${seg.inst}-${seg.target}`}
                          onClick={() => { setFilterTarget(seg.target); setFilterInstrument(seg.inst); }}
                          className="text-left p-3 rounded-lg transition-all hover:brightness-110"
                          style={{
                            background: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                            border: `1px solid ${isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)"}`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-mono font-bold" style={{ color: "rgba(255,255,255,0.8)" }}>
                              {seg.inst}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.45)",
                            }}>
                              {seg.target} trades
                            </span>
                          </div>
                          <div className="text-[16px] font-mono font-bold" style={{ color: seg.pnl >= 0 ? "#3fb950" : "#f85149" }}>
                            {seg.pnl >= 0 ? "+" : ""}${seg.pnl.toFixed(1)}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                              {seg.count} chall.
                            </span>
                            <span className="text-[9px] font-mono" style={{ color: seg.winRate >= 50 ? "rgba(63,185,80,0.7)" : "rgba(248,81,73,0.7)" }}>
                              {seg.winRate.toFixed(0)}% win
                            </span>
                            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                              {seg.profitablePct.toFixed(0)}% prof.
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active filter label */}
              {(filterTarget !== null || filterInstrument !== null) && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Showing: {filterInstrument ?? "All instruments"} &middot; {filterTarget ? `Challenge ${filterTarget}` : "All targets"}
                  </span>
                  <button
                    onClick={() => { setFilterTarget(null); setFilterInstrument(null); }}
                    className="text-[9px] font-mono px-2 py-0.5 rounded transition-colors hover:bg-white/10"
                    style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    Clear filters
                  </button>
                </div>
              )}

              {/* Hero P&L */}
              <div className="text-center py-2">
                <div className="text-[36px] font-mono font-bold tracking-tight" style={{ color: agg.totalPnl >= 0 ? "#3fb950" : "#f85149" }}>
                  {agg.totalPnl >= 0 ? "+" : ""}${agg.totalPnl.toFixed(2)}
                </div>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {agg.n} challenge{agg.n !== 1 ? "s" : ""} &middot; {agg.totalTrades} trades &middot; {agg.profitablePct.toFixed(0)}% profitable
                </p>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Win Rate", value: `${agg.winRate.toFixed(0)}%`, color: agg.winRate >= 50 ? "#3fb950" : "#f85149" },
                  { label: "Profit Factor", value: agg.profitFactor === Infinity ? "∞" : agg.profitFactor.toFixed(2), color: agg.profitFactor >= 1 ? "#3fb950" : "#f85149" },
                  { label: "Avg Win", value: `$${agg.avgWin.toFixed(1)}`, color: "#3fb950" },
                  { label: "Avg Loss", value: `$${agg.avgLoss.toFixed(1)}`, color: "#f85149" },
                  { label: "R:R", value: agg.avgLoss !== 0 ? (agg.avgWin / Math.abs(agg.avgLoss)).toFixed(2) : "—", color: "rgba(255,255,255,0.85)" },
                ].map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Avg / Challenge", value: `$${agg.avgPnlPerChallenge.toFixed(1)}`, color: agg.avgPnlPerChallenge >= 0 ? "#3fb950" : "#f85149" },
                  { label: "Best", value: `$${agg.bestChallenge.toFixed(1)}`, color: "#3fb950" },
                  { label: "Worst", value: `$${agg.worstChallenge.toFixed(1)}`, color: "#f85149" },
                  { label: "Win Streak", value: `${agg.maxWinStreak}`, color: "rgba(255,255,255,0.85)" },
                  { label: "Loss Streak", value: `${agg.maxLossStreak}`, color: "rgba(255,255,255,0.85)" },
                ].map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>

              {/* Equity curve */}
              {agg.equityCurve.length > 2 && (
                <div>
                  <SectionLabel>Cumulative P&L</SectionLabel>
                  <ChartBox><EquityCurve data={agg.equityCurve} h={80} /></ChartBox>
                </div>
              )}

              {/* P&L per challenge bar chart */}
              {agg.pnlBars.length > 1 && (
                <div>
                  <SectionLabel>P&L Per Challenge</SectionLabel>
                  <ChartBox><PnlBarChart data={agg.pnlBars} /></ChartBox>
                </div>
              )}

              {/* Breakdowns side by side */}
              <div className="grid grid-cols-2 gap-4">
                <BreakdownTable title="By Market Condition" data={breakdowns.byMarket} labelMap={MARKET_LABELS} />
                <BreakdownTable title="By Edge" data={breakdowns.byEdge} labelMap={EDGE_LABELS} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <BreakdownTable title="By Execution" data={breakdowns.byExecution} labelMap={EXEC_LABELS} />
                <BreakdownTable title="By Time of Day (ET)" data={breakdowns.byHour} labelMap={{}} />
              </div>

              {/* Individual challenge rows — clickable */}
              <div>
                <SectionLabel>All Challenges</SectionLabel>
                <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Date</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Inst.</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Target</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Days</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Trades</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Win%</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>PF</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Max DD</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                          onClick={() => openDetail(r.id)}
                        >
                          <td className="px-3 py-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.45)" }}>{r.instrument ?? "—"}</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.45)" }}>{r.target}</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.45)" }}>{r.days_played}</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.55)" }}>{r.total_trades}</td>
                          <td className="text-right px-2 py-2" style={{ color: r.win_rate >= 50 ? "#3fb950" : "#f85149" }}>{r.win_rate.toFixed(0)}%</td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                            {r.profit_factor === Infinity ? "∞" : r.profit_factor.toFixed(2)}
                          </td>
                          <td className="text-right px-2 py-2" style={{ color: "#f85149" }}>
                            ${r.max_drawdown.toFixed(1)}
                          </td>
                          <td className="text-right px-3 py-2 font-semibold" style={{ color: r.total_pnl >= 0 ? "#3fb950" : "#f85149" }}>
                            {r.total_pnl >= 0 ? "+" : ""}${r.total_pnl.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>Click a challenge to see its details</p>
              </div>
            </>
          )}

          {/* ===== DETAIL VIEW ===== */}
          {!loading && view === "detail" && selectedRow && (
            <>
              {/* Challenge header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Challenge {selectedRow.target} &middot; {selectedRow.instrument ?? "—"} &middot; {new Date(selectedRow.submitted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </div>
                  <div className="text-[28px] font-mono font-bold mt-1" style={{ color: selectedRow.total_pnl >= 0 ? "#3fb950" : "#f85149" }}>
                    {selectedRow.total_pnl >= 0 ? "+" : ""}${selectedRow.total_pnl.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{selectedRow.days_played} days</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{selectedRow.total_trades} trades</div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Win Rate", value: `${selectedRow.win_rate.toFixed(0)}%`, color: selectedRow.win_rate >= 50 ? "#3fb950" : "#f85149" },
                  { label: "Profit Factor", value: selectedRow.profit_factor === Infinity ? "∞" : selectedRow.profit_factor.toFixed(2), color: selectedRow.profit_factor >= 1 ? "#3fb950" : "#f85149" },
                  { label: "Avg Win", value: `$${selectedRow.avg_win.toFixed(1)}`, color: "#3fb950" },
                  { label: "Avg Loss", value: `$${selectedRow.avg_loss.toFixed(1)}`, color: "#f85149" },
                  { label: "Max DD", value: `$${selectedRow.max_drawdown.toFixed(1)}`, color: "#f85149" },
                ].map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>

              {/* Equity curve */}
              {detailEquity.length > 2 && (
                <div>
                  <SectionLabel>Equity Curve</SectionLabel>
                  <ChartBox><EquityCurve data={detailEquity} h={70} /></ChartBox>
                </div>
              )}

              {/* Trade list */}
              <div>
                <SectionLabel>Trade Log ({detailGroups.length} exits)</SectionLabel>
                <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>#</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Time</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Market</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Edge</th>
                        <th className="text-left px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Execution</th>
                        <th className="text-right px-2 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Entries</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailGroups.map((g, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-3 py-2" style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                            {g.entryTime ? new Date(g.entryTime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }) : "—"}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.65)" }}>
                            {g.market ? MARKET_LABELS[g.market] ?? g.market : "—"}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.65)" }}>
                            {g.edge ? EDGE_LABELS[g.edge] ?? g.edge : "—"}
                          </td>
                          <td className="px-2 py-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                            {g.execution ? (g.execution === "added" ? "Added" : "Not Added") : "—"}
                          </td>
                          <td className="text-right px-2 py-2" style={{ color: "rgba(255,255,255,0.45)" }}>{g.tradeCount}</td>
                          <td className="text-right px-3 py-2 font-semibold" style={{ color: g.pnl >= 0 ? "#3fb950" : "#f85149" }}>
                            {g.pnl >= 0 ? "+" : ""}${g.pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Per-challenge breakdowns */}
              {(() => {
                const groups = detailGroups;
                const buildLocal = (keyFn: (g: ParsedTradeGroup) => string | null) => {
                  const map: Record<string, { wins: number; total: number; pnl: number; avgPnl: number }> = {};
                  for (const g of groups) {
                    const key = keyFn(g);
                    if (!key) continue;
                    if (!map[key]) map[key] = { wins: 0, total: 0, pnl: 0, avgPnl: 0 };
                    map[key].total++;
                    if (g.isWin) map[key].wins++;
                    map[key].pnl += g.pnl;
                  }
                  for (const key of Object.keys(map)) map[key].avgPnl = map[key].total > 0 ? map[key].pnl / map[key].total : 0;
                  return map;
                };
                const localMarket = buildLocal((g) => g.market);
                const localEdge = buildLocal((g) => g.edge);
                const localExec = buildLocal((g) => g.execution);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <BreakdownTable title="Market" data={localMarket} labelMap={MARKET_LABELS} />
                    <BreakdownTable title="Edge" data={localEdge} labelMap={EDGE_LABELS} />
                    <BreakdownTable title="Execution" data={localExec} labelMap={EXEC_LABELS} />
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

// Small reusable components

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center py-2.5 rounded-md" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[13px] font-mono font-bold" style={{ color }}>{value}</div>
      <div className="text-[7px] uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[9px] uppercase tracking-widest font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>{children}</label>;
}

function ChartBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>{children}</div>;
}

function BreakdownTable({ title, data, labelMap }: {
  title: string;
  data: Record<string, { wins: number; total: number; pnl: number; avgPnl?: number }>;
  labelMap: Record<string, string>;
}) {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return null;

  return (
    <div>
      <label className="text-[8px] uppercase tracking-widest font-semibold block mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
        {title}
      </label>
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <th className="text-left px-2.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}></th>
              <th className="text-right px-1.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>N</th>
              <th className="text-right px-1.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>Win%</th>
              <th className="text-right px-1.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>Avg</th>
              <th className="text-right px-2.5 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const d = data[key];
              const wr = d.total > 0 ? (d.wins / d.total) * 100 : 0;
              const avg = d.total > 0 ? d.pnl / d.total : 0;
              return (
                <tr key={key} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-2.5 py-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>{labelMap[key] || key}</td>
                  <td className="text-right px-1.5 py-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>{d.total}</td>
                  <td className="text-right px-1.5 py-1.5" style={{ color: wr >= 50 ? "#3fb950" : "#f85149" }}>{wr.toFixed(0)}%</td>
                  <td className="text-right px-1.5 py-1.5" style={{ color: avg >= 0 ? "#3fb950" : "#f85149" }}>
                    {avg >= 0 ? "+" : ""}${avg.toFixed(1)}
                  </td>
                  <td className="text-right px-2.5 py-1.5 font-semibold" style={{ color: d.pnl >= 0 ? "#3fb950" : "#f85149" }}>
                    {d.pnl >= 0 ? "+" : ""}${d.pnl.toFixed(1)}
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

function EquityCurve({ data, h = 60 }: { data: number[]; h?: number }) {
  const w = 500;
  const pad = 3;
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
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <polyline
        points={`${pad},${zeroY} ${pts} ${pad + ((data.length - 1) / (data.length - 1)) * (w - 2 * pad)},${zeroY}`}
        fill={`${color}12`}
        stroke="none"
      />
    </svg>
  );
}

function PnlBarChart({ data }: { data: number[] }) {
  const w = 500;
  const h = 50;
  const pad = 3;
  const maxAbs = Math.max(...data.map(Math.abs), 1);
  const barW = Math.max((w - 2 * pad) / data.length - 1, 2);
  const zeroY = h / 2;

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      {data.map((v, i) => {
        const x = pad + (i / data.length) * (w - 2 * pad);
        const barH = (Math.abs(v) / maxAbs) * (h / 2 - pad);
        const y = v >= 0 ? zeroY - barH : zeroY;
        const color = v >= 0 ? "#3fb950" : "#f85149";
        return <rect key={i} x={x} y={y} width={barW} height={barH} fill={color} opacity={0.7} rx={0.5} />;
      })}
    </svg>
  );
}
