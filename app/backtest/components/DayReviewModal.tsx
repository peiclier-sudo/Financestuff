"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ClosedTrade } from "@/lib/backtestTypes";
import { TradingDay } from "@/lib/types";
import { REVIEW_TAGS, TradeGroupReview, DayReview, ReviewTag } from "@/lib/reviewTypes";
import { generateWordCode } from "@/lib/wordCode";

interface Props {
  closedTrades: ClosedTrade[];
  day: TradingDay;
  tradingSize: number;
  onClose: () => void;
  /** Called to zoom the chart to a specific time range */
  onFocusTrade: (entryTime: number, exitTime: number) => void;
}

const USER_ID_KEY = "backtest_review_user_id";

function getOrCreateUserId(): { id: string; isNew: boolean } {
  if (typeof window === "undefined") return { id: generateWordCode(), isNew: true };
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return { id: stored, isNew: false };
  const id = generateWordCode();
  localStorage.setItem(USER_ID_KEY, id);
  return { id, isNew: true };
}

export default function DayReviewModal({ closedTrades, day, tradingSize, onClose, onFocusTrade }: Props) {
  // Group trades by exit time
  const tradeGroups = useMemo(() => {
    const map = new Map<number, ClosedTrade[]>();
    closedTrades.forEach((t) => {
      const key = t.exitTime;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([exitTime, trades]) => ({ exitTime, trades }));
  }, [closedTrades]);

  // Review state per group
  const [groupReviews, setGroupReviews] = useState<Map<number, { rating: number; tags: Set<ReviewTag>; customTags: string[]; idea: string; coherent: string; executionNotes: string }>>(
    () => {
      const m = new Map();
      tradeGroups.forEach((g) => {
        m.set(g.exitTime, { rating: 3, tags: new Set(), customTags: [], idea: "", coherent: "", executionNotes: "" });
      });
      return m;
    }
  );

  // Navigation
  const [step, setStep] = useState<"trades" | "day">("trades");
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);

  // Day-level review
  const [dayRating, setDayRating] = useState(3);
  const [dayNotes, setDayNotes] = useState("");

  // Custom tag input
  const [customTagInput, setCustomTagInput] = useState("");

  // User ID
  const [userInfo] = useState(() => getOrCreateUserId());
  const [showUserId, setShowUserId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Stats
  const stats = useMemo(() => {
    const wins = closedTrades.filter((t) => t.pnlPoints > 0);
    const losses = closedTrades.filter((t) => t.pnlPoints <= 0);
    const totalPnl = closedTrades.reduce((s, t) => s + t.pnlPoints, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPoints, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPoints, 0) / losses.length : 0;
    const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));
    return {
      totalTrades: closedTrades.length,
      winners: wins.length,
      losers: losses.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    };
  }, [closedTrades]);

  // Focus chart on current trade group
  useEffect(() => {
    if (step === "trades" && tradeGroups[currentGroupIdx]) {
      const g = tradeGroups[currentGroupIdx];
      const earliest = Math.min(...g.trades.map((t) => t.entryTime));
      onFocusTrade(earliest, g.exitTime);
    }
  }, [step, currentGroupIdx, tradeGroups, onFocusTrade]);

  const currentGroup = tradeGroups[currentGroupIdx];
  const currentReview = currentGroup ? groupReviews.get(currentGroup.exitTime) : null;

  const updateReview = useCallback((exitTime: number, patch: Partial<{ rating: number; tags: Set<ReviewTag>; customTags: string[]; idea: string; coherent: string; executionNotes: string }>) => {
    setGroupReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(exitTime)!;
      next.set(exitTime, { ...existing, ...patch });
      return next;
    });
  }, []);

  const toggleTag = useCallback((exitTime: number, tag: ReviewTag) => {
    setGroupReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(exitTime)!;
      const tags = new Set(existing.tags);
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      next.set(exitTime, { ...existing, tags });
      return next;
    });
  }, []);

  const addCustomTag = useCallback((exitTime: number, tag: string) => {
    if (!tag.trim()) return;
    setGroupReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(exitTime)!;
      if (existing.customTags.includes(tag.trim())) return prev;
      next.set(exitTime, { ...existing, customTags: [...existing.customTags, tag.trim()] });
      return next;
    });
    setCustomTagInput("");
  }, []);

  const removeCustomTag = useCallback((exitTime: number, tag: string) => {
    setGroupReviews((prev) => {
      const next = new Map(prev);
      const existing = next.get(exitTime)!;
      next.set(exitTime, { ...existing, customTags: existing.customTags.filter((t) => t !== tag) });
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (step === "trades") {
      if (currentGroupIdx < tradeGroups.length - 1) {
        setCurrentGroupIdx((i) => i + 1);
      } else {
        setStep("day");
      }
    }
  }, [step, currentGroupIdx, tradeGroups.length]);

  const handlePrev = useCallback(() => {
    if (step === "day") {
      setStep("trades");
      setCurrentGroupIdx(tradeGroups.length - 1);
    } else if (currentGroupIdx > 0) {
      setCurrentGroupIdx((i) => i - 1);
    }
  }, [step, currentGroupIdx, tradeGroups.length]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    const tradeGroupReviews: TradeGroupReview[] = tradeGroups.map((g) => {
      const r = groupReviews.get(g.exitTime)!;
      return {
        exitTime: g.exitTime,
        exitPrice: g.trades[0].exitPrice,
        trades: g.trades,
        rating: r.rating,
        tags: Array.from(r.tags),
        customTags: r.customTags,
        idea: r.idea,
        coherent: r.coherent,
        executionNotes: r.executionNotes,
      };
    });

    const review: DayReview = {
      date: day.date,
      dayName: day.dayName,
      changePercent: day.changePercent,
      rangePercent: day.rangePercent,
      tradeGroups: tradeGroupReviews,
      dayRating,
      dayNotes,
      stats,
      tradingSize,
      submittedAt: Date.now(),
    };

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userInfo.id, review }),
      });
      if (res.ok) {
        setSaved(true);
        setShowUserId(true);
      }
    } catch (err) {
      console.error("Failed to save review:", err);
    } finally {
      setSaving(false);
    }
  }, [tradeGroups, groupReviews, day, dayRating, dayNotes, stats, tradingSize, userInfo.id]);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const groupPnl = currentGroup
    ? currentGroup.trades.reduce((s, t) => s + t.pnlPoints, 0)
    : 0;

  return (
    <div className="fixed inset-y-0 right-0 z-[100] slide-in-right" style={{ width: "420px" }}>
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(12, 15, 21, 0.98), rgba(18, 22, 30, 0.95))",
          backdropFilter: "blur(32px) saturate(1.4)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "-8px 0 64px rgba(0,0,0,0.6)",
        }}
      >
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
            Review Your Day
          </span>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{day.date}</span>
          {/* Progress */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1">
              {tradeGroups.map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                  style={{
                    background: step === "trades" && i === currentGroupIdx
                      ? "rgba(255,255,255,0.9)"
                      : i < currentGroupIdx || step === "day"
                        ? "rgba(255,255,255,0.4)"
                        : "rgba(255,255,255,0.15)",
                  }}
                  onClick={() => { setStep("trades"); setCurrentGroupIdx(i); }}
                />
              ))}
              <div
                className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                style={{ background: step === "day" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)" }}
                onClick={() => setStep("day")}
              />
            </div>
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              {step === "trades" ? `Trade ${currentGroupIdx + 1}/${tradeGroups.length}` : "Summary"}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "trades" && currentGroup && currentReview && (
            <>
              {/* Trade group header */}
              <div className="flex items-center gap-3">
                <div className="text-[12px] font-mono font-bold px-2.5 py-1 rounded" style={{
                  background: groupPnl >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
                  border: `1px solid ${groupPnl >= 0 ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
                  color: groupPnl >= 0 ? "#3fb950" : "#f85149",
                }}>
                  {groupPnl >= 0 ? "+" : ""}${groupPnl.toFixed(2)}
                </div>
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {currentGroup.trades.length} {currentGroup.trades.length === 1 ? "entry" : "entries"} — Exit @ {currentGroup.trades[0].exitPrice.toFixed(1)}
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
                        <td className="text-right px-3 py-2" style={{ color: "rgba(255,255,255,0.85)" }}>{t.entryPrice.toFixed(1)}</td>
                        <td className="text-right px-3 py-2" style={{ color: "rgba(255,255,255,0.85)" }}>{t.exitPrice.toFixed(1)}</td>
                        <td className="text-right px-3 py-2 font-semibold" style={{ color: t.pnlPoints >= 0 ? "#3fb950" : "#f85149" }}>
                          {t.pnlPoints >= 0 ? "+" : ""}${t.pnlPoints.toFixed(2)}
                        </td>
                        <td className="text-right px-3 py-2 uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rating */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Execution Rating</label>
                <div className="flex gap-1.5 mt-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateReview(currentGroup.exitTime, { rating: n })}
                      className="text-[20px] transition-transform hover:scale-110"
                      style={{ color: n <= currentReview.rating ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)" }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Tags</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {REVIEW_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(currentGroup.exitTime, tag)}
                      className="text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: currentReview.tags.has(tag) ? "rgba(255, 255, 255, 0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${currentReview.tags.has(tag) ? "rgba(255, 255, 255, 0.30)" : "rgba(255,255,255,0.08)"}`,
                        color: currentReview.tags.has(tag) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  {currentReview.customTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => removeCustomTag(currentGroup.exitTime, tag)}
                      className="text-[10px] font-mono px-2.5 py-1 rounded-full"
                      style={{
                        background: "rgba(255, 255, 255, 0.12)",
                        border: "1px solid rgba(255, 255, 255, 0.25)",
                        color: "rgba(255,255,255,0.85)",
                      }}
                    >
                      {tag} ×
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addCustomTag(currentGroup.exitTime, customTagInput);
                      }}
                      placeholder="+ custom"
                      className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-transparent outline-none w-20"
                      style={{ border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Text fields */}
              <div className="space-y-3">
                <ReviewField
                  label="What was the idea?"
                  value={currentReview.idea}
                  onChange={(v) => updateReview(currentGroup.exitTime, { idea: v })}
                  placeholder="What setup or signal triggered this trade..."
                />
                <ReviewField
                  label="Was it coherent with your plan?"
                  value={currentReview.coherent}
                  onChange={(v) => updateReview(currentGroup.exitTime, { coherent: v })}
                  placeholder="Did this match your strategy rules..."
                />
                <ReviewField
                  label="Execution notes"
                  value={currentReview.executionNotes}
                  onChange={(v) => updateReview(currentGroup.exitTime, { executionNotes: v })}
                  placeholder="Entry timing, sizing, management..."
                />
              </div>
            </>
          )}

          {step === "day" && (
            <>
              <div className="text-center space-y-1">
                <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>Day Summary</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>{day.date} ({day.dayName})</p>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "P&L", value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? "#3fb950" : "#f85149" },
                  { label: "Win Rate", value: `${stats.winRate.toFixed(0)}%`, color: "rgba(255,255,255,0.85)" },
                  { label: "Trades", value: `${stats.totalTrades}`, color: "rgba(255,255,255,0.6)" },
                  { label: "PF", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: "rgba(255,255,255,0.85)" },
                ].map((s) => (
                  <div key={s.label} className="text-center py-2.5 rounded-md" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[14px] font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Day rating */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Overall Day Rating</label>
                <div className="flex gap-1.5 mt-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDayRating(n)}
                      className="text-[24px] transition-transform hover:scale-110"
                      style={{ color: n <= dayRating ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)" }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Day notes */}
              <ReviewField
                label="What to improve? Key takeaway?"
                value={dayNotes}
                onChange={setDayNotes}
                placeholder="What went well, what to work on next session..."
                rows={3}
              />

              {/* User ID display */}
              {showUserId && (
                <div className="rounded-md p-3 text-center space-y-1" style={{
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>Your review code (save this to retrieve your journal):</p>
                  <p className="text-[16px] font-mono font-bold tracking-wide" style={{ color: "rgba(255,255,255,0.95)" }}>{userInfo.id}</p>
                  {userInfo.isNew && (
                    <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>First review! This code is saved in your browser.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — navigation */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(0,0,0,0.2)",
        }}>
          <button
            onClick={handlePrev}
            disabled={step === "trades" && currentGroupIdx === 0}
            className="text-[10px] font-mono px-3 py-1.5 rounded transition-colors disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Previous
          </button>

          <div className="flex-1" />

          {step === "day" && !saved && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="text-[11px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{
                background: saving ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {saving ? "Saving..." : "Submit Review"}
            </button>
          )}

          {saved && (
            <button
              onClick={onClose}
              className="text-[11px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{ background: "rgba(255, 255, 255, 0.12)", border: "1px solid rgba(255, 255, 255, 0.25)", color: "rgba(255,255,255,0.9)" }}
            >
              Done
            </button>
          )}

          {step === "trades" && (
            <button
              onClick={handleNext}
              className="text-[11px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{ background: "rgba(255, 255, 255, 0.12)", border: "1px solid rgba(255, 255, 255, 0.25)", color: "rgba(255,255,255,0.9)" }}
            >
              {currentGroupIdx < tradeGroups.length - 1 ? "Next Trade" : "Day Summary"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewField({ label, value, onChange, placeholder, rows = 2 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full mt-1.5 text-[11px] font-mono px-3 py-2 rounded-md bg-transparent outline-none resize-none"
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.85)",
          background: "rgba(255,255,255,0.02)",
        }}
        onFocus={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.25)"; }}
        onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
      />
    </div>
  );
}
