"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ClosedTrade } from "@/lib/backtestTypes";
import { REVIEW_TAGS, TradeGroupReview, ReviewTag } from "@/lib/reviewTypes";
import { ChallengeState, ChallengeReview, computeChallengeStats } from "@/lib/challengeTypes";

interface Props {
  challenge: ChallengeState;
  onClose: () => void;
  onFocusTrade: (entryTime: number, exitTime: number) => void;
}

export default function ChallengeReviewModal({ challenge, onClose, onFocusTrade }: Props) {
  const allTrades = challenge.allTrades;

  // Sort all trades chronologically by exit time, then entry time
  const sortedTrades = useMemo(() =>
    [...allTrades].sort((a, b) => a.exitTime - b.exitTime || a.entryTime - b.entryTime),
    [allTrades]
  );

  // One review per trade (chronological)
  const [tradeReviews, setTradeReviews] = useState<Map<string, { rating: number; tags: Set<ReviewTag>; customTags: string[]; idea: string; coherent: string; executionNotes: string }>>(
    () => {
      const m = new Map();
      sortedTrades.forEach((t) => {
        m.set(t.id, { rating: 3, tags: new Set(), customTags: [], idea: "", coherent: "", executionNotes: "" });
      });
      return m;
    }
  );

  const [step, setStep] = useState<"trades" | "summary">("trades");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [overallRating, setOverallRating] = useState(3);
  const [overallNotes, setOverallNotes] = useState("");
  const [customTagInput, setCustomTagInput] = useState("");

  const stats = useMemo(() => computeChallengeStats(allTrades), [allTrades]);
  const currentTrade = sortedTrades[currentIdx];
  const currentReview = currentTrade ? tradeReviews.get(currentTrade.id) : null;

  // Focus chart on current trade
  useEffect(() => {
    if (step === "trades" && currentTrade) {
      onFocusTrade(currentTrade.entryTime, currentTrade.exitTime);
    }
  }, [step, currentIdx, currentTrade, onFocusTrade]);

  const updateReview = useCallback((id: string, patch: Partial<{ rating: number; tags: Set<ReviewTag>; customTags: string[]; idea: string; coherent: string; executionNotes: string }>) => {
    setTradeReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(id)!;
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const toggleTag = useCallback((id: string, tag: ReviewTag) => {
    setTradeReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(id)!;
      const tags = new Set(existing.tags);
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      next.set(id, { ...existing, tags });
      return next;
    });
  }, []);

  const addCustomTag = useCallback((id: string, tag: string) => {
    if (!tag.trim()) return;
    setTradeReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(id)!;
      if (existing.customTags.includes(tag.trim())) return prev;
      next.set(id, { ...existing, customTags: [...existing.customTags, tag.trim()] });
      return next;
    });
    setCustomTagInput("");
  }, []);

  const removeCustomTag = useCallback((id: string, tag: string) => {
    setTradeReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(id)!;
      next.set(id, { ...existing, customTags: existing.customTags.filter((t) => t !== tag) });
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (step === "trades") {
      if (currentIdx < sortedTrades.length - 1) setCurrentIdx((i) => i + 1);
      else setStep("summary");
    }
  }, [step, currentIdx, sortedTrades.length]);

  const handlePrev = useCallback(() => {
    if (step === "summary") { setStep("trades"); setCurrentIdx(sortedTrades.length - 1); }
    else if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }, [step, currentIdx, sortedTrades.length]);

  // Build review for PDF — group by exit time for the PDF format
  const buildReview = useCallback((): ChallengeReview => {
    // Group trades by exit time for the PDF trade group format
    const exitGroups = new Map<number, ClosedTrade[]>();
    sortedTrades.forEach((t) => {
      if (!exitGroups.has(t.exitTime)) exitGroups.set(t.exitTime, []);
      exitGroups.get(t.exitTime)!.push(t);
    });

    const tradeGroupReviews: TradeGroupReview[] = Array.from(exitGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([exitTime, trades]) => {
        // Merge reviews from individual trades
        const merged = trades.map((t) => tradeReviews.get(t.id)!);
        const allTags = new Set<ReviewTag>();
        const allCustom: string[] = [];
        const ideas: string[] = [];
        const coherents: string[] = [];
        const execs: string[] = [];
        let totalRating = 0;
        merged.forEach((r) => {
          r.tags.forEach((t) => allTags.add(t));
          allCustom.push(...r.customTags);
          if (r.idea) ideas.push(r.idea);
          if (r.coherent) coherents.push(r.coherent);
          if (r.executionNotes) execs.push(r.executionNotes);
          totalRating += r.rating;
        });
        return {
          exitTime,
          exitPrice: trades[0].exitPrice,
          trades,
          rating: Math.round(totalRating / merged.length),
          tags: Array.from(allTags),
          customTags: [...new Set(allCustom)],
          idea: ideas.join(" | "),
          coherent: coherents.join(" | "),
          executionNotes: execs.join(" | "),
        };
      });

    return {
      challenge,
      tradeGroupReviews,
      overallRating,
      overallNotes,
      stats,
      submittedAt: Date.now(),
    };
  }, [sortedTrades, tradeReviews, challenge, overallRating, overallNotes, stats]);

  const handleDownloadPdf = useCallback(async () => {
    const review = buildReview();
    const { generateChallengePdf } = await import("@/lib/challengePdf");
    generateChallengePdf(review);
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
    const pts: number[] = [0];
    let eq = 0;
    for (const t of sortedTrades) { eq += t.pnlPoints; pts.push(eq); }
    return pts;
  }, [sortedTrades]);

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
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                Trade {currentIdx + 1} of {sortedTrades.length}
              </span>
            )}
            {step === "summary" && (
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>Summary</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full transition-all" style={{
            width: step === "summary" ? "100%" : `${((currentIdx + 1) / sortedTrades.length) * 100}%`,
            background: "rgba(255,255,255,0.3)",
          }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {step === "trades" && currentTrade && currentReview && (
            <>
              {/* Trade header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-mono font-bold" style={{
                    color: currentTrade.direction === "long" ? "#3fb950" : "#f85149",
                  }}>
                    {currentTrade.direction === "long" ? "LONG" : "SHORT"}
                  </span>
                  <span className="text-[12px] font-mono" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {currentTrade.entryPrice.toFixed(1)} → {currentTrade.exitPrice.toFixed(1)}
                  </span>
                </div>
                <div className="text-[14px] font-mono font-bold" style={{
                  color: currentTrade.pnlPoints >= 0 ? "#3fb950" : "#f85149",
                }}>
                  {currentTrade.pnlPoints >= 0 ? "+" : ""}${currentTrade.pnlPoints.toFixed(2)}
                </div>
              </div>

              {/* Exit reason badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded" style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.4)",
                }}>{currentTrade.exitReason}</span>
              </div>

              {/* Rating — bigger */}
              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Execution Rating
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => updateReview(currentTrade.id, { rating: n })}
                      className="text-[24px] transition-transform hover:scale-110"
                      style={{ color: n <= currentReview.rating ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)" }}>
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {REVIEW_TAGS.map((tag) => (
                    <button key={tag} onClick={() => toggleTag(currentTrade.id, tag)}
                      className="text-[11px] font-mono px-3 py-1.5 rounded-full transition-colors"
                      style={{
                        background: currentReview.tags.has(tag) ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${currentReview.tags.has(tag) ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                        color: currentReview.tags.has(tag) ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
                      }}>{tag}</button>
                  ))}
                  {currentReview.customTags.map((tag) => (
                    <button key={tag} onClick={() => removeCustomTag(currentTrade.id, tag)}
                      className="text-[11px] font-mono px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.9)" }}>
                      {tag} ×
                    </button>
                  ))}
                  <input type="text" value={customTagInput} onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomTag(currentTrade.id, customTagInput); }}
                    placeholder="+ custom tag"
                    className="text-[11px] font-mono px-3 py-1.5 rounded-full bg-transparent outline-none w-24"
                    style={{ border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }} />
                </div>
              </div>

              {/* Notes — large, prominent text areas */}
              <div className="space-y-4">
                <NoteField label="What was the idea?" value={currentReview.idea}
                  onChange={(v) => updateReview(currentTrade.id, { idea: v })}
                  placeholder="What setup or signal triggered this trade..." />
                <NoteField label="Was it coherent with your plan?" value={currentReview.coherent}
                  onChange={(v) => updateReview(currentTrade.id, { coherent: v })}
                  placeholder="Did this match your strategy rules..." />
                <NoteField label="Execution notes" value={currentReview.executionNotes}
                  onChange={(v) => updateReview(currentTrade.id, { executionNotes: v })}
                  placeholder="Entry timing, sizing, management..." />
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

              {/* Stats */}
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
                <label className="text-[11px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Equity Curve
                </label>
                <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                  <svg viewBox={`0 0 ${equityPts.length} 40`} className="w-full h-20" preserveAspectRatio="none">
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

              {/* Overall rating */}
              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Overall Rating
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setOverallRating(n)} className="text-[28px] transition-transform hover:scale-110"
                      style={{ color: n <= overallRating ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)" }}>★</button>
                  ))}
                </div>
              </div>

              <NoteField label="Overall notes & takeaways" value={overallNotes} onChange={setOverallNotes}
                placeholder="Key learnings from this challenge..." rows={4} />
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
            <button onClick={handleDownloadPdf}
              className="text-[11px] font-mono font-semibold px-5 py-2 rounded transition-colors hover:brightness-110"
              style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.95)" }}>
              Download PDF
            </button>
          )}

          {step === "trades" && (
            <button onClick={handleNext}
              className="text-[11px] font-mono font-semibold px-5 py-2 rounded transition-colors hover:brightness-110"
              style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.95)" }}>
              {currentIdx < sortedTrades.length - 1 ? "Next" : "Summary"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteField({ label, value, onChange, placeholder, rows = 3 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-semibold block mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
        {label}
      </label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full text-[12px] font-mono px-4 py-3 rounded-lg bg-transparent outline-none resize-none leading-relaxed"
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.9)",
          background: "rgba(255,255,255,0.03)",
        }}
        onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.3)"; e.target.style.background = "rgba(255,255,255,0.05)"; }}
        onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.background = "rgba(255,255,255,0.03)"; }} />
    </div>
  );
}
