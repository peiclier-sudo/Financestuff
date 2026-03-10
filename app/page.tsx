"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GridLayout, useContainerWidth, noCompactor } from "react-grid-layout";
import type { LayoutItem } from "react-grid-layout";
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
import BlockWorkflow from "./components/BlockWorkflow";

const LAYOUT_KEY = "ndx_panel_layout";
const COLS = 24;
const GRID_ROWS = 16;
const MARGIN = 6;

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "daylist", x: 0, y: 0, w: 5, h: GRID_ROWS, minW: 3, minH: 4 },
  { i: "chart", x: 5, y: 0, w: 13, h: GRID_ROWS, minW: 6, minH: 4 },
  { i: "strategy", x: 18, y: 0, w: 6, h: GRID_ROWS, minW: 4, minH: 4 },
];

function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_LAYOUT.map(l => ({ ...l }));
}

function saveLayout(layout: LayoutItem[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}

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

const PANEL_TITLES: Record<string, string> = {
  daylist: "Trade History",
  chart: "Chart",
  strategy: "Strategy Lab",
};

const PANEL_ICONS: Record<string, string> = {
  daylist: "\u2630",
  chart: "\u2632",
  strategy: "\u2699",
};

export default function Home() {
  const [allDays, setAllDays] = useState<TradingDay[]>([]);
  const [criteria, setCriteria] = useState<FilterCriteria>(DEFAULT_CRITERIA);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"designer" | "ai_analysis">("designer");
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>(() => DEFAULT_LAYOUT.map(l => ({ ...l })));
  const { width: containerWidth, mounted, containerRef: gridContainerRef } = useContainerWidth({ initialWidth: 1400 });
  const topBarRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(600);
  const dynamicRowH = (gridHeight - (GRID_ROWS - 1) * MARGIN) / GRID_ROWS;

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  // Compute available grid height from viewport minus top bar
  useEffect(() => {
    const compute = () => {
      const topH = topBarRef.current?.offsetHeight ?? 0;
      // 8px padding (px-2 top + pb-2 bottom of grid container)
      const available = window.innerHeight - topH - 16;
      setGridHeight(Math.max(available, 200));
    };
    compute();
    window.addEventListener("resize", compute);
    // Also observe top bar in case it changes height
    const ro = new ResizeObserver(compute);
    if (topBarRef.current) ro.observe(topBarRef.current);
    return () => { window.removeEventListener("resize", compute); ro.disconnect(); };
  }, []);

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

  const primaryDate = selectedDates.length > 0 ? selectedDates[selectedDates.length - 1] : null;

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

  const rangeData = useMemo(() => {
    if (selectedDayObjects.length <= 1) return null;
    const high = Math.max(...selectedDayObjects.map(d => d.high));
    const low = Math.min(...selectedDayObjects.map(d => d.low));
    return { high, low, label: `${selectedDayObjects.length} days` };
  }, [selectedDayObjects]);

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

  const handleReset = useCallback(() => setCriteria(DEFAULT_CRITERIA), []);
  const handleStrategyResult = useCallback((result: StrategyResult | null) => setStrategyResult(result), []);

  const handleLayoutChange = useCallback((newLayout: readonly LayoutItem[]) => {
    setLayout([...newLayout]);
    saveLayout([...newLayout]);
  }, []);

  const handleResetLayout = useCallback(() => {
    const fresh = DEFAULT_LAYOUT.map(l => ({ ...l }));
    setLayout(fresh);
    saveLayout(fresh);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filteredDays.length) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
      const currentIndex = filteredDays.findIndex((d) => d.date === primaryDate);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedDates([filteredDays[Math.min(currentIndex + 1, filteredDays.length - 1)].date]);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedDates([filteredDays[Math.max(currentIndex - 1, 0)].date]);
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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div ref={topBarRef} className="flex-shrink-0 px-3 pt-2 pb-1 space-y-1.5">
        <header className="flex items-center justify-between px-1">
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
            <button onClick={handleResetLayout} className="text-[8px] text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-wide transition-colors">Reset Layout</button>
            <span className="text-[9px] text-[var(--text-dim)] tracking-wide uppercase">drag panels to move</span>
          </div>
        </header>

        <FilterPanel criteria={criteria} onChange={setCriteria} resultCount={filteredDays.length} totalCount={allDays.length} onReset={handleReset} />
        <StatsBar stats={stats} />
      </div>

      {/* ── Grid panels ── */}
      <div className="px-2 pb-2" ref={gridContainerRef} style={{ height: gridHeight }}>
        {mounted && (
          <GridLayout
            layout={layout}
            width={containerWidth}
            gridConfig={{ cols: COLS, rowHeight: dynamicRowH, margin: [MARGIN, MARGIN], containerPadding: [0, 0] }}
            dragConfig={{ handle: ".panel-drag-handle" }}
            onLayoutChange={handleLayoutChange}
            compactor={noCompactor}
          >
            {/* ── Day List Panel ── */}
            <div key="daylist">
              <Panel id="daylist">
                <div className="flex flex-col h-full gap-1">
                  {selectedDayObjects.length > 0 && (
                    <div className="flex-shrink-0">
                      <DaySummary days={selectedDayObjects} />
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <DayList days={filteredDays} selectedDates={selectedDates} onSelect={handleSelect} />
                  </div>
                </div>
              </Panel>
            </div>

            {/* ── Chart Panel ── */}
            <div key="chart">
              <Panel id="chart">
                {primaryDay ? (
                  <CandlestickChart
                    bars={primaryDay.bars}
                    title={`${primaryDay.date} ${primaryDay.dayName} — ${primaryDay.bars.length} bars${selectedDates.length > 1 ? ` (${selectedDates.length} selected)` : ""}`}
                    prevClose={primaryDay.prevClose}
                    range={rangeData}
                    trade={tradeForDay}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center fade-in">
                      <div className="w-8 h-8 rounded-full border border-[var(--border-bright)] flex items-center justify-center mx-auto mb-3">
                        <div className="w-3 h-3 rounded-sm border-2 border-[var(--text-dim)]" />
                      </div>
                      <p className="text-[var(--text-muted)] text-xs mb-1">Select a day</p>
                      <p className="text-[var(--text-dim)] text-[10px]">Click a row or use arrow keys</p>
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            {/* ── Strategy Panel ── */}
            <div key="strategy">
              <Panel id="strategy" tabs={
                <div className="flex ml-auto gap-0.5">
                  <button
                    onClick={() => setRightTab("designer")}
                    className={`px-2 py-0.5 text-[8px] font-semibold rounded-sm transition-all ${rightTab === "designer" ? "text-[var(--accent)] bg-[var(--accent)]/10" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
                  >DESIGNER</button>
                  <button
                    onClick={() => setRightTab("ai_analysis")}
                    className={`px-2 py-0.5 text-[8px] font-semibold rounded-sm transition-all ${rightTab === "ai_analysis" ? "text-[var(--purple)] bg-[var(--purple)]/10" : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"}`}
                  >AI ANALYSIS</button>
                </div>
              }>
                {rightTab === "ai_analysis" ? (
                  <AIAnalysis days={filteredDays} stats={stats} criteria={criteria} />
                ) : (
                  <BlockWorkflow
                    days={filteredDays}
                    filterDescription={buildFilterDescription(criteria)}
                    onResult={handleStrategyResult}
                  />
                )}
              </Panel>
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Panel wrapper — glassmorphism container with drag handle
// ══════════════════════════════════════════════════════════

function Panel({ id, children, tabs }: { id: string; children: React.ReactNode; tabs?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden" style={{
      background: "linear-gradient(145deg, rgba(12, 15, 21, 0.95), rgba(18, 22, 30, 0.88))",
      border: "1px solid var(--border)",
      backdropFilter: "blur(16px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.02) inset, 0 0 0 1px rgba(255,255,255,0.02) inset",
    }}>
      {/* Title bar — drag handle */}
      <div className="panel-drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing select-none flex-shrink-0" style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Window dots */}
        <div className="flex gap-1">
          <div className="w-[7px] h-[7px] rounded-full bg-[var(--red)]/40 hover:bg-[var(--red)]/80 transition-colors" />
          <div className="w-[7px] h-[7px] rounded-full bg-[var(--orange)]/40 hover:bg-[var(--orange)]/80 transition-colors" />
          <div className="w-[7px] h-[7px] rounded-full bg-[var(--green)]/40 hover:bg-[var(--green)]/80 transition-colors" />
        </div>
        {/* Icon + Title */}
        <span className="text-[var(--text-dim)] text-[9px]">{PANEL_ICONS[id]}</span>
        <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">{PANEL_TITLES[id]}</span>
        {/* Optional tabs */}
        {tabs}
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
