"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { TradingDay, FilterCriteria } from "@/lib/types";
import { parseCSV, groupIntoDays, filterDays, computeStats } from "@/lib/dataUtils";
import { buildFilterDescription } from "@/lib/filterDescription";
import FilterPanel from "./components/FilterPanel";
import DayList from "./components/DayList";
import CandlestickChart from "./components/CandlestickChart";
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"ai" | "strategy">("strategy");

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

  const selectedDay = useMemo(
    () => (selectedDate ? allDays.find((d) => d.date === selectedDate) ?? null : null),
    [allDays, selectedDate]
  );

  const handleSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const handleReset = useCallback(() => {
    setCriteria(DEFAULT_CRITERIA);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filteredDays.length) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;

      const currentIndex = filteredDays.findIndex((d) => d.date === selectedDate);

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, filteredDays.length - 1);
        setSelectedDate(filteredDays[next].date);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedDate(filteredDays[prev].date);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredDays, selectedDate]);

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
    <div className="h-screen flex flex-col p-2 gap-2 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-1 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight">NDX Day Filter</h1>
          <span className="text-[10px] text-[var(--text-dim)] font-mono">
            {allDays[0]?.date} → {allDays[allDays.length - 1]?.date}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">↑↓ or j/k to navigate</span>
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

      {/* Main content: 3 columns — left narrow (summary + list), center wide (chart), right narrow (AI) */}
      <div className="flex-1 grid grid-cols-12 gap-2 min-h-0">
        {/* Left: Summary on top, day list below */}
        <div className="col-span-3 flex flex-col gap-1 min-h-0">
          {selectedDay && (
            <div className="flex-shrink-0">
              <DaySummary day={selectedDay} />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DayList days={filteredDays} selectedDate={selectedDate} onSelect={handleSelect} />
          </div>
        </div>

        {/* Center: Chart — full height */}
        <div className="col-span-6 min-h-0">
          {selectedDay ? (
            <CandlestickChart
              bars={selectedDay.bars}
              title={`${selectedDay.date} ${selectedDay.dayName} — ${selectedDay.bars.length} bars`}
              prevClose={selectedDay.prevClose}
            />
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[var(--text-dim)] text-xs mb-1">Select a day</p>
                <p className="text-[var(--text-dim)] text-[10px]">Click a row or use arrow keys</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Tabbed panel — Strategy Lab / AI Analysis */}
        <div className="col-span-3 min-h-0 flex flex-col">
          <div className="flex bg-[var(--surface)] border border-b-0 border-[var(--border)] rounded-t-lg overflow-hidden flex-shrink-0">
            <button
              onClick={() => setRightTab("strategy")}
              className={`flex-1 text-[10px] py-1 font-semibold tracking-wide transition-colors ${
                rightTab === "strategy"
                  ? "bg-[var(--surface-2)] text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
              }`}
            >
              Strategy Lab
            </button>
            <button
              onClick={() => setRightTab("ai")}
              className={`flex-1 text-[10px] py-1 font-semibold tracking-wide transition-colors ${
                rightTab === "ai"
                  ? "bg-[var(--surface-2)] text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
              }`}
            >
              AI Analysis
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {rightTab === "strategy" ? (
              <StrategyLab days={filteredDays} filterDescription={buildFilterDescription(criteria)} />
            ) : (
              <AIAnalysis days={filteredDays} stats={stats} criteria={criteria} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
