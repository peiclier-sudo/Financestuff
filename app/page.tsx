"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { TradingDay, FilterCriteria } from "@/lib/types";
import { parseCSV, groupIntoDays, filterDays, computeStats } from "@/lib/dataUtils";
import { buildFilterDescription } from "@/lib/filterDescription";
import { StrategyResult, TradeResult } from "@/lib/strategies";
import FilterPanel from "./components/FilterPanel";
import DayList from "./components/DayList";
import CandlestickChart, { TradeHighlight } from "./components/CandlestickChart";
import StatsBar from "./components/StatsBar";
import DaySummary from "./components/DaySummary";
import AIAnalysis from "./components/AIAnalysis";
import StrategyLab from "./components/StrategyLab";

const DEFAULT_CRITERIA: FilterCriteria = {
  dayOfWeek: null,
  gapDirection: "any",
  minGapPercent: 0,
  maxGapPercent: 0,
  minRangePercent: 0,
  maxRangePercent: 0,
  direction: "any",
  dateFrom: "",
  dateTo: "",
  prevDayDirection: "any",
  minChangePercent: 0,
  maxChangePercent: 0,
  prevDayMinChangePercent: 0,
  prevDayMaxChangePercent: 0,
};

export default function Home() {
  const [allDays, setAllDays] = useState<TradingDay[]>([]);
  const [criteria, setCriteria] = useState<FilterCriteria>(DEFAULT_CRITERIA);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"strategies" | "ai_backtest" | "ai_analysis">("strategies");
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(null);

  useEffect(() => {
    fetch("/NASDAQ_5min_NDX_From_2015.csv")
      .then((res) => {
        if (!res.ok) throw new Error("CSV not found in public/");
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

  const filteredDays = useMemo(() => filterDays(allDays, criteria), [allDays, criteria]);
  const stats = useMemo(() => computeStats(filteredDays), [filteredDays]);

  // Primary date = last in the selection
  const primaryDate = selectedDates.length > 0 ? selectedDates[selectedDates.length - 1] : null;

  // Resolve selected TradingDay objects
  const allDaysMap = useMemo(() => {
    const m = new Map<string, TradingDay>();
    allDays.forEach(d => m.set(d.date, d));
    return m;
  }, [allDays]);

  const primaryDay = primaryDate ? allDaysMap.get(primaryDate) ?? null : null;

  const selectedDayObjects = useMemo(
    () => selectedDates.map(d => allDaysMap.get(d)).filter((d): d is TradingDay => d != null),
    [selectedDates, allDaysMap]
  );

  // Compute range data from all selected days (when >1 selected)
  const rangeData = useMemo(() => {
    if (selectedDayObjects.length <= 1) return null;
    const high = Math.max(...selectedDayObjects.map(d => d.high));
    const low = Math.min(...selectedDayObjects.map(d => d.low));
    return { high, low, label: `${selectedDayObjects.length} days` };
  }, [selectedDayObjects]);

  // Find trade for current primary day from strategy results
  const tradeForDay: TradeHighlight | null = useMemo(() => {
    if (!strategyResult || !primaryDate) return null;
    const trade = strategyResult.trades.find((t: TradeResult) => t.date === primaryDate);
    if (!trade) return null;
    return {
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      entryTime: trade.entryTime,
      exitPrice: trade.exitPrice,
      exitTime: trade.exitTime,
      stopPrice: trade.stopPrice,
      targetPrice: trade.targetPrice,
      pnlPoints: trade.pnlPoints,
      hitTarget: trade.hitTarget,
      hitStop: trade.hitStop,
    };
  }, [strategyResult, primaryDate]);

  const handleSelect = useCallback((date: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      setSelectedDates(prev => {
        if (prev.includes(date)) {
          const next = prev.filter(d => d !== date);
          return next.length > 0 ? next : [date];
        }
        return [...prev, date];
      });
    } else {
      setSelectedDates([date]);
    }
  }, []);

  const handleReset = useCallback(() => {
    setCriteria(DEFAULT_CRITERIA);
  }, []);

  const handleStrategyResult = useCallback((result: StrategyResult | null) => {
    setStrategyResult(result);
  }, []);

  // Keyboard navigation (moves primary, resets to single selection)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filteredDays.length) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

      const currentIndex = filteredDays.findIndex((d) => d.date === primaryDate);

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, filteredDays.length - 1);
        setSelectedDates([filteredDays[next].date]);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedDates([filteredDays[prev].date]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredDays, primaryDate]);

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
    <div className="h-screen flex flex-col p-3 gap-2 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-1 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-[var(--text)] to-[var(--text-secondary)] bg-clip-text text-transparent">NDX Day Filter</h1>
          </div>
          <span className="text-[10px] text-[var(--text-dim)] font-[JetBrains_Mono,monospace] bg-[var(--surface)] px-2 py-0.5 rounded-full border border-[var(--border)]">
            {allDays[0]?.date} — {allDays[allDays.length - 1]?.date}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-[var(--text-dim)] tracking-wide uppercase">↑↓ nav</span>
          <span className="text-[9px] text-[var(--text-dim)] tracking-wide uppercase">ctrl+click multi</span>
        </div>
      </header>

      {/* Filters */}
      <div className="flex-shrink-0">
        <FilterPanel
          criteria={criteria}
          onChange={setCriteria}
          resultCount={filteredDays.length}
          totalCount={allDays.length}
          onReset={handleReset}
        />
      </div>

      {/* Stats bar */}
      <div className="flex-shrink-0">
        <StatsBar stats={stats} />
      </div>

      {/* Main content: 3 columns */}
      <div className="flex-1 grid grid-cols-12 gap-2 min-h-0">
        {/* Left: Summary on top, day list below */}
        <div className="col-span-3 flex flex-col gap-2 min-h-0">
          {selectedDayObjects.length > 0 && (
            <div className="flex-shrink-0">
              <DaySummary days={selectedDayObjects} />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DayList days={filteredDays} selectedDates={selectedDates} onSelect={handleSelect} />
          </div>
        </div>

        {/* Center: Chart */}
        <div className="col-span-6 min-h-0">
          {primaryDay ? (
            <CandlestickChart
              bars={primaryDay.bars}
              title={`${primaryDay.date} ${primaryDay.dayName} — ${primaryDay.bars.length} bars${selectedDates.length > 1 ? ` (${selectedDates.length} selected)` : ""}`}
              prevClose={primaryDay.prevClose}
              range={rangeData}
              trade={tradeForDay}
            />
          ) : (
            <div className="glass-panel flex items-center justify-center h-full">
              <div className="text-center fade-in">
                <div className="w-8 h-8 rounded-full border border-[var(--border-bright)] flex items-center justify-center mx-auto mb-3">
                  <div className="w-3 h-3 rounded-sm border-2 border-[var(--text-dim)]" />
                </div>
                <p className="text-[var(--text-muted)] text-xs mb-1">Select a day</p>
                <p className="text-[var(--text-dim)] text-[10px]">Click a row or use arrow keys</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Tabbed panel */}
        <div className="col-span-3 min-h-0 flex flex-col">
          <div className="flex glass-panel rounded-b-none border-b-0 overflow-hidden flex-shrink-0">
            <button
              onClick={() => setRightTab("strategies")}
              className={`tab-btn ${rightTab === "strategies" ? "active" : ""}`}
            >
              Strategies
            </button>
            <button
              onClick={() => setRightTab("ai_backtest")}
              className={`tab-btn ${rightTab === "ai_backtest" ? "active-purple" : ""}`}
            >
              AI Backtest
            </button>
            <button
              onClick={() => setRightTab("ai_analysis")}
              className={`tab-btn ${rightTab === "ai_analysis" ? "active" : ""}`}
            >
              AI Analysis
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {rightTab === "ai_analysis" ? (
              <AIAnalysis days={filteredDays} stats={stats} criteria={criteria} />
            ) : (
              <StrategyLab
                days={filteredDays}
                filterDescription={buildFilterDescription(criteria)}
                onResult={handleStrategyResult}
                mode={rightTab === "ai_backtest" ? "ai" : "preset"}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
