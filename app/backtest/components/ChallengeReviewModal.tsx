"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ClosedTrade } from "@/lib/backtestTypes";
import { TradeGroupReview } from "@/lib/reviewTypes";
import { ChallengeState, ChallengeReview, computeChallengeStats } from "@/lib/challengeTypes";
import { useAuth } from "@/lib/useAuth";
import { saveChallengeReview } from "@/lib/challengeDb";

type MarketCondition = "range" | "trend" | "unclear" | null;
type Edge = "fade" | "breakout" | "continuation" | "reversal" | null;
type Execution = "added" | "not_added" | null;

interface TradeReview {
  market: MarketCondition;
  edge: Edge;
  execution: Execution;
  comment: string;
}

const EDGES_FOR_MARKET: Record<string, Edge[]> = {
  range: ["fade", "breakout"],
  trend: ["continuation", "reversal"],
  unclear: ["fade", "breakout", "continuation", "reversal"],
};

const EDGE_LABELS: Record<string, string> = {
  fade: "Fade",
  breakout: "Breakout",
  continuation: "Continuation",
  reversal: "Reversal",
};

interface Props {
  challenge: ChallengeState;
  instrument?: string;
  onClose: () => void;
  onFocusTrade: (entryTime: number, exitTime: number) => void;
}

