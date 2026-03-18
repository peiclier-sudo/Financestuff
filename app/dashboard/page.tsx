"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GridLayout, noCompactor } from "react-grid-layout";
import type { LayoutItem } from "react-grid-layout";
import { TradingDay, FilterCriteria } from "@/lib/types";
import { parseCSV, groupIntoDays, filterDays, computeStats } from "@/lib/dataUtils";
import { buildFilterDescription } from "@/lib/filterDescription";
import { StrategyResult, TradeResult } from "@/lib/strategies";
import FilterPanel from "../components/FilterPanel";
import DayList from "../components/DayList";
import CandlestickChart, { TradeHighlight } from "../components/CandlestickChart";
import StatsBar from "../components/StatsBar";
import DaySummary from "../components/DaySummary";
import AIAnalysis from "../components/AIAnalysis";
import BlockWorkflow from "../components/BlockWorkflow";

const LAYOUT_KEY = "ndx_panel_layout_v2";
const COLS = 96;
const GRID_ROWS = 16;
const MARGIN = 6;

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "daylist", x: 0, y: 0, w: 20, h: GRID_ROWS, minW: 10, minH: GRID_ROWS, maxH: GRID_ROWS, resizeHandles: ["e"] },
  { i: "chart", x: 20, y: 0, w: 48, h: GRID_ROWS, minW: 20, minH: GRID_ROWS, maxH: GRID_ROWS, resizeHandles: ["e"] },
  { i: "strategy", x: 68, y: 0, w: 28, h: GRID_ROWS, minW: 16, minH: GRID_ROWS, maxH: GRID_ROWS, resizeHandles: [] as ("e")[] },
];

function normalizeLayout(items: LayoutItem[]): LayoutItem[] {
  // Apply per-item constraints from defaults
  const defaults = new Map(DEFAULT_LAYOUT.map(d => [d.i, d]));
  for (const it of items) {
    const def = defaults.get(it.i);
    if (def) {
      it.minW = def.minW;
      it.minH = def.minH;
      it.maxH = def.maxH;
      it.resizeHandles = def.resizeHandles;
    }
    it.h = GRID_ROWS;
    it.y = 0;
  }
  // Sort by x and repack to fill COLS
  items.sort((a, b) => a.x - b.x);
  let x = 0;
  for (let idx = 0; idx < items.length; idx++) {
    items[idx].x = x;
    if (idx === items.length - 1) {
      items[idx].w = Math.max(COLS - x, items[idx].minW ?? 3);
    }
    x += items[idx].w;
  }
  return items;
}

