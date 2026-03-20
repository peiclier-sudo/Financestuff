"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { TradingDay } from "@/lib/types";
import { parseCSV, groupIntoDays } from "@/lib/dataUtils";
import {
  Order,
  Position,
  ClosedTrade,
  PoolFilter,
  DEFAULT_POOL_FILTER,
  DaySignatureStats,
} from "@/lib/backtestTypes";
import {
  findMatchingDays,
  computeSignatureStats,
  filterDayPool,
  pickRandomDay,
} from "@/lib/backtestStats";
import ReplayChart from "./components/ReplayChart";
import DayCharacteristics from "./components/DayCharacteristics";
import HourlyStats from "./components/HourlyStats";
import OrderPanel from "./components/OrderPanel";
import PerformanceOverlay from "./components/PerformanceOverlay";
import DayReviewModal from "./components/DayReviewModal";
import ChallengeReviewModal from "./components/ChallengeReviewModal";
import DayPoolFilter from "./components/DayPoolFilter";
import {
  ChallengeState,
  ChallengeTarget,
  saveChallenge,
  loadChallenge,
  clearChallenge,
  countExitEvents,
} from "@/lib/challengeTypes";

let idCounter = 0;
function genId() {
  return `id_${Date.now()}_${++idCounter}`;
}

