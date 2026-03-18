"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import DayPoolFilter from "./components/DayPoolFilter";

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

        // Check stop loss
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

        // Check take profit (if not already stopped)
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
            pnlPoints,
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
      // Close all remaining positions at EOD
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
            pnlPoints,
            pnlPercent: (pnlPoints / pos.entryPrice) * 100,
            exitReason: "eod" as const,
          };
        });
        setClosedTrades((ct) => [...ct, ...eodTrades]);
        setSessionTrades((st) => [...st, ...eodTrades]);
        return [];
      });

      // Cancel pending orders
      setOrders((prev) => prev.map((o) => o.status === "pending" ? { ...o, status: "cancelled" as const } : o));
      setDayComplete(true);
    }
  }, [currentDay, revealedBarCount, dayComplete]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advanceBar();
      } else if (e.key === "m" || e.key === "M") {
        // Market buy
        if (currentDay && !dayComplete) {
          const price = currentDay.bars[revealedBarCount - 1]?.close;
          if (price) handlePlaceOrder(price, "long", "market");
        }
      } else if (e.key === "n" || e.key === "N") {
        // Market sell
        if (currentDay && !dayComplete) {
          const price = currentDay.bars[revealedBarCount - 1]?.close;
          if (price) handlePlaceOrder(price, "short", "market");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advanceBar, currentDay, revealedBarCount, dayComplete]);

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
      // Immediately fill at current bar close
      const currentBar = currentDay.bars[revealedBarCount - 1];
      order.status = "filled";
      order.filledAt = currentBar.time;
      order.filledPrice = currentBar.close;

      const position: Position = {
        id: genId(),
        orderId: order.id,
        direction,
        entryPrice: currentBar.close,
        entryTime: currentBar.time,
        stopLoss: null,
        takeProfit: null,
      };

      setOrders((prev) => [...prev, order]);
      setPositions((prev) => [...prev, position]);
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
        pnlPoints,
        pnlPercent: (pnlPoints / pos.entryPrice) * 100,
        exitReason: "manual",
      };

      setClosedTrades((ct) => [...ct, trade]);
      setSessionTrades((st) => [...st, trade]);
      return prev.filter((p) => p.id !== id);
    });
  }, [currentDay, revealedBarCount]);

  const handleUpdatePositionSL = useCallback((id: string, sl: number | null) => {
    setPositions((prev) => prev.map((p) => p.id === id ? { ...p, stopLoss: sl } : p));
  }, []);

  const handleUpdatePositionTP = useCallback((id: string, tp: number | null) => {
    setPositions((prev) => prev.map((p) => p.id === id ? { ...p, takeProfit: tp } : p));
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-3" />
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
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-3 border-b border-[var(--border)]" style={{ background: "var(--surface)" }}>
        <Link href="/" className="text-[10px] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors">
          &larr; Home
        </Link>
        <div className="w-px h-4 bg-[var(--border)]" />

        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-[var(--green)]" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[var(--green)] animate-ping opacity-30" />
          </div>
          <h1 className="text-xs font-bold tracking-tight text-[var(--text)]">Manual Backtest</h1>
        </div>

        <div className="w-px h-4 bg-[var(--border)]" />

        <button onClick={newRandomDay} className="btn-primary text-[10px] py-1 px-3">
          New Random Day
        </button>

        <button
          onClick={() => setShowFilter((f) => !f)}
          className={`text-[10px] py-1 px-2 rounded transition-colors ${showFilter ? "text-[var(--accent)] bg-[var(--accent)]/10" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
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
              <span className="text-[10px] font-semibold text-[var(--orange)]">Day Complete</span>
            )}
          </>
        )}

        {/* Session summary */}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {sessionTrades.length > 0 && (
            <>
              <span className="text-[var(--text-dim)]">
                Session: {sessionTrades.length} trades
                {sessionTrades.length > 0 && ` | ${((sessionWins / sessionTrades.length) * 100).toFixed(0)}% win`}
              </span>
              <span className="font-mono font-semibold" style={{ color: sessionPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                {sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(1)} pts
              </span>
            </>
          )}
          <span className="text-[var(--text-dim)]">
            Space/&rarr; = next bar | M = buy | N = sell | Shift+click = order
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Chart Area (left ~70%) */}
        <div className="flex-1 min-w-0 relative">
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
              onUpdateOrderPrice={handleUpdateOrderPrice}
              onUpdateOrderSL={handleUpdateOrderSL}
              onUpdateOrderTP={handleUpdateOrderTP}
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

          {/* Action buttons — bottom-right of chart */}
          {currentDay && !dayComplete && (
            <div className="absolute bottom-3 right-3 z-40 flex items-center gap-1.5">
              <button
                onClick={() => {
                  const price = currentDay.bars[revealedBarCount - 1]?.close;
                  if (price) handlePlaceOrder(price, "long", "market");
                }}
                className="px-3 py-1.5 rounded text-[11px] font-bold transition-colors"
                style={{ background: "#3fb95020", color: "#3fb950", border: "1px solid #3fb95040" }}
              >
                BUY
              </button>
              <button
                onClick={advanceBar}
                className="px-3 py-1.5 rounded text-[11px] font-bold transition-colors"
                style={{ background: "#58a6ff15", color: "#58a6ff", border: "1px solid #58a6ff40" }}
              >
                Next Bar &rarr;
              </button>
              <button
                onClick={() => {
                  const price = currentDay.bars[revealedBarCount - 1]?.close;
                  if (price) handlePlaceOrder(price, "short", "market");
                }}
                className="px-3 py-1.5 rounded text-[11px] font-bold transition-colors"
                style={{ background: "#f8514920", color: "#f85149", border: "1px solid #f8514940" }}
              >
                SHORT
              </button>
            </div>
          )}

          {/* Day complete overlay showing the date */}
          {dayComplete && currentDay && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 glass-panel-sm px-4 py-2 text-center slide-in">
              <p className="text-[11px] text-[var(--text-muted)]">Day revealed:</p>
              <p className="text-sm font-bold text-[var(--text)]">{currentDay.date} ({currentDay.dayName})</p>
              <p className="text-[11px] font-mono mt-1" style={{ color: currentDay.changePercent >= 0 ? "var(--green)" : "var(--red)" }}>
                {currentDay.changePercent >= 0 ? "+" : ""}{currentDay.changePercent.toFixed(2)}% | Range: {currentDay.rangePercent.toFixed(2)}%
              </p>
            </div>
          )}
        </div>

        {/* Right Panel (~30%) */}
        <div className="w-80 flex-shrink-0 border-l border-[var(--border)] overflow-y-auto" style={{ background: "var(--surface)" }}>
          <div className="p-3 space-y-4">
            {/* Pool Filter (collapsible) */}
            {showFilter && (
              <div className="glass-panel-sm p-3">
                <DayPoolFilter
                  filter={poolFilter}
                  onChange={setPoolFilter}
                  poolSize={dayPool.length}
                  totalSize={allDays.length}
                />
              </div>
            )}

            {/* Day Characteristics & Stats */}
            {currentDay && (
              <div className="glass-panel-sm p-3">
                <DayCharacteristics day={currentDay} stats={signatureStats} />
              </div>
            )}

            {/* Hourly Stats */}
            {currentDay && signatureStats.sampleSize > 0 && (
              <div className="glass-panel-sm p-3">
                <HourlyStats buckets={signatureStats.hourlyBuckets} />
              </div>
            )}

            {/* Orders & Trades */}
            <div className="glass-panel-sm p-3">
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