function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return normalizeLayout(JSON.parse(raw));
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
  const topBarRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  const [mounted, setMounted] = useState(false);
  const dynamicRowH = (gridHeight - (GRID_ROWS - 1) * MARGIN) / GRID_ROWS;

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  // Compute available grid height + width from viewport
  useEffect(() => {
    setMounted(true);
    const compute = () => {
      const topH = topBarRef.current?.offsetHeight ?? 0;
      setGridHeight(Math.max(window.innerHeight - topH, 200));
      setContainerWidth(window.innerWidth);
    };
    compute();
    window.addEventListener("resize", compute);
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
    // Only persist if not mid-resize (onResizeStop handles that)
    if (resizingRef.current) return;
    const items = [...newLayout].map(it => ({ ...it, h: GRID_ROWS, y: 0 }));
    items.sort((a, b) => a.x - b.x);
    let x = 0;
    for (let idx = 0; idx < items.length; idx++) {
      items[idx].x = x;
      if (idx === items.length - 1) {
        items[idx].w = Math.max(COLS - x, items[idx].minW ?? 3);
      }
      x += items[idx].w;
    }
    setLayout(items);
    saveLayout(items);
  }, []);

  const resizingRef = useRef(false);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const preResizeLayoutRef = useRef<LayoutItem[]>([]);

  // Compute linked layout from a resize delta
  const computeLinkedLayout = useCallback((base: LayoutItem[], resizedId: string, newW: number): LayoutItem[] => {
    const items = base.map(it => ({ ...it }));
    items.sort((a, b) => a.x - b.x);
    const idx = items.findIndex(it => it.i === resizedId);
    if (idx < 0 || idx >= items.length - 1) return items;
    const oldW = items[idx].w;
    const delta = newW - oldW;
    if (delta === 0) return items;
    items[idx].w = newW;
    const next = items[idx + 1];
    const nextMinW = next.minW ?? 3;
    next.w = Math.max(next.w - delta, nextMinW);
    // Repack
    let x = 0;
    for (const it of items) { it.x = x; it.y = 0; it.h = GRID_ROWS; x += it.w; }
    const total = items.reduce((s, it) => s + it.w, 0);
    if (total > COLS) {
      items[idx].w -= total - COLS;
      x = 0;
      for (const it of items) { it.x = x; x += it.w; }
    }
    return items;
  }, []);

  const handleResizeStart: (layout: readonly LayoutItem[], oldItem: LayoutItem | null, newItem: LayoutItem | null) => void = useCallback((_layout, _oldItem, newItem) => {
    resizingRef.current = true;
    setResizingId(newItem?.i ?? null);
    preResizeLayoutRef.current = layout.map(it => ({ ...it }));
  }, [layout]);

  // Live preview during resize — update layout in real time
  const handleResize: (layout: readonly LayoutItem[], oldItem: LayoutItem | null, newItem: LayoutItem | null) => void = useCallback((_layout, _oldItem, newItem) => {
    if (!newItem) return;
    const linked = computeLinkedLayout(preResizeLayoutRef.current, newItem.i, newItem.w);
    setLayout(linked);
  }, [computeLinkedLayout]);

  // Finalize on stop
  const handleResizeStop: (layout: readonly LayoutItem[], oldItem: LayoutItem | null, newItem: LayoutItem | null) => void = useCallback((_layout, _oldItem, newItem) => {
    resizingRef.current = false;
    setResizingId(null);
    if (!newItem) return;
    const linked = computeLinkedLayout(preResizeLayoutRef.current, newItem.i, newItem.w);
    setLayout(linked);
    saveLayout(linked);
  }, [computeLinkedLayout]);

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
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-[var(--accent)] animate-ping opacity-30" />
              </div>
              <h1 className="font-display text-sm font-bold tracking-tight text-gradient-accent">NDX Day Filter</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-px h-3 bg-[var(--border-bright)]" />
              <span className="text-[10px] text-[var(--text-dim)] font-[JetBrains_Mono,monospace] bg-[var(--surface)] px-2.5 py-0.5 rounded-full border border-[var(--border)]" style={{ letterSpacing: "0.02em" }}>
                {allDays[0]?.date} — {allDays[allDays.length - 1]?.date}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleResetLayout} className="text-[8px] text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors px-2 py-0.5 rounded hover:bg-[var(--accent)]/5">Reset Layout</button>
            <div className="w-px h-3 bg-[var(--border)]" />
            <span className="text-[8px] text-[var(--text-dim)] tracking-widest uppercase opacity-50">drag to move</span>
          </div>
        </header>

        <FilterPanel criteria={criteria} onChange={setCriteria} resultCount={filteredDays.length} totalCount={allDays.length} onReset={handleReset} />
        <StatsBar stats={stats} />
      </div>

      {/* ── Grid panels ── */}
      <div style={{ height: gridHeight, width: "100vw" }}>
        {mounted && (
          <GridLayout
            layout={layout}
            width={containerWidth}
            gridConfig={{ cols: COLS, rowHeight: dynamicRowH, margin: [MARGIN, MARGIN], containerPadding: [0, 0] }}
            dragConfig={{ handle: ".panel-drag-handle" }}
            resizeConfig={{ enabled: true, handles: ["e"] }}
            onLayoutChange={handleLayoutChange}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeStop={handleResizeStop}
            compactor={noCompactor}
          >
            {/* ── Day List Panel ── */}
            <div key="daylist">
              <Panel id="daylist" isResizing={resizingId != null} widthPercent={Math.round(((layout.find(l => l.i === "daylist")?.w ?? 0) / COLS) * 100)}>
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
              <Panel id="chart" isResizing={resizingId != null} widthPercent={Math.round(((layout.find(l => l.i === "chart")?.w ?? 0) / COLS) * 100)}>
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
              <Panel id="strategy" isResizing={resizingId != null} widthPercent={Math.round(((layout.find(l => l.i === "strategy")?.w ?? 0) / COLS) * 100)} tabs={
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

const PANEL_ACCENT: Record<string, string> = {
  daylist: "96, 165, 250",
  chart: "0, 230, 118",
  strategy: "192, 132, 252",
};

function Panel({ id, children, tabs, isResizing, widthPercent }: { id: string; children: React.ReactNode; tabs?: React.ReactNode; isResizing?: boolean; widthPercent?: number }) {
  const rgb = PANEL_ACCENT[id] || "96, 165, 250";
  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden panel-focus" style={{
      background: `linear-gradient(160deg, rgba(12, 15, 21, 0.75), rgba(18, 22, 30, 0.6))`,
      backdropFilter: "blur(20px) saturate(1.4)",
      WebkitBackdropFilter: "blur(20px) saturate(1.4)",
      border: isResizing ? `1px solid rgba(${rgb}, 0.3)` : "1px solid rgba(255, 255, 255, 0.06)",
      borderTopColor: `rgba(${rgb}, 0.2)`,
      boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset, 0 0 40px rgba(${rgb}, 0.03)`,
      contain: "layout style",
    }}>
      {/* Title bar — drag handle */}
      <div className="panel-drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing select-none flex-shrink-0" style={{
        background: `linear-gradient(180deg, rgba(${rgb}, 0.04) 0%, transparent 100%)`,
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Window dots */}
        <div className="flex gap-1.5">
          <div className="w-[8px] h-[8px] rounded-full" style={{ background: `rgba(255, 82, 82, 0.35)` }} />
          <div className="w-[8px] h-[8px] rounded-full" style={{ background: `rgba(255, 171, 64, 0.35)` }} />
          <div className="w-[8px] h-[8px] rounded-full" style={{ background: `rgba(0, 230, 118, 0.35)` }} />
        </div>
        <div className="w-px h-3 bg-[var(--border)]" />
        <span className="text-[9px] opacity-40">{PANEL_ICONS[id]}</span>
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: `rgba(${rgb}, 0.7)` }}>{PANEL_TITLES[id]}</span>
        {/* Width badge during resize */}
        {isResizing && widthPercent != null && (
          <span className="ml-auto text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full" style={{
            background: `rgba(${rgb}, 0.15)`,
            color: `rgba(${rgb}, 0.9)`,
          }}>
            {widthPercent}%
          </span>
        )}
        {/* Optional tabs */}
        {!isResizing && tabs}
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
