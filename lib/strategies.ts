import { Bar, TradingDay } from "./types";

// ── Types ──

export interface StrategyParams {
  id: string;
  label: string;
  description: string;
  fields: StrategyField[];
}

export interface StrategyField {
  key: string;
  label: string;
  type: "number" | "select";
  default: number | string;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface TradeResult {
  date: string;
  direction: "long" | "short";
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  stopPrice: number | null;
  targetPrice: number | null;
  pnlPoints: number;
  pnlPercent: number;
  holdBars: number;
  hitTarget: boolean;
  hitStop: boolean;
  timedOut: boolean;
}

export interface StrategyResult {
  strategyId: string;
  strategyLabel: string;
  params: Record<string, number | string>;
  filterDescription: string;
  totalDays: number;
  trades: TradeResult[];
  // Aggregates
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgPnlPoints: number;
  avgPnlPercent: number;
  medianPnlPoints: number;
  totalPnlPoints: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxWin: number;
  maxLoss: number;
  avgHoldBars: number;
  timestamp: number;
}

// ── Helpers ──

function getBarAtIndex(bars: Bar[], idx: number): Bar | null {
  return idx >= 0 && idx < bars.length ? bars[idx] : null;
}

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function simulateTrade(
  bars: Bar[],
  entryIdx: number,
  entryPrice: number,
  direction: "long" | "short",
  stopPoints: number,
  targetPoints: number,
  maxHoldBars: number,
  date: string,
): TradeResult | null {
  if (entryIdx >= bars.length) return null;

  let exitPrice = entryPrice;
  let exitTime = bars[entryIdx].time;
  let hitTarget = false;
  let hitStop = false;
  let timedOut = false;
  let holdBars = 0;

  const maxIdx = Math.min(entryIdx + maxHoldBars, bars.length - 1);

  for (let i = entryIdx; i <= maxIdx; i++) {
    const bar = bars[i];
    holdBars = i - entryIdx;

    if (direction === "long") {
      // Check stop first (worst case)
      if (stopPoints > 0 && bar.low <= entryPrice - stopPoints) {
        exitPrice = entryPrice - stopPoints;
        exitTime = bar.time;
        hitStop = true;
        break;
      }
      // Check target
      if (targetPoints > 0 && bar.high >= entryPrice + targetPoints) {
        exitPrice = entryPrice + targetPoints;
        exitTime = bar.time;
        hitTarget = true;
        break;
      }
    } else {
      // Short: check stop (price goes up)
      if (stopPoints > 0 && bar.high >= entryPrice + stopPoints) {
        exitPrice = entryPrice + stopPoints;
        exitTime = bar.time;
        hitStop = true;
        break;
      }
      // Check target (price goes down)
      if (targetPoints > 0 && bar.low <= entryPrice - targetPoints) {
        exitPrice = entryPrice - targetPoints;
        exitTime = bar.time;
        hitTarget = true;
        break;
      }
    }

    // Last bar — close at market
    if (i === maxIdx) {
      exitPrice = bar.close;
      exitTime = bar.time;
      timedOut = true;
    }
  }

  const pnlPoints = direction === "long"
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  // Compute stop/target price levels
  let stopPrice: number | null = null;
  let targetPrice: number | null = null;
  if (stopPoints > 0) {
    stopPrice = direction === "long" ? entryPrice - stopPoints : entryPrice + stopPoints;
  }
  if (targetPoints > 0) {
    targetPrice = direction === "long" ? entryPrice + targetPoints : entryPrice - targetPoints;
  }

  return {
    date,
    direction,
    entryPrice,
    entryTime: bars[entryIdx].time,
    exitPrice,
    exitTime,
    stopPrice,
    targetPrice,
    pnlPoints,
    pnlPercent: (pnlPoints / entryPrice) * 100,
    holdBars: Math.max(holdBars, 1),
    hitTarget,
    hitStop,
    timedOut,
  };
}

// ── Strategy Definitions ──

export const STRATEGIES: StrategyParams[] = [
  {
    id: "opening_range_breakout",
    label: "Opening Range Breakout",
    description: "Buy/sell the breakout of the first N candles' high/low",
    fields: [
      { key: "candles", label: "# Candles for range", type: "number", default: 5, min: 1, max: 24, step: 1 },
      { key: "direction", label: "Direction", type: "select", default: "long", options: [{ label: "Long (buy breakout)", value: "long" }, { label: "Short (sell breakdown)", value: "short" }, { label: "Both", value: "both" }] },
      { key: "stopPoints", label: "Stop (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "targetPoints", label: "Target (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "holdToClose", label: "Exit at", type: "select", default: "close", options: [{ label: "Market close", value: "close" }, { label: "After 1h", value: "12" }, { label: "After 2h", value: "24" }, { label: "After 30min", value: "6" }] },
    ],
  },
  {
    id: "gap_fade",
    label: "Gap Fade",
    description: "Fade the gap: sell gap-ups at open, buy gap-downs at open, target gap fill",
    fields: [
      { key: "targetMode", label: "Target", type: "select", default: "gapfill", options: [{ label: "Gap fill (prev close)", value: "gapfill" }, { label: "Fixed points", value: "fixed" }] },
      { key: "targetPoints", label: "Target points (if fixed)", type: "number", default: 50, min: 0, max: 500, step: 5 },
      { key: "stopPoints", label: "Stop (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "holdToClose", label: "Exit at", type: "select", default: "close", options: [{ label: "Market close", value: "close" }, { label: "After 1h", value: "12" }, { label: "After 2h", value: "24" }] },
    ],
  },
  {
    id: "first_candle_direction",
    label: "First Candle Continuation",
    description: "If first N-min candle is green → go long; if red → go short",
    fields: [
      { key: "candles", label: "# Candles to evaluate", type: "number", default: 1, min: 1, max: 12, step: 1 },
      { key: "mode", label: "Trade mode", type: "select", default: "continuation", options: [{ label: "Continuation (follow first candle)", value: "continuation" }, { label: "Reversal (fade first candle)", value: "reversal" }] },
      { key: "stopPoints", label: "Stop (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "targetPoints", label: "Target (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "holdToClose", label: "Exit at", type: "select", default: "close", options: [{ label: "Market close", value: "close" }, { label: "After 1h", value: "12" }, { label: "After 2h", value: "24" }] },
    ],
  },
  {
    id: "time_entry",
    label: "Time-of-Day Entry",
    description: "Enter long or short at a specific time of day",
    fields: [
      { key: "entryBar", label: "Entry bar # (0=open)", type: "number", default: 0, min: 0, max: 72, step: 1 },
      { key: "direction", label: "Direction", type: "select", default: "long", options: [{ label: "Long", value: "long" }, { label: "Short", value: "short" }] },
      { key: "stopPoints", label: "Stop (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "targetPoints", label: "Target (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "holdToClose", label: "Exit at", type: "select", default: "close", options: [{ label: "Market close", value: "close" }, { label: "After 30min", value: "6" }, { label: "After 1h", value: "12" }, { label: "After 2h", value: "24" }] },
    ],
  },
  {
    id: "prev_close_retest",
    label: "Previous Close Retest",
    description: "Enter when price retests previous close level during the day",
    fields: [
      { key: "direction", label: "Direction on retest", type: "select", default: "long", options: [{ label: "Long (buy at prev close)", value: "long" }, { label: "Short (sell at prev close)", value: "short" }, { label: "Auto (with gap direction)", value: "auto" }] },
      { key: "stopPoints", label: "Stop (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "targetPoints", label: "Target (points)", type: "number", default: 0, min: 0, max: 500, step: 5 },
      { key: "holdToClose", label: "Exit at", type: "select", default: "close", options: [{ label: "Market close", value: "close" }, { label: "After 1h", value: "12" }, { label: "After 2h", value: "24" }] },
    ],
  },
];

// ── Strategy Runners ──

function getMaxHold(holdToClose: string, barsLen: number, entryIdx: number): number {
  if (holdToClose === "close") return barsLen - entryIdx;
  return parseInt(holdToClose, 10) || (barsLen - entryIdx);
}

function runOpeningRangeBreakout(day: TradingDay, params: Record<string, number | string>): TradeResult[] {
  const bars = day.bars;
  const n = Number(params.candles) || 5;
  const dir = String(params.direction);
  const stopPts = Number(params.stopPoints) || 0;
  const targetPts = Number(params.targetPoints) || 0;
  const maxHold = getMaxHold(String(params.holdToClose), bars.length, n);

  if (bars.length <= n) return [];

  // Compute opening range
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = 0; i < n; i++) {
    rangeHigh = Math.max(rangeHigh, bars[i].high);
    rangeLow = Math.min(rangeLow, bars[i].low);
  }

  const results: TradeResult[] = [];

  // Scan for breakout after the range
  if (dir === "long" || dir === "both") {
    for (let i = n; i < bars.length; i++) {
      if (bars[i].high > rangeHigh) {
        const trade = simulateTrade(bars, i, rangeHigh, "long", stopPts, targetPts, maxHold, day.date);
        if (trade) results.push(trade);
        break;
      }
    }
  }

  if (dir === "short" || dir === "both") {
    for (let i = n; i < bars.length; i++) {
      if (bars[i].low < rangeLow) {
        const trade = simulateTrade(bars, i, rangeLow, "short", stopPts, targetPts, maxHold, day.date);
        if (trade) results.push(trade);
        break;
      }
    }
  }

  return results;
}

function runGapFade(day: TradingDay, params: Record<string, number | string>): TradeResult[] {
  if (day.gapPercent === null || day.prevClose === null) return [];

  const bars = day.bars;
  const targetMode = String(params.targetMode);
  const stopPts = Number(params.stopPoints) || 0;
  const maxHold = getMaxHold(String(params.holdToClose), bars.length, 0);

  const gapUp = day.gapPercent > 0;
  const direction: "long" | "short" = gapUp ? "short" : "long";
  const entryPrice = bars[0].open;

  let targetPts = 0;
  if (targetMode === "gapfill") {
    targetPts = Math.abs(entryPrice - day.prevClose);
  } else {
    targetPts = Number(params.targetPoints) || 0;
  }

  const trade = simulateTrade(bars, 0, entryPrice, direction, stopPts, targetPts, maxHold, day.date);
  return trade ? [trade] : [];
}

function runFirstCandleDirection(day: TradingDay, params: Record<string, number | string>): TradeResult[] {
  const bars = day.bars;
  const n = Number(params.candles) || 1;
  const mode = String(params.mode);
  const stopPts = Number(params.stopPoints) || 0;
  const targetPts = Number(params.targetPoints) || 0;
  const maxHold = getMaxHold(String(params.holdToClose), bars.length, n);

  if (bars.length <= n) return [];

  // Determine first N candle direction
  const firstOpen = bars[0].open;
  const nthClose = bars[n - 1].close;
  const firstGreen = nthClose > firstOpen;

  let direction: "long" | "short";
  if (mode === "continuation") {
    direction = firstGreen ? "long" : "short";
  } else {
    direction = firstGreen ? "short" : "long";
  }

  const entryPrice = nthClose;
  const trade = simulateTrade(bars, n, entryPrice, direction, stopPts, targetPts, maxHold, day.date);
  return trade ? [trade] : [];
}

function runTimeEntry(day: TradingDay, params: Record<string, number | string>): TradeResult[] {
  const bars = day.bars;
  const entryBarIdx = Number(params.entryBar) || 0;
  const dir = String(params.direction) as "long" | "short";
  const stopPts = Number(params.stopPoints) || 0;
  const targetPts = Number(params.targetPoints) || 0;
  const maxHold = getMaxHold(String(params.holdToClose), bars.length, entryBarIdx);

  const entryBar = getBarAtIndex(bars, entryBarIdx);
  if (!entryBar) return [];

  const trade = simulateTrade(bars, entryBarIdx, entryBar.open, dir, stopPts, targetPts, maxHold, day.date);
  return trade ? [trade] : [];
}

function runPrevCloseRetest(day: TradingDay, params: Record<string, number | string>): TradeResult[] {
  if (day.prevClose === null) return [];
  const bars = day.bars;
  const pc = day.prevClose;
  const dirParam = String(params.direction);
  const stopPts = Number(params.stopPoints) || 0;
  const targetPts = Number(params.targetPoints) || 0;
  const maxHold = getMaxHold(String(params.holdToClose), bars.length, 0);

  // Find first bar that touches prev close
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].low <= pc && bars[i].high >= pc) {
      let direction: "long" | "short";
      if (dirParam === "auto") {
        direction = (day.gapPercent ?? 0) > 0 ? "long" : "short";
      } else {
        direction = dirParam as "long" | "short";
      }
      const trade = simulateTrade(bars, i, pc, direction, stopPts, targetPts, maxHold, day.date);
      return trade ? [trade] : [];
    }
  }
  return [];
}

// ── Main Runner ──

const RUNNER_MAP: Record<string, (day: TradingDay, params: Record<string, number | string>) => TradeResult[]> = {
  opening_range_breakout: runOpeningRangeBreakout,
  gap_fade: runGapFade,
  first_candle_direction: runFirstCandleDirection,
  time_entry: runTimeEntry,
  prev_close_retest: runPrevCloseRetest,
};

export function runStrategy(
  strategyId: string,
  params: Record<string, number | string>,
  days: TradingDay[],
  filterDescription: string,
): StrategyResult {
  const runner = RUNNER_MAP[strategyId];
  const stratDef = STRATEGIES.find(s => s.id === strategyId)!;
  const allTrades: TradeResult[] = [];

  for (const day of days) {
    if (day.bars.length < 5) continue;
    const trades = runner(day, params);
    allTrades.push(...trades);
  }

  const wins = allTrades.filter(t => t.pnlPoints > 0);
  const losses = allTrades.filter(t => t.pnlPoints <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));

  return {
    strategyId,
    strategyLabel: stratDef.label,
    params: { ...params },
    filterDescription,
    totalDays: days.length,
    trades: allTrades,
    totalTrades: allTrades.length,
    winners: wins.length,
    losers: losses.length,
    winRate: allTrades.length > 0 ? (wins.length / allTrades.length) * 100 : 0,
    avgPnlPoints: allTrades.length > 0 ? allTrades.reduce((s, t) => s + t.pnlPoints, 0) / allTrades.length : 0,
    avgPnlPercent: allTrades.length > 0 ? allTrades.reduce((s, t) => s + t.pnlPercent, 0) / allTrades.length : 0,
    medianPnlPoints: medianOf(allTrades.map(t => t.pnlPoints)),
    totalPnlPoints: allTrades.reduce((s, t) => s + t.pnlPoints, 0),
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxWin: allTrades.length > 0 ? Math.max(...allTrades.map(t => t.pnlPoints)) : 0,
    maxLoss: allTrades.length > 0 ? Math.min(...allTrades.map(t => t.pnlPoints)) : 0,
    avgHoldBars: allTrades.length > 0 ? allTrades.reduce((s, t) => s + t.holdBars, 0) / allTrades.length : 0,
    timestamp: Date.now(),
  };
}

// ── Saved Results ──

const STORAGE_KEY = "ndx_strategy_results";

export function loadSavedResults(): StrategyResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveResult(result: StrategyResult): StrategyResult[] {
  const existing = loadSavedResults();
  existing.unshift(result);
  // Keep last 50
  const trimmed = existing.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deleteSavedResult(timestamp: number): StrategyResult[] {
  const existing = loadSavedResults();
  const filtered = existing.filter(r => r.timestamp !== timestamp);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}