export default function ChallengeReviewModal({ challenge, instrument, onClose, onFocusTrade }: Props) {
  const allTrades = challenge.allTrades;

  // Group trades by exit time
  const tradeGroups = useMemo(() => {
    const map = new Map<number, ClosedTrade[]>();
    allTrades.forEach((t) => {
      const key = t.exitTime;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([exitTime, trades]) => ({ exitTime, trades }));
  }, [allTrades]);

  // Reviews state
  const [reviews, setReviews] = useState<Map<number, TradeReview>>(() => {
    const m = new Map<number, TradeReview>();
    tradeGroups.forEach((g) => {
      m.set(g.exitTime, { market: null, edge: null, execution: null, comment: "" });
    });
    return m;
  });

  const [step, setStep] = useState<"trades" | "summary">("trades");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [overallNotes, setOverallNotes] = useState("");

  const { user } = useAuth();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const stats = useMemo(() => computeChallengeStats(allTrades), [allTrades]);
  const currentGroup = tradeGroups[currentIdx];
  const currentReview = currentGroup ? reviews.get(currentGroup.exitTime) ?? null : null;

  const groupPnl = currentGroup
    ? currentGroup.trades.reduce((s, t) => s + t.pnlPoints, 0)
    : 0;

  // Focus chart on current trade
  useEffect(() => {
    if (step === "trades" && currentGroup) {
      const earliest = Math.min(...currentGroup.trades.map((t) => t.entryTime));
      onFocusTrade(earliest, currentGroup.exitTime);
    }
  }, [step, currentIdx, currentGroup, onFocusTrade]);

  const updateReview = useCallback((exitTime: number, patch: Partial<TradeReview>) => {
    setReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(exitTime)!;
      const updated = { ...existing, ...patch };
      // Reset edge if market condition changed
      if (patch.market !== undefined && patch.market !== existing.market) {
        updated.edge = null;
      }
      next.set(exitTime, updated);
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (step === "trades") {
      if (currentIdx < tradeGroups.length - 1) setCurrentIdx((i) => i + 1);
      else setStep("summary");
    }
  }, [step, currentIdx, tradeGroups.length]);

  const handlePrev = useCallback(() => {
    if (step === "summary") { setStep("trades"); setCurrentIdx(tradeGroups.length - 1); }
    else if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }, [step, currentIdx, tradeGroups.length]);

  // Build review for save/PDF
  const buildReview = useCallback((): ChallengeReview => {
    const tradeGroupReviews: TradeGroupReview[] = tradeGroups.map((g) => {
      const r = reviews.get(g.exitTime)!;
      return {
        exitTime: g.exitTime,
        exitPrice: g.trades[0].exitPrice,
        trades: g.trades,
        rating: 0,
        tags: [r.market, r.edge, r.execution].filter(Boolean) as string[],
        customTags: [],
        idea: r.comment,
        coherent: "",
        executionNotes: "",
      };
    });

    return {
      challenge,
      tradeGroupReviews,
      overallRating: 0,
      overallNotes,
      instrument,
      stats,
      submittedAt: Date.now(),
    };
  }, [tradeGroups, reviews, challenge, overallNotes, instrument, stats]);

  const handleDownloadPdf = useCallback(async () => {
    const review = buildReview();
    const { generateChallengePdf } = await import("@/lib/challengePdf");
    generateChallengePdf(review);
  }, [buildReview]);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    const review = buildReview();
    const { error } = await saveChallengeReview(review);
    if (error) {
      setSaveStatus("error");
      setSaveError(error);
    } else {
      setSaveStatus("saved");
    }
  }, [buildReview]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Equity curve
  const equityPts = useMemo(() => {
    const sorted = [...allTrades].sort((a, b) => a.exitTime - b.exitTime || a.entryTime - b.entryTime);
    const pts: number[] = [0];
    let eq = 0;
    for (const t of sorted) { eq += t.pnlPoints; pts.push(eq); }
    return pts;
  }, [allTrades]);

  // Summary stats broken down by category
  const summaryBreakdown = useMemo(() => {
    const byMarket: Record<string, { trades: ClosedTrade[]; count: number }> = {};
    const byEdge: Record<string, { trades: ClosedTrade[]; count: number }> = {};
    const byExecution: Record<string, { trades: ClosedTrade[]; count: number }> = {};
    const byHour: Record<string, { trades: ClosedTrade[]; count: number }> = {};

    for (const g of tradeGroups) {
      const r = reviews.get(g.exitTime);
      const market = r?.market ?? "unset";
      const edge = r?.edge ?? "unset";
      const exec = r?.execution ?? "unset";

      // Hour of entry (first trade in group)
      const entryTime = Math.min(...g.trades.map((t) => t.entryTime));
      const hour = new Date(entryTime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).slice(0, 5);
      const hourBucket = hour.slice(0, 2) + ":00";

      if (!byMarket[market]) byMarket[market] = { trades: [], count: 0 };
      byMarket[market].trades.push(...g.trades);
      byMarket[market].count++;

      if (edge !== "unset") {
        if (!byEdge[edge]) byEdge[edge] = { trades: [], count: 0 };
        byEdge[edge].trades.push(...g.trades);
        byEdge[edge].count++;
      }

      if (exec !== "unset") {
        if (!byExecution[exec]) byExecution[exec] = { trades: [], count: 0 };
        byExecution[exec].trades.push(...g.trades);
        byExecution[exec].count++;
      }

      if (!byHour[hourBucket]) byHour[hourBucket] = { trades: [], count: 0 };
      byHour[hourBucket].trades.push(...g.trades);
      byHour[hourBucket].count++;
    }

    return { byMarket, byEdge, byExecution, byHour };
  }, [tradeGroups, reviews]);

  // Format time from unix timestamp
  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[100] slide-in-right" style={{ width: "460px" }}>
      <div className="w-full h-full flex flex-col overflow-hidden" style={{
        background: "linear-gradient(160deg, rgba(12, 15, 21, 0.98), rgba(18, 22, 30, 0.95))",
        backdropFilter: "blur(32px) saturate(1.4)",
        borderLeft: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: "-8px 0 64px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        }}>
          <div className="flex gap-1.5">
            <div className="w-[8px] h-[8px] rounded-full cursor-pointer hover:opacity-100" style={{ background: "rgba(255, 255, 255, 0.3)" }} onClick={onClose} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.15)" }} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.08)" }} />
          </div>
          <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.1)" }} />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
            Challenge {challenge.target}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {step === "trades" && (
              <>
                <div className="flex gap-1">
                  {tradeGroups.map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                      style={{
                        background: i === currentIdx
                          ? "rgba(255,255,255,0.9)"
                          : i < currentIdx
                            ? "rgba(255,255,255,0.4)"
                            : "rgba(255,255,255,0.15)",
                      }}
                      onClick={() => setCurrentIdx(i)}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Trade {currentIdx + 1}/{tradeGroups.length}
                </span>
              </>
            )}
            {step === "summary" && (
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>Summary</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full transition-all" style={{
            width: step === "summary" ? "100%" : `${((currentIdx + 1) / tradeGroups.length) * 100}%`,
            background: "rgba(255,255,255,0.3)",
          }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "trades" && currentGroup && currentReview && (
            <>
              {/* Trade info */}
              <div className="flex items-center gap-3">
                <div className="text-[12px] font-mono font-bold px-2.5 py-1 rounded" style={{
                  background: groupPnl >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
                  border: `1px solid ${groupPnl >= 0 ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
                  color: groupPnl >= 0 ? "#3fb950" : "#f85149",
                }}>
                  {groupPnl >= 0 ? "+" : ""}${groupPnl.toFixed(2)}
                </div>
                <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {formatTime(Math.min(...currentGroup.trades.map((t) => t.entryTime)))}
                  {" → "}
                  {formatTime(currentGroup.exitTime)}
                </span>
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {currentGroup.trades.length} {currentGroup.trades.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              {/* Trades table */}
              <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Dir</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Entry</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Exit</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>P&L</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentGroup.trades.map((t) => (
                      <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td className="px-3 py-2" style={{ color: t.direction === "long" ? "#3fb950" : "#f85149" }}>
                          {t.direction === "long" ? "LONG" : "SHORT"}
                        </td>
                        <td className="text-right px-3 py-2" style={{ color: "rgba(255,255,255,0.85)" }}>{t.entryPrice.toFixed(2)}</td>
                        <td className="text-right px-3 py-2" style={{ color: "rgba(255,255,255,0.85)" }}>{t.exitPrice.toFixed(2)}</td>
                        <td className="text-right px-3 py-2 font-semibold" style={{ color: t.pnlPoints >= 0 ? "#3fb950" : "#f85149" }}>
                          {t.pnlPoints >= 0 ? "+" : ""}${t.pnlPoints.toFixed(2)}
                        </td>
                        <td className="text-right px-3 py-2 uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 1. Market Condition */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Market Condition
                </label>
                <div className="flex gap-2">
                  {(["range", "trend", "unclear"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => updateReview(currentGroup.exitTime, { market: m })}
                      className="flex-1 text-[11px] font-mono font-semibold py-2.5 rounded-lg transition-all"
                      style={{
                        background: currentReview.market === m ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${currentReview.market === m ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                        color: currentReview.market === m ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {m === "range" ? "Range" : m === "trend" ? "Trend" : "Unclear"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Edge (depends on market condition) */}
              {currentReview.market && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Edge
                  </label>
                  <div className="flex gap-2">
                    {EDGES_FOR_MARKET[currentReview.market].map((e) => (
                      <button
                        key={e}
                        onClick={() => updateReview(currentGroup.exitTime, { edge: e })}
                        className="flex-1 text-[11px] font-mono font-semibold py-2.5 rounded-lg transition-all"
                        style={{
                          background: currentReview.edge === e ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${currentReview.edge === e ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                          color: currentReview.edge === e ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                        }}
                      >
                        {EDGE_LABELS[e!]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Execution */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Execution
                </label>
                <div className="flex gap-2">
                  {([["added", "Added to Winner"], ["not_added", "Not Added"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => updateReview(currentGroup.exitTime, { execution: val })}
                      className="flex-1 text-[11px] font-mono font-semibold py-2.5 rounded-lg transition-all"
                      style={{
                        background: currentReview.execution === val ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${currentReview.execution === val ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                        color: currentReview.execution === val ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Optional comment */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Comment <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
                </label>
                <textarea
                  value={currentReview.comment}
                  onChange={(e) => updateReview(currentGroup.exitTime, { comment: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Any notes about this trade..."
                  rows={2}
                  className="w-full text-[11px] font-mono px-3 py-2 rounded-md bg-transparent outline-none resize-none"
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.85)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.25)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </div>
            </>
          )}

          {step === "summary" && (
            <>
              <div className="text-center space-y-1">
                <p className="text-[16px] font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>Challenge Complete</p>
                <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {stats.daysPlayed} days — {stats.totalExits} exits — {stats.totalTrades} trades
                </p>
              </div>

              {/* Overall stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "P&L", value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? "#3fb950" : "#f85149" },
                  { label: "Win Rate", value: `${stats.winRate.toFixed(0)}%`, color: "rgba(255,255,255,0.85)" },
                  { label: "PF", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: "rgba(255,255,255,0.85)" },
                  { label: "Avg Win", value: `$${stats.avgWin.toFixed(2)}`, color: "#3fb950" },
                  { label: "Avg Loss", value: `$${stats.avgLoss.toFixed(2)}`, color: "#f85149" },
                  { label: "Max DD", value: `$${stats.maxDrawdown.toFixed(2)}`, color: "#f85149" },
                ].map((s) => (
                  <div key={s.label} className="text-center py-3 rounded-md" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[14px] font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Equity curve */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Equity Curve</label>
                <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                  <svg viewBox={`0 0 ${equityPts.length} 40`} className="w-full h-16" preserveAspectRatio="none">
                    {(() => {
                      const mn = Math.min(...equityPts);
                      const mx = Math.max(...equityPts);
                      const rng = mx - mn || 1;
                      const pts = equityPts.map((v, i) => `${i},${40 - ((v - mn) / rng) * 36 - 2}`).join(" ");
                      const zeroY = 40 - ((0 - mn) / rng) * 36 - 2;
                      return (
                        <>
                          <line x1="0" y1={zeroY} x2={equityPts.length} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" />
                          <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* Breakdown by Market Condition */}
              <BreakdownSection
                title="By Market Condition"
                data={summaryBreakdown.byMarket}
                labelMap={{ range: "Range", trend: "Trend", unclear: "Unclear", unset: "Not set" }}
              />

              {/* Breakdown by Edge */}
              <BreakdownSection
                title="By Edge"
                data={summaryBreakdown.byEdge}
                labelMap={{ fade: "Fade", breakout: "Breakout", continuation: "Continuation", reversal: "Reversal", unset: "Not set" }}
              />

              {/* Breakdown by Execution */}
              <BreakdownSection
                title="By Execution"
                data={summaryBreakdown.byExecution}
                labelMap={{ added: "Added to Winner", not_added: "Not Added", unset: "Not set" }}
              />

              {/* Breakdown by Time of Day */}
              <BreakdownSection
                title="By Time of Day (ET)"
                data={summaryBreakdown.byHour}
                labelMap={{}}
                useKeyAsLabel
              />

              {/* Overall notes */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Overall Notes <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
                </label>
                <textarea
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Key takeaways from this challenge..."
                  rows={3}
                  className="w-full text-[11px] font-mono px-3 py-2 rounded-md bg-transparent outline-none resize-none"
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.85)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.25)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(0,0,0,0.2)",
        }}>
          <button onClick={handlePrev} disabled={step === "trades" && currentIdx === 0}
            className="text-[11px] font-mono px-4 py-2 rounded transition-colors disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Prev
          </button>

          <div className="flex-1" />

          {step === "summary" && (
            <>
              {user ? (
                <button
                  onClick={handleSave}
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                  className="text-[11px] font-mono font-semibold px-5 py-2 rounded transition-colors hover:brightness-110 disabled:opacity-50"
                  style={{
                    background: saveStatus === "saved" ? "rgba(63,185,80,0.15)" : "rgba(255,255,255,0.14)",
                    border: `1px solid ${saveStatus === "saved" ? "rgba(63,185,80,0.3)" : saveStatus === "error" ? "rgba(248,81,73,0.3)" : "rgba(255,255,255,0.25)"}`,
                    color: saveStatus === "saved" ? "#3fb950" : saveStatus === "error" ? "#f85149" : "rgba(255,255,255,0.95)",
                  }}
                >
                  {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Retry Save" : "Save to Account"}
                </button>
              ) : (
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>Sign in to save</span>
              )}
              {saveError && <span className="text-[9px]" style={{ color: "#f85149" }}>{saveError}</span>}
              <button onClick={handleDownloadPdf}
                className="text-[11px] font-mono font-semibold px-5 py-2 rounded transition-colors hover:brightness-110"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.95)" }}>
                Download PDF
              </button>
            </>
          )}

          {step === "trades" && (
            <button onClick={handleNext}
              className="text-[11px] font-mono font-semibold px-5 py-2 rounded transition-colors hover:brightness-110"
              style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.95)" }}>
              {currentIdx < tradeGroups.length - 1 ? "Next Trade" : "Summary"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Breakdown table component for the summary
function BreakdownSection({ title, data, labelMap, useKeyAsLabel }: {
  title: string;
  data: Record<string, { trades: ClosedTrade[]; count: number }>;
  labelMap: Record<string, string>;
  useKeyAsLabel?: boolean;
}) {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return null;

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
        {title}
      </label>
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              <th className="text-left px-3 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}></th>
              <th className="text-right px-2 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Exits</th>
              <th className="text-right px-2 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Win%</th>
              <th className="text-right px-2 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>P&L</th>
              <th className="text-right px-3 py-1.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const { trades, count } = data[key];
              const pnl = trades.reduce((s, t) => s + t.pnlPoints, 0);
              const wins = trades.filter((t) => t.pnlPoints > 0).length;
              const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
              const avg = trades.length > 0 ? pnl / trades.length : 0;
              const label = useKeyAsLabel ? key : (labelMap[key] ?? key);

              return (
                <tr key={key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td className="px-3 py-1.5" style={{ color: "rgba(255,255,255,0.8)" }}>{label}</td>
                  <td className="text-right px-2 py-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>{count}</td>
                  <td className="text-right px-2 py-1.5" style={{ color: winRate >= 50 ? "#3fb950" : "#f85149" }}>{winRate.toFixed(0)}%</td>
                  <td className="text-right px-2 py-1.5 font-semibold" style={{ color: pnl >= 0 ? "#3fb950" : "#f85149" }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}
                  </td>
                  <td className="text-right px-3 py-1.5" style={{ color: avg >= 0 ? "#3fb950" : "#f85149" }}>
                    {avg >= 0 ? "+" : ""}${avg.toFixed(1)}
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
