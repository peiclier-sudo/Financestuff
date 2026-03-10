import { Bar, TradingDay } from "./types";
import { TradeResult } from "./strategies";

// ── Custom Strategy Rule Format ──

export interface ConditionRule {
  type:
    | "candle_bullish"      // bar at barIndex closed green
    | "candle_bearish"      // bar at barIndex closed red
    | "candle_body_min_pct" // bar body >= value% of open
    | "gap_up"              // day gaps up
    | "gap_down"            // day gaps down
    | "gap_min_pct"         // |gap%| >= value
    | "price_above_prev_close" // bar close > prev close
    | "price_below_prev_close" // bar close < prev close
    | "price_above_open"    // bar close > day open
    | "price_below_open"    // bar close < day open
    | "first_n_bars_bullish"  // close of bar N > open of bar 0
    | "first_n_bars_bearish"  // close of bar N < open of bar 0
    | "prev_day_bullish"    // previous day was bullish
    | "prev_day_bearish"    // previous day was bearish
    | "bar_range_min_pct"   // bar (high-low)/open >= value%
    | "close_in_upper_half" // bar close in upper half of bar range
    | "close_in_lower_half"; // bar close in lower half of bar range
  barIndex?: number;  // which intraday bar (0 = first bar of day)
  value?: number;     // threshold value where applicable
}

export interface CustomStrategyDef {
  id: string;
  name: string;
  description: string;       // original natural language prompt
  conditions: ConditionRule[];
  direction: "long" | "short";
  entryBar: number;          // bar index to enter at (after conditions pass)
  entryPrice: "open" | "close";
  stopPoints: number;
  targetPoints: number;
  holdToClose: boolean;
  maxHoldBars?: number;      // optional: exit after N bars if not holdToClose
  timestamp: number;
}

// ── Condition Evaluator ──

function evaluateCondition(
  cond: ConditionRule,
  day: TradingDay,
  bars: Bar[],
): boolean {
  const bi = cond.barIndex ?? 0;
  const bar = bi < bars.length ? bars[bi] : null;

  switch (cond.type) {
    case "candle_bullish":
      return bar != null && bar.close > bar.open;
    case "candle_bearish":
      return bar != null && bar.close < bar.open;
    case "candle_body_min_pct":
      return bar != null && (Math.abs(bar.close - bar.open) / bar.open) * 100 >= (cond.value ?? 0);
    case "gap_up":
      return day.gapPercent != null && day.gapPercent > 0;
    case "gap_down":
      return day.gapPercent != null && day.gapPercent < 0;
    case "gap_min_pct":
      return day.gapPercent != null && Math.abs(day.gapPercent) >= (cond.value ?? 0);
    case "price_above_prev_close":
      return bar != null && day.prevClose != null && bar.close > day.prevClose;
    case "price_below_prev_close":
      return bar != null && day.prevClose != null && bar.close < day.prevClose;
    case "price_above_open":
      return bar != null && bar.close > bars[0].open;
    case "price_below_open":
      return bar != null && bar.close < bars[0].open;
    case "first_n_bars_bullish":
      return bi < bars.length && bars[bi].close > bars[0].open;
    case "first_n_bars_bearish":
      return bi < bars.length && bars[bi].close < bars[0].open;
    case "prev_day_bullish":
      return day.prevDayDirection === "bullish";
    case "prev_day_bearish":
      return day.prevDayDirection === "bearish";
    case "bar_range_min_pct":
      return bar != null && ((bar.high - bar.low) / bar.open) * 100 >= (cond.value ?? 0);
    case "close_in_upper_half":
      if (!bar || bar.high === bar.low) return false;
      return (bar.close - bar.low) / (bar.high - bar.low) >= 0.5;
    case "close_in_lower_half":
      if (!bar || bar.high === bar.low) return false;
      return (bar.close - bar.low) / (bar.high - bar.low) < 0.5;
    default:
      return false;
  }
}

// ── Custom Strategy Runner ──

export function runCustomStrategy(
  strategy: CustomStrategyDef,
  days: TradingDay[],
): TradeResult[] {
  const trades: TradeResult[] = [];

  for (const day of days) {
    const bars = day.bars;
    if (bars.length < 5) continue;

    // Check all conditions
    const allPass = strategy.conditions.every(cond =>
      evaluateCondition(cond, day, bars)
    );
    if (!allPass) continue;

    // Determine entry
    const ei = Math.min(strategy.entryBar, bars.length - 1);
    if (ei >= bars.length) continue;

    const entryPrice = strategy.entryPrice === "open" ? bars[ei].open : bars[ei].close;
    const dir = strategy.direction;
    const stopPts = strategy.stopPoints;
    const targetPts = strategy.targetPoints;

    // Determine max hold
    let maxHold: number;
    if (strategy.holdToClose) {
      maxHold = bars.length - ei;
    } else {
      maxHold = strategy.maxHoldBars ?? (bars.length - ei);
    }

    // Simulate trade
    let exitPrice = entryPrice;
    let exitTime = bars[ei].time;
    let hitTarget = false;
    let hitStop = false;
    let timedOut = false;
    let holdBars = 0;

    const maxIdx = Math.min(ei + maxHold, bars.length - 1);

    for (let i = ei; i <= maxIdx; i++) {
      const bar = bars[i];
      holdBars = i - ei;

      if (dir === "long") {
        if (stopPts > 0 && bar.low <= entryPrice - stopPts) {
          exitPrice = entryPrice - stopPts;
          exitTime = bar.time;
          hitStop = true;
          break;
        }
        if (targetPts > 0 && bar.high >= entryPrice + targetPts) {
          exitPrice = entryPrice + targetPts;
          exitTime = bar.time;
          hitTarget = true;
          break;
        }
      } else {
        if (stopPts > 0 && bar.high >= entryPrice + stopPts) {
          exitPrice = entryPrice + stopPts;
          exitTime = bar.time;
          hitStop = true;
          break;
        }
        if (targetPts > 0 && bar.low <= entryPrice - targetPts) {
          exitPrice = entryPrice - targetPts;
          exitTime = bar.time;
          hitTarget = true;
          break;
        }
      }

      if (i === maxIdx) {
        exitPrice = bar.close;
        exitTime = bar.time;
        timedOut = true;
      }
    }

    const pnlPoints = dir === "long"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice;

    // Compute stop/target prices
    let stopPrice: number | null = null;
    let targetPrice: number | null = null;
    if (stopPts > 0) {
      stopPrice = dir === "long" ? entryPrice - stopPts : entryPrice + stopPts;
    }
    if (targetPts > 0) {
      targetPrice = dir === "long" ? entryPrice + targetPts : entryPrice - targetPts;
    }

    trades.push({
      date: day.date,
      direction: dir,
      entryPrice,
      entryTime: bars[ei].time,
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
    });
  }

  return trades;
}

// ── localStorage Persistence ──

const CUSTOM_STRATEGIES_KEY = "ndx_custom_strategies";

export function loadCustomStrategies(): CustomStrategyDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STRATEGIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomStrategy(strategy: CustomStrategyDef): CustomStrategyDef[] {
  const existing = loadCustomStrategies();
  existing.unshift(strategy);
  const trimmed = existing.slice(0, 30);
  localStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deleteCustomStrategy(id: string): CustomStrategyDef[] {
  const existing = loadCustomStrategies();
  const filtered = existing.filter(s => s.id !== id);
  localStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(filtered));
  return filtered;
}