export default function BacktestPage() {
  const [allDays, setAllDays] = useState<TradingDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Replay state
  const [currentDay, setCurrentDay] = useState<TradingDay | null>(null);
  const [revealedBarCount, setRevealedBarCount] = useState(1);
  const [dayComplete, setDayComplete] = useState(false);

  // Orders & positions
  const [orders, setOrders] = useState<Order[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);

  // Cumulative session stats (persists across days)
  const [sessionTrades, setSessionTrades] = useState<ClosedTrade[]>([]);

  // Trading size (points per unit)
  const [tradingSize, setTradingSize] = useState(1);

  // Performance overlay
  const [showPerformance, setShowPerformance] = useState(false);

  // Day review
  const [showReview, setShowReview] = useState(false);
  const [reviewFocusRange, setReviewFocusRange] = useState<{ entryTime: number; exitTime: number } | null>(null);

  // Challenge mode
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [showChallengeReview, setShowChallengeReview] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Load challenge from localStorage on mount
  useEffect(() => {
    const saved = loadChallenge();
    if (saved && !saved.complete) setChallenge(saved);
  }, []);

  // Pool filter
  const [poolFilter, setPoolFilter] = useState<PoolFilter>(DEFAULT_POOL_FILTER);
  const [showFilter, setShowFilter] = useState(false);

  // Load data
  useEffect(() => {
    fetch("/NASDAQ_5min_NDX_From_2015.csv")
      .then((res) => {
        if (!res.ok) throw new Error("CSV not found");
        return res.text();
      })
      .then((text) => {
        const bars = parseCSV(text);
        const days = groupIntoDays(bars);
        setAllDays(days);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Filtered pool
  const dayPool = useMemo(() => filterDayPool(allDays, poolFilter), [allDays, poolFilter]);

  // Day signature stats (retroactive)
  const signatureStats: DaySignatureStats = useMemo(() => {
    if (!currentDay) {
      return {
        sampleSize: 0, bullishPct: 0, bearishPct: 0,
        avgCloseLocation: 0, medianCloseLocation: 0,
        avgChangePercent: 0, medianChangePercent: 0,
        avgRangePercent: 0, medianRangePercent: 0,
        gapFillPct: 0, hourlyBuckets: [],
      };
    }
    const matching = findMatchingDays(allDays, currentDay);
    return computeSignatureStats(matching);
  }, [currentDay, allDays]);

  // Compute previous day ATR (true range = max(H-L, |H-prevC|, |L-prevC|))
  const prevDayATR = useMemo(() => {
    if (!currentDay) return null;
    const { prevDayHigh, prevDayLow, prevClose } = currentDay;
    if (prevDayHigh == null || prevDayLow == null) return null;
    // Simple: use previous day's range (high - low)
    // For true ATR we'd need prevClose of the day before prev, so use range
    const range = prevDayHigh - prevDayLow;
    if (prevClose != null) {
      // True Range = max(H-L, |H-prevC|, |L-prevC|)
      // But here prevClose IS the previous day's close, and prevDayHigh/Low are prev day's H/L
      // So true range of the previous day = max(prevDayH - prevDayL, ...)
      // prevClose of the day before the previous day isn't available, so just use range
      return range;
    }
    return range;
  }, [currentDay]);

  // Pick a new random day
  const newRandomDay = useCallback(() => {
    const day = pickRandomDay(dayPool);
    if (!day) return;
    setCurrentDay(day);
    setRevealedBarCount(1);
    setDayComplete(false);
    setOrders([]);
    setPositions([]);
    setClosedTrades([]);
  }, [dayPool]);

  // Start a challenge
  const startChallenge = useCallback((target: ChallengeTarget) => {
    const state: ChallengeState = {
      id: `ch_${Date.now()}`,
      target,
      startedAt: Date.now(),
      tradingSize,
      days: [],
      allTrades: [],
      totalExits: 0,
      complete: false,
    };
    setChallenge(state);
    saveChallenge(state);
    setSessionTrades([]);
    // Start first day
    const day = pickRandomDay(dayPool);
    if (day) {
      setCurrentDay(day);
      setRevealedBarCount(1);
      setDayComplete(false);
      setOrders([]);
      setPositions([]);
      setClosedTrades([]);
    }
  }, [dayPool, tradingSize]);

  // Quit challenge
  const quitChallenge = useCallback(() => {
    clearChallenge();
    setChallenge(null);
    setShowQuitConfirm(false);
    setSessionTrades([]);
  }, []);

  // Advance one bar
  const advanceBar = useCallback(() => {
    if (!currentDay || dayComplete) return;

    const newCount = revealedBarCount + 1;
    const totalBars = currentDay.bars.length;

    if (newCount > totalBars) return;

    const newBar = currentDay.bars[newCount - 1];
    const barHigh = newBar.high;
    const barLow = newBar.low;
    const barClose = newBar.close;
    const barTime = newBar.time;

    // Check pending orders for fills
    setOrders((prev) => {
      const updated = [...prev];
      const newPositions: Position[] = [];

      for (const order of updated) {
        if (order.status !== "pending") continue;

        let filled = false;
        let fillPrice = order.price;

        if (order.type === "limit") {
          if (order.direction === "long" && barLow <= order.price) filled = true;
          if (order.direction === "short" && barHigh >= order.price) filled = true;
        } else if (order.type === "stop") {
          if (order.direction === "long" && barHigh >= order.price) filled = true;
          if (order.direction === "short" && barLow <= order.price) filled = true;
        }

        if (filled) {
          order.status = "filled";
          order.filledAt = barTime;
          order.filledPrice = fillPrice;
          newPositions.push({
            id: genId(),
            orderId: order.id,
            direction: order.direction,
            entryPrice: fillPrice,
            entryTime: barTime,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
          });
        }
      }

      if (newPositions.length > 0) {
        setPositions((p) => [...p, ...newPositions]);
      }

      return updated;
    });

    // Check positions for SL/TP hits
    setPositions((prev) => {
      const remaining: Position[] = [];
      const newClosed: ClosedTrade[] = [];

      for (const pos of prev) {
        let closed = false;
        let exitPrice = barClose;
        let exitReason: ClosedTrade["exitReason"] = "eod";

        if (pos.stopLoss != null) {
          if (pos.direction === "long" && barLow <= pos.stopLoss) {
            closed = true;
            exitPrice = pos.stopLoss;
            exitReason = "sl";
          } else if (pos.direction === "short" && barHigh >= pos.stopLoss) {
            closed = true;
            exitPrice = pos.stopLoss;
            exitReason = "sl";
          }
        }

        if (!closed && pos.takeProfit != null) {
          if (pos.direction === "long" && barHigh >= pos.takeProfit) {
            closed = true;
            exitPrice = pos.takeProfit;
            exitReason = "tp";
          } else if (pos.direction === "short" && barLow <= pos.takeProfit) {
            closed = true;
            exitPrice = pos.takeProfit;
            exitReason = "tp";
          }
        }

        if (closed) {
          const mult = pos.direction === "long" ? 1 : -1;
          const pnlPoints = (exitPrice - pos.entryPrice) * mult;
          newClosed.push({
            id: genId(),
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            entryTime: pos.entryTime,
            exitPrice,
            exitTime: barTime,
            pnlPoints: pnlPoints * tradingSize,
            pnlPercent: (pnlPoints / pos.entryPrice) * 100,
            exitReason,
          });
        } else {
          remaining.push(pos);
        }
      }

      if (newClosed.length > 0) {
        setClosedTrades((ct) => [...ct, ...newClosed]);
        setSessionTrades((st) => [...st, ...newClosed]);
      }

      return remaining;
    });

    setRevealedBarCount(newCount);

    // Check if day is complete
    if (newCount >= totalBars) {
      setPositions((prev) => {
        if (prev.length === 0) return prev;
        const eodTrades: ClosedTrade[] = prev.map((pos) => {
          const mult = pos.direction === "long" ? 1 : -1;
          const pnlPoints = (barClose - pos.entryPrice) * mult;
          return {
            id: genId(),
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            entryTime: pos.entryTime,
            exitPrice: barClose,
            exitTime: barTime,
            pnlPoints: pnlPoints * tradingSize,
            pnlPercent: (pnlPoints / pos.entryPrice) * 100,
            exitReason: "eod" as const,
          };
        });
        setClosedTrades((ct) => [...ct, ...eodTrades]);
        setSessionTrades((st) => [...st, ...eodTrades]);
        return [];
      });

      setOrders((prev) => prev.map((o) => o.status === "pending" ? { ...o, status: "cancelled" as const } : o));
      setDayComplete(true);
    }
  }, [currentDay, revealedBarCount, dayComplete, tradingSize]);

  // Challenge: track exits in real-time, complete when target reached AND no open positions remain
  const prevClosedTradesLenRef = useRef(0);
  useEffect(() => {
    if (!challenge || challenge.complete) return;
    if (closedTrades.length === 0) return;

    // Count current day's exit events
    const dayExits = countExitEvents(closedTrades);
    const totalExits = challenge.totalExits + dayExits;

    if (totalExits >= challenge.target && positions.length === 0) {
      // Target reached AND all positions are closed — finalize challenge
      const updatedChallenge: ChallengeState = {
        ...challenge,
        days: [...challenge.days, {
          date: currentDay!.date,
          dayName: currentDay!.dayName,
          changePercent: currentDay!.changePercent,
          rangePercent: currentDay!.rangePercent,
          trades: closedTrades,
          exitCount: dayExits,
        }],
        allTrades: [...challenge.allTrades, ...closedTrades],
        totalExits,
        complete: true,
      };
      setChallenge(updatedChallenge);
      saveChallenge(updatedChallenge);
      setDayComplete(true);
      setShowChallengeReview(true);
    }
  }, [closedTrades, challenge, currentDay, positions.length]);

  // Challenge: record day on day complete (only if challenge not already completed mid-day)
  const challengeDayRecordedRef = useRef(false);
  useEffect(() => {
    if (!dayComplete || !challenge || challenge.complete || challengeDayRecordedRef.current) return;
    const timer = setTimeout(() => {
      setClosedTrades((currentDayTrades) => {
        if (currentDayTrades.length > 0) {
          const exitCount = countExitEvents(currentDayTrades);
          const updatedChallenge: ChallengeState = {
            ...challenge,
            days: [...challenge.days, {
              date: currentDay!.date,
              dayName: currentDay!.dayName,
              changePercent: currentDay!.changePercent,
              rangePercent: currentDay!.rangePercent,
              trades: currentDayTrades,
              exitCount,
            }],
            allTrades: [...challenge.allTrades, ...currentDayTrades],
            totalExits: challenge.totalExits + exitCount,
            complete: false,
          };
          setChallenge(updatedChallenge);
          saveChallenge(updatedChallenge);
        }
        return currentDayTrades;
      });
      challengeDayRecordedRef.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, [dayComplete, challenge, currentDay]);

  // Reset the recorded flag when day changes
  useEffect(() => {
    challengeDayRecordedRef.current = false;
  }, [currentDay?.date]);

  // Challenge: auto-advance to next day (only if not complete, not reviewing)
  const challengeNextDay = useCallback(() => {
    if (!challenge || challenge.complete) return;
    const day = pickRandomDay(dayPool);
    if (day) {
      setCurrentDay(day);
      setRevealedBarCount(1);
      setDayComplete(false);
      setOrders([]);
      setPositions([]);
      setClosedTrades([]);
    }
  }, [challenge, dayPool]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

      if (e.key === "Escape") {
        setShowPerformance(false);
        return;
      }

      if (showPerformance) return; // Don't process other keys when overlay is open

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advanceBar();
      } else if (e.key === "m" || e.key === "M") {
        if (currentDay && !dayComplete) {
          const price = currentDay.bars[revealedBarCount - 1]?.close;
          if (price) handlePlaceOrder(price, "long", "market");
        }
      } else if (e.key === "n" || e.key === "N") {
        if (currentDay && !dayComplete) {
          const price = currentDay.bars[revealedBarCount - 1]?.close;
          if (price) handlePlaceOrder(price, "short", "market");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advanceBar, currentDay, revealedBarCount, dayComplete, showPerformance]);

  // Order handlers
  const handlePlaceOrder = useCallback((price: number, direction: "long" | "short", type: "limit" | "stop" | "market") => {
    if (!currentDay || dayComplete) return;

    const order: Order = {
      id: genId(),
      type,
      direction,
      price,
      stopLoss: null,
      takeProfit: null,
      status: "pending",
    };

    if (type === "market") {
      const currentBar = currentDay.bars[revealedBarCount - 1];
      order.status = "filled";
      order.filledAt = currentBar.time;
      order.filledPrice = currentBar.close;

      setOrders((prev) => [...prev, order]);
      setPositions((prev) => {
        // Auto-inherit unified SL/TP from existing positions
        let inheritedSL: number | null = null;
        let inheritedTP: number | null = null;
        if (prev.length > 0) {
          const allSameSL = prev.every((p) => p.stopLoss != null && p.stopLoss === prev[0].stopLoss);
          if (allSameSL && prev[0].stopLoss != null) inheritedSL = prev[0].stopLoss;
          const allSameTP = prev.every((p) => p.takeProfit != null && p.takeProfit === prev[0].takeProfit);
          if (allSameTP && prev[0].takeProfit != null) inheritedTP = prev[0].takeProfit;
        }
        const position: Position = {
          id: genId(),
          orderId: order.id,
          direction,
          entryPrice: currentBar.close,
          entryTime: currentBar.time,
          stopLoss: inheritedSL,
          takeProfit: inheritedTP,
        };
        return [...prev, position];
      });
    } else {
      setOrders((prev) => [...prev, order]);
    }
  }, [currentDay, revealedBarCount, dayComplete]);

  const handleCancelOrder = useCallback((id: string) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "cancelled" as const } : o));
  }, []);

  const handleClosePosition = useCallback((id: string) => {
    if (!currentDay) return;
    const currentBar = currentDay.bars[revealedBarCount - 1];

    setPositions((prev) => {
      const pos = prev.find((p) => p.id === id);
      if (!pos) return prev;

      const mult = pos.direction === "long" ? 1 : -1;
      const pnlPoints = (currentBar.close - pos.entryPrice) * mult;
      const trade: ClosedTrade = {
        id: genId(),
        direction: pos.direction,
        entryPrice: pos.entryPrice,
        entryTime: pos.entryTime,
        exitPrice: currentBar.close,
        exitTime: currentBar.time,
        pnlPoints: pnlPoints * tradingSize,
        pnlPercent: (pnlPoints / pos.entryPrice) * 100,
        exitReason: "manual",
      };

      setClosedTrades((ct) => [...ct, trade]);
      setSessionTrades((st) => [...st, trade]);
      return prev.filter((p) => p.id !== id);
    });
  }, [currentDay, revealedBarCount, tradingSize]);

  const handleUpdatePositionSL = useCallback((id: string, sl: number | null) => {
    setPositions((prev) => prev.map((p) => p.id === id ? { ...p, stopLoss: sl } : p));
  }, []);

  const handleUpdatePositionTP = useCallback((id: string, tp: number | null) => {
    setPositions((prev) => prev.map((p) => p.id === id ? { ...p, takeProfit: tp } : p));
  }, []);

  // Unified SL/TP update for all positions
  const handleUpdateAllSL = useCallback((sl: number | null) => {
    setPositions((prev) => prev.map((p) => ({ ...p, stopLoss: sl })));
  }, []);

  const handleUpdateAllTP = useCallback((tp: number | null) => {
    setPositions((prev) => prev.map((p) => ({ ...p, takeProfit: tp })));
  }, []);

  const handleUpdateOrderPrice = useCallback((id: string, price: number) => {
    setOrders((prev) => prev.map((o) => o.id === id && o.status === "pending" ? { ...o, price } : o));
  }, []);

  const handleUpdateOrderSL = useCallback((id: string, sl: number | null) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, stopLoss: sl } : o));
  }, []);

  const handleUpdateOrderTP = useCallback((id: string, tp: number | null) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, takeProfit: tp } : o));
  }, []);

  // Session totals
  const sessionPnl = sessionTrades.reduce((s, t) => s + t.pnlPoints, 0);
  const sessionWins = sessionTrades.filter((t) => t.pnlPoints > 0).length;

  const currentBar = currentDay && revealedBarCount > 0 ? currentDay.bars[revealedBarCount - 1] : null;
  const progress = currentDay ? Math.round((revealedBarCount / currentDay.bars.length) * 100) : 0;

  // Data-reactive market state — shifts UI accent colors
  useEffect(() => {
    if (!currentDay || !currentBar) {
      delete document.body.dataset.market;
      return;
    }
    const dayOpen = currentDay.bars[0].open;
    if (currentBar.close > dayOpen * 1.001) {
      document.body.dataset.market = "bull";
    } else if (currentBar.close < dayOpen * 0.999) {
      document.body.dataset.market = "bear";
    } else {
      delete document.body.dataset.market;
    }
    return () => { delete document.body.dataset.market; };
  }, [currentBar, currentDay]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-white/40 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">Loading NASDAQ data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="bg-[var(--surface)] border border-[var(--red-dim)] rounded-lg p-8 max-w-md text-center">
          <p className="text-[var(--red)] font-semibold mb-2">Error</p>
          <p className="text-[var(--text-muted)] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-3" style={{ background: "rgba(12, 15, 21, 0.6)", backdropFilter: "blur(16px) saturate(1.3)", borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
        <Link href="/" className="text-[10px] text-[var(--text-dim)] hover:text-white transition-colors">
          &larr; Home
        </Link>
        <div className="w-px h-4 bg-[var(--border)]" />

        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full glow-dot" style={{ background: "rgba(255,255,255,0.6)", color: "rgba(255,255,255,0.6)" }} />
          <h1 className="font-display text-xs font-bold tracking-tight text-[var(--text)]">Manual Backtest</h1>
        </div>

        <div className="w-px h-4 bg-[var(--border)]" />

        {!challenge ? (
          <>
            <button onClick={newRandomDay} className="btn-primary text-[10px] py-1 px-3">
              New Random Day
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => startChallenge(15)}
                className="text-[10px] py-1 px-2 rounded transition-colors text-[var(--text-dim)] hover:text-white hover:bg-white/10">
                Challenge 15
              </button>
              <button onClick={() => startChallenge(30)}
                className="text-[10px] py-1 px-2 rounded transition-colors text-[var(--text-dim)] hover:text-white hover:bg-white/10">
                Challenge 30
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Challenge progress bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                CHALLENGE {challenge.target}
              </span>
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, (challenge.totalExits / challenge.target) * 100)}%`,
                  background: "rgba(255,255,255,0.7)",
                }} />
              </div>
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                {challenge.totalExits}/{challenge.target}
              </span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                Day {challenge.days.length + (dayComplete ? 0 : 1)}
              </span>
            </div>
            {dayComplete && !challenge.complete && (
              <button onClick={challengeNextDay} className="btn-primary text-[10px] py-1 px-3">
                Next Day
              </button>
            )}
            <button onClick={() => setShowQuitConfirm(true)}
              className="text-[9px] py-0.5 px-2 rounded transition-colors text-[var(--text-dim)] hover:text-[#f85149]">
              Quit
            </button>
          </>
        )}

        <button
          onClick={() => setShowFilter((f) => !f)}
          className={`text-[10px] py-1 px-2 rounded transition-colors ${showFilter ? "text-white bg-white/10" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
        >
          Filter
        </button>

        {currentDay && (
          <>
            <div className="w-px h-4 bg-[var(--border)]" />
            <span className="text-[10px] font-mono text-[var(--text-dim)]">
              {revealedBarCount}/{currentDay.bars.length} ({progress}%)
            </span>
            {dayComplete && (
              <span className="text-[10px] font-semibold text-[var(--text)]">Day Complete</span>
            )}
          </>
        )}

        {/* Session / Challenge summary */}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {challenge ? (
            <>
              {challenge.allTrades.length > 0 && (() => {
                const chPnl = challenge.allTrades.reduce((s, t) => s + t.pnlPoints, 0);
                const chWins = challenge.allTrades.filter((t) => t.pnlPoints > 0).length;
                return (
                  <>
                    <span className="text-[var(--text-dim)]">
                      {challenge.allTrades.length} trades | {((chWins / challenge.allTrades.length) * 100).toFixed(0)}% win
                    </span>
                    <span className="font-mono font-semibold" style={{ color: chPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                      {chPnl >= 0 ? "+" : ""}${chPnl.toFixed(1)}
                    </span>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {sessionTrades.length > 0 && (
                <>
                  <span className="text-[var(--text-dim)]">
                    Session: {sessionTrades.length} trades | {((sessionWins / sessionTrades.length) * 100).toFixed(0)}% win
                  </span>
                  <span className="font-mono font-semibold" style={{ color: sessionPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(1)}
                  </span>
                </>
              )}
            </>
          )}
          <span className="text-[var(--text-dim)]">
            Space/&rarr; = next bar | M = buy | N = sell | Shift+click = order
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Chart Area */}
        <div className="flex-1 min-w-0 relative dot-grid">
          {currentDay ? (
            <ReplayChart
              bars={currentDay.bars}
              revealedCount={revealedBarCount}
              prevClose={currentDay.prevClose}
              orders={orders}
              positions={positions}
              closedTrades={closedTrades}
              onPlaceOrder={handlePlaceOrder}
              onUpdatePositionSL={handleUpdatePositionSL}
              onUpdatePositionTP={handleUpdatePositionTP}
              onUpdateAllSL={handleUpdateAllSL}
              onUpdateAllTP={handleUpdateAllTP}
              onUpdateOrderPrice={handleUpdateOrderPrice}
              onUpdateOrderSL={handleUpdateOrderSL}
              onUpdateOrderTP={handleUpdateOrderTP}
              prevDayATR={prevDayATR}
              tradingSize={tradingSize}
              onTradingSizeChange={setTradingSize}
              focusRange={reviewFocusRange}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center fade-in">
                <div className="w-12 h-12 rounded-full border-2 border-[var(--border-bright)] flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <p className="text-[var(--text-muted)] text-sm mb-1">Click &quot;New Random Day&quot; to start</p>
                <p className="text-[var(--text-dim)] text-[10px]">Practice trading on random historical NDX days</p>
              </div>
            </div>
          )}

          {/* Action buttons — bottom-right, offset from axis */}
          {currentDay && !dayComplete && (
            <div className="absolute bottom-10 z-40 flex items-center gap-2" style={{ right: "96px" }}>
              <button
                onClick={() => {
                  const price = currentDay.bars[revealedBarCount - 1]?.close;
                  if (price) handlePlaceOrder(price, "long", "market");
                }}
                className="action-btn-buy font-display px-5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 230, 118, 0.15), rgba(63, 185, 80, 0.08))",
                  color: "#3fb950",
                  border: "1px solid rgba(63, 185, 80, 0.25)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 0 20px rgba(63, 185, 80, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                BUY <span className="text-[9px] opacity-50 ml-1">M</span>
              </button>
              <button
                onClick={advanceBar}
                className="font-display px-6 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03))",
                  color: "rgba(255, 255, 255, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 0 20px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                Next &rarr;
              </button>
              <button
                onClick={() => {
                  const price = currentDay.bars[revealedBarCount - 1]?.close;
                  if (price) handlePlaceOrder(price, "short", "market");
                }}
                className="action-btn-sell font-display px-5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(255, 82, 82, 0.15), rgba(248, 81, 73, 0.08))",
                  color: "#f85149",
                  border: "1px solid rgba(248, 81, 73, 0.25)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 0 20px rgba(248, 81, 73, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                SELL <span className="text-[9px] opacity-50 ml-1">N</span>
              </button>
            </div>
          )}

          {/* Day complete overlay showing the date */}
          {dayComplete && currentDay && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-40 glass-panel-sm px-4 py-3 text-center slide-in">
              <p className="text-[11px] text-[var(--text-muted)]">Day revealed:</p>
              <p className="text-sm font-bold text-[var(--text)]">{currentDay.date} ({currentDay.dayName})</p>
              <p className="text-[11px] font-mono mt-1" style={{ color: currentDay.changePercent >= 0 ? "var(--green)" : "var(--red)" }}>
                {currentDay.changePercent >= 0 ? "+" : ""}{currentDay.changePercent.toFixed(2)}% | Range: {currentDay.rangePercent.toFixed(2)}%
              </p>
              {closedTrades.length > 0 && (
                <button
                  onClick={() => setShowReview(true)}
                  className="mt-2 text-[11px] font-mono font-semibold px-4 py-1.5 rounded transition-colors hover:brightness-110"
                  style={{
                    background: "rgba(255, 255, 255, 0.10)",
                    border: "1px solid rgba(255, 255, 255, 0.20)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  Review Your Day
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Panel (~30%) */}
        <div className="w-[420px] flex-shrink-0 border-l overflow-y-auto overflow-x-hidden" style={{ background: "rgba(12, 15, 21, 0.5)", borderColor: "rgba(255, 255, 255, 0.04)" }}>
          <div className="p-3 space-y-2 panel-focus-group">
            {/* Pool Filter (collapsible) */}
            {showFilter && (
              <SidePanel icon="&#9881;" title="Pool Filter" rgb="160, 170, 190">
                <DayPoolFilter
                  filter={poolFilter}
                  onChange={setPoolFilter}
                  poolSize={dayPool.length}
                  totalSize={allDays.length}
                />
              </SidePanel>
            )}

            {/* Day Characteristics & Stats */}
            {currentDay && (
              <SidePanel icon="&#9733;" title="Day Analysis" rgb="160, 170, 190">
                <DayCharacteristics day={currentDay} stats={signatureStats} />
              </SidePanel>
            )}

            {/* Hourly Stats */}
            {currentDay && signatureStats.sampleSize > 0 && (
              <SidePanel icon="&#9201;" title="Hourly Stats" rgb="160, 170, 190">
                <HourlyStats buckets={signatureStats.hourlyBuckets} />
              </SidePanel>
            )}

            {/* Orders & Trades */}
            <SidePanel icon="&#9670;" title="Trading" rgb="160, 170, 190">
              <OrderPanel
                orders={orders}
                positions={positions}
                closedTrades={closedTrades}
                sessionTrades={sessionTrades}
                currentBar={currentBar}
                onCancelOrder={handleCancelOrder}
                onClosePosition={handleClosePosition}
                onUpdatePositionSL={handleUpdatePositionSL}
                onUpdatePositionTP={handleUpdatePositionTP}
                onUpdateAllSL={handleUpdateAllSL}
                onUpdateAllTP={handleUpdateAllTP}
                onExpandResults={() => setShowPerformance(true)}
                tradingSize={tradingSize}
              />
            </SidePanel>
          </div>
        </div>
      </div>

      {/* Performance Overlay */}
      {showPerformance && (
        <PerformanceOverlay
          trades={sessionTrades}
          onClose={() => setShowPerformance(false)}
        />
      )}

      {/* Day Review Modal */}
      {showReview && currentDay && !challenge && (
        <DayReviewModal
          closedTrades={closedTrades}
          day={currentDay}
          tradingSize={tradingSize}
          onClose={() => { setShowReview(false); setReviewFocusRange(null); }}
          onFocusTrade={(entryTime, exitTime) => setReviewFocusRange({ entryTime, exitTime })}
        />
      )}

      {/* Challenge Review Modal */}
      {showChallengeReview && challenge && challenge.complete && (
        <ChallengeReviewModal
          challenge={challenge}
          onClose={() => {
            setShowChallengeReview(false);
            setReviewFocusRange(null);
            clearChallenge();
            setChallenge(null);
            setSessionTrades([]);
          }}
          onFocusTrade={(entryTime, exitTime) => setReviewFocusRange({ entryTime, exitTime })}
        />
      )}

      {/* Quit Challenge Confirmation */}
      {showQuitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="rounded-lg p-6 text-center max-w-sm" style={{
            background: "rgba(12, 15, 21, 0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}>
            <p className="text-[13px] font-semibold mb-2" style={{ color: "rgba(255,255,255,0.9)" }}>Quit Challenge?</p>
            <p className="text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
              Your progress ({challenge?.totalExits}/{challenge?.target} trades) will be lost.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowQuitConfirm(false)}
                className="text-[10px] font-mono px-4 py-1.5 rounded"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                Cancel
              </button>
              <button onClick={quitChallenge}
                className="text-[10px] font-mono font-semibold px-4 py-1.5 rounded"
                style={{ background: "rgba(248,81,73,0.15)", border: "1px solid rgba(248,81,73,0.3)", color: "#f85149" }}>
                Quit Challenge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// SidePanel — glassmorphism container matching dashboard panels
// ══════════════════════════════════════════════════════════

function SidePanel({ icon, title, rgb, children }: { icon: string; title: string; rgb: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg overflow-hidden panel-focus" style={{
      background: `linear-gradient(160deg, rgba(12, 15, 21, 0.72), rgba(18, 22, 30, 0.55))`,
      backdropFilter: "blur(20px) saturate(1.3)",
      WebkitBackdropFilter: "blur(20px) saturate(1.3)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderTopColor: `rgba(${rgb}, 0.2)`,
      boxShadow: `0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 20px rgba(${rgb}, 0.02)`,
    }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 select-none flex-shrink-0" style={{
        background: `linear-gradient(180deg, rgba(${rgb}, 0.04) 0%, transparent 100%)`,
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
      }}>
        <div className="flex gap-1">
          <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.12)" }} />
          <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.08)" }} />
          <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(255, 255, 255, 0.05)" }} />
        </div>
        <div className="w-px h-2.5" style={{ background: "rgba(255, 255, 255, 0.06)" }} />
        <span className="text-[8px] opacity-35" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: `rgba(${rgb}, 0.65)` }}>{title}</span>
      </div>
      {/* Content */}
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}
