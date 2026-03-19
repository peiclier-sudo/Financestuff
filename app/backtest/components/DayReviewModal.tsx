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
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(16px) saturate(0.8)" }}>
      <div
        className="w-[90vw] max-w-[700px] max-h-[85vh] flex flex-col rounded-xl overflow-hidden float-in"
        style={{
          background: "linear-gradient(160deg, rgba(12, 15, 21, 0.92), rgba(18, 22, 30, 0.85))",
          backdropFilter: "blur(32px) saturate(1.4)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
        }}>
          <div className="flex gap-1.5">
            <div className="w-[8px] h-[8px] rounded-full cursor-pointer hover:opacity-100" style={{ background: "rgba(255, 255, 255, 0.2)" }} onClick={onClose} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.12)" }} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.06)" }} />
          </div>
          <div className="w-px h-4 bg-[var(--border)]" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
            Review Your Day
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">{day.date}</span>
          {/* Progress */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1">
              {tradeGroups.map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                  style={{
                    background: step === "trades" && i === currentGroupIdx
                      ? "#58a6ff"
                      : i < currentGroupIdx || step === "day"
                        ? "#3fb950"
                        : "rgba(255,255,255,0.15)",
                  }}
                  onClick={() => { setStep("trades"); setCurrentGroupIdx(i); }}
                />
              ))}
              <div
                className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                style={{ background: step === "day" ? "#58a6ff" : "rgba(255,255,255,0.15)" }}
                onClick={() => setStep("day")}
              />
            </div>
            <span className="text-[9px] text-[var(--text-dim)]">
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
                <div className="text-[11px] font-mono px-2 py-0.5 rounded" style={{
                  background: groupPnl >= 0 ? "rgba(63,185,80,0.1)" : "rgba(248,81,73,0.1)",
                  border: `1px solid ${groupPnl >= 0 ? "rgba(63,185,80,0.2)" : "rgba(248,81,73,0.2)"}`,
                  color: groupPnl >= 0 ? "#3fb950" : "#f85149",
                }}>
                  {groupPnl >= 0 ? "+" : ""}${groupPnl.toFixed(2)}
                </div>
                <span className="text-[10px] text-[var(--text-dim)]">
                  {currentGroup.trades.length} {currentGroup.trades.length === 1 ? "entry" : "entries"} — Exit @ {currentGroup.trades[0].exitPrice.toFixed(1)}
                </span>
              </div>

              {/* Trades table */}
              <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      <th className="text-left px-3 py-1.5 text-[var(--text-dim)] font-medium">Dir</th>
                      <th className="text-right px-3 py-1.5 text-[var(--text-dim)] font-medium">Entry</th>
                      <th className="text-right px-3 py-1.5 text-[var(--text-dim)] font-medium">Exit</th>
                      <th className="text-right px-3 py-1.5 text-[var(--text-dim)] font-medium">P&L</th>
                      <th className="text-right px-3 py-1.5 text-[var(--text-dim)] font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentGroup.trades.map((t) => (
                      <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-3 py-1.5" style={{ color: t.direction === "long" ? "#3fb950" : "#f85149" }}>
                          {t.direction === "long" ? "LONG" : "SHORT"}
                        </td>
                        <td className="text-right px-3 py-1.5 text-[var(--text)]">{t.entryPrice.toFixed(1)}</td>
                        <td className="text-right px-3 py-1.5 text-[var(--text)]">{t.exitPrice.toFixed(1)}</td>
                        <td className="text-right px-3 py-1.5" style={{ color: t.pnlPoints >= 0 ? "#3fb950" : "#f85149" }}>
                          {t.pnlPoints >= 0 ? "+" : ""}${t.pnlPoints.toFixed(2)}
                        </td>
                        <td className="text-right px-3 py-1.5 text-[var(--text-dim)] uppercase">{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rating */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">Execution Rating</label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateReview(currentGroup.exitTime, { rating: n })}
                      className="text-[18px] transition-transform hover:scale-110"
                      style={{ color: n <= currentReview.rating ? "#e3b341" : "rgba(255,255,255,0.15)" }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">Tags</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {REVIEW_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(currentGroup.exitTime, tag)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-colors"
                      style={{
                        background: currentReview.tags.has(tag) ? "rgba(88, 166, 255, 0.15)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${currentReview.tags.has(tag) ? "rgba(88, 166, 255, 0.3)" : "rgba(255,255,255,0.08)"}`,
                        color: currentReview.tags.has(tag) ? "#58a6ff" : "#7d8590",
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  {currentReview.customTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => removeCustomTag(currentGroup.exitTime, tag)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(210, 168, 255, 0.15)",
                        border: "1px solid rgba(210, 168, 255, 0.3)",
                        color: "#d2a8ff",
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
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-transparent outline-none w-16"
                      style={{ border: "1px dashed rgba(255,255,255,0.1)", color: "#7d8590" }}
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
                <p className="text-[13px] font-semibold text-[var(--text)]">Day Summary</p>
                <p className="text-[10px] text-[var(--text-dim)]">{day.date} ({day.dayName})</p>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "P&L", value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? "#3fb950" : "#f85149" },
                  { label: "Win Rate", value: `${stats.winRate.toFixed(0)}%`, color: "#58a6ff" },
                  { label: "Trades", value: `${stats.totalTrades}`, color: "#7d8590" },
                  { label: "PF", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: "#e3b341" },
                ].map((s) => (
                  <div key={s.label} className="text-center py-2 rounded-md" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="text-[14px] font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[8px] uppercase tracking-wider text-[var(--text-dim)]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Day rating */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">Overall Day Rating</label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDayRating(n)}
                      className="text-[22px] transition-transform hover:scale-110"
                      style={{ color: n <= dayRating ? "#e3b341" : "rgba(255,255,255,0.15)" }}
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
                  background: "rgba(63, 185, 80, 0.08)",
                  border: "1px solid rgba(63, 185, 80, 0.2)",
                }}>
                  <p className="text-[10px] text-[var(--text-dim)]">Your review code (save this to retrieve your journal):</p>
                  <p className="text-[16px] font-mono font-bold text-[#3fb950] tracking-wide">{userInfo.id}</p>
                  {userInfo.isNew && (
                    <p className="text-[9px] text-[var(--text-dim)]">First review! This code is saved in your browser.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — navigation */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.04)",
          background: "rgba(0,0,0,0.15)",
        }}>
          <button
            onClick={handlePrev}
            disabled={step === "trades" && currentGroupIdx === 0}
            className="text-[10px] font-mono px-3 py-1.5 rounded transition-colors disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.06)", color: "#7d8590", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Previous
          </button>

          <div className="flex-1" />

          {step === "day" && !saved && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="text-[10px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{
                background: saving ? "rgba(63, 185, 80, 0.2)" : "rgba(63, 185, 80, 0.15)",
                border: "1px solid rgba(63, 185, 80, 0.3)",
                color: "#3fb950",
              }}
            >
              {saving ? "Saving..." : "Submit Review"}
            </button>
          )}

          {saved && (
            <button
              onClick={onClose}
              className="text-[10px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{ background: "rgba(88, 166, 255, 0.15)", border: "1px solid rgba(88, 166, 255, 0.3)", color: "#58a6ff" }}
            >
              Done
            </button>
          )}

          {step === "trades" && (
            <button
              onClick={handleNext}
              className="text-[10px] font-mono font-semibold px-4 py-1.5 rounded transition-colors"
              style={{ background: "rgba(88, 166, 255, 0.15)", border: "1px solid rgba(88, 166, 255, 0.3)", color: "#58a6ff" }}
            >
              {currentGroupIdx < tradeGroups.length - 1 ? "Next Trade" : "Day Summary"}
            </button>
          )}

          {step === "day" && !saved && (
            <button
              onClick={handleNext}
              disabled
              className="text-[10px] font-mono px-3 py-1.5 rounded opacity-0 pointer-events-none"
            >
              &nbsp;
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
      <label className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-semibold">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full mt-1 text-[11px] font-mono px-3 py-2 rounded-md bg-transparent outline-none resize-none"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--text)",
          background: "rgba(255,255,255,0.02)",
        }}
        onFocus={(e) => { e.target.style.borderColor = "rgba(88, 166, 255, 0.3)"; }}
        onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
      />
    </div>
  );
}
