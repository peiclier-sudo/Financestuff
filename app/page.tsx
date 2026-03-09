"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { TradingDay, FilterCriteria } from "@/lib/types";
import { parseCSV, groupIntoDays, filterDays } from "@/lib/dataUtils";
import FilterPanel from "./components/FilterPanel";
import DayList from "./components/DayList";
import CandlestickChart from "./components/CandlestickChart";

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
};

export default function Home() {
  const [allDays, setAllDays] = useState<TradingDay[]>([]);
  const [criteria, setCriteria] = useState<FilterCriteria>(DEFAULT_CRITERIA);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/NASDAQ_5min_NDX_From_2015.csv")
      .then((res) => {
        if (!res.ok) throw new Error("CSV file not found. Please add NASDAQ_5min_NDX_From_2015.csv to the public/ folder.");
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

  const selectedDay = useMemo(
    () => (selectedDate ? allDays.find((d) => d.date === selectedDate) ?? null : null),
    [allDays, selectedDate]
  );

  // Keyboard navigation through filtered days
  const handleSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filteredDays.length) return;
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[#888]">Loading NASDAQ data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-[#141414] border border-[#ef4444]/30 rounded-lg p-8 max-w-md text-center">
          <p className="text-[#ef4444] font-semibold mb-2">Error loading data</p>
          <p className="text-[#888] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">NASDAQ Day Filter</h1>
          <p className="text-sm text-[#888]">
            {allDays.length} trading days &middot; {allDays[0]?.date} to {allDays[allDays.length - 1]?.date}
          </p>
        </div>
        <p className="text-xs text-[#888]">Arrow keys or j/k to navigate</p>
      </header>

      <FilterPanel
        criteria={criteria}
        onChange={setCriteria}
        resultCount={filteredDays.length}
        totalCount={allDays.length}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DayList days={filteredDays} selectedDate={selectedDate} onSelect={handleSelect} />

        <div className="space-y-4">
          {selectedDay ? (
            <>
              <CandlestickChart
                bars={selectedDay.bars}
                title={`${selectedDay.date} (${selectedDay.dayName}) — ${selectedDay.bars.length} bars`}
              />
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4">
                <h3 className="text-sm font-semibold text-[#888] mb-3">Day Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-[#888]">Open</span>
                    <p className="font-mono">{selectedDay.open.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[#888]">High</span>
                    <p className="font-mono">{selectedDay.high.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[#888]">Low</span>
                    <p className="font-mono">{selectedDay.low.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[#888]">Close</span>
                    <p className="font-mono">{selectedDay.close.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[#888]">Gap</span>
                    <p className={`font-mono ${
                      selectedDay.gapPercent === null ? "text-[#888]" :
                      selectedDay.gapPercent > 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                    }`}>
                      {selectedDay.gapPercent !== null
                        ? `${selectedDay.gapPercent > 0 ? "+" : ""}${selectedDay.gapPercent.toFixed(3)}%`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#888]">Change</span>
                    <p className={`font-mono ${
                      selectedDay.changePercent > 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                    }`}>
                      {selectedDay.changePercent > 0 ? "+" : ""}{selectedDay.changePercent.toFixed(3)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[#888]">Range</span>
                    <p className="font-mono">{selectedDay.rangePercent.toFixed(3)}%</p>
                  </div>
                  <div>
                    <span className="text-[#888]">Prev Close</span>
                    <p className="font-mono">
                      {selectedDay.prevClose !== null ? selectedDay.prevClose.toFixed(2) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-16 text-center text-[#888]">
              <p className="text-lg mb-2">Select a day to view its chart</p>
              <p className="text-sm">Click any row in the table or use arrow keys to navigate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
