import { Bar, TradingDay } from "./types";
import { TradeResult } from "./strategies";

// ── Custom Strategy Rule Format ──

// Search config: dynamically scan bars for a pattern instead of checking a fixed bar
export interface SearchConfig {
  fromBar?: number;   // start scanning from this bar (default 0)
  toBar?: number;     // stop scanning at this bar (default 77 = end of day)
  occurrence?: number; // which occurrence to find (1 = first, 2 = second, default 1)
}

export interface ConditionRule {
  type:
    // ── Fixed-bar conditions (use barIndex) ──
    | "candle_bullish"        // bar closed green (close > open)
    | "candle_bearish"        // bar closed red (close < open)
    | "candle_body_min_pct"   // bar body >= value% of open
    | "candle_body_max_pct"   // bar body <= value% of open
    | "gap_up"                // day gaps up
    | "gap_down"              // day gaps down
    | "gap_min_pct"           // |gap%| >= value
    | "price_above_prev_close"// bar close > prev close
    | "price_below_prev_close"// bar close < prev close
    | "price_above_open"      // bar close > day open
    | "price_below_open"      // bar close < day open
    | "first_n_bars_bullish"  // close of bar N > open of bar 0
    | "first_n_bars_bearish"  // close of bar N < open of bar 0
    | "prev_day_bullish"      // previous day was bullish
    | "prev_day_bearish"      // previous day was bearish
    | "bar_range_min_pct"     // bar (high-low)/open >= value%
    | "bar_range_max_pct"     // bar (high-low)/open <= value%
    | "close_in_upper_half"   // bar close in upper half of bar range
    | "close_in_lower_half"   // bar close in lower half of bar range
    // ── Pattern-based conditions (use barIndex OR search) ──
    | "inside_bar"            // bar high <= prev high AND bar low >= prev low
    | "outside_bar"           // bar high > prev high AND bar low < prev low (engulfing range)
    | "wide_bar"              // bar range >= value * avg range of prior 5 bars
    | "narrow_bar"            // bar range <= value * avg range of prior 5 bars
    | "doji"                  // body <= value% of total range (default 20%)
    | "hammer"                // lower wick >= 2x body AND upper wick <= body, bullish bias
    | "shooting_star"         // upper wick >= 2x body AND lower wick <= body, bearish bias
    | "engulfing_bullish"     // bullish bar whose body fully engulfs previous bar's body
    | "engulfing_bearish"     // bearish bar whose body fully engulfs previous bar's body
    | "pin_bar_bullish"       // long lower wick (>= 60% of range), close in upper 30%
    | "pin_bar_bearish"       // long upper wick (>= 60% of range), close in lower 30%
    | "three_bar_bullish"     // 3-bar reversal: down, inside/doji, up (starts at barIndex-2)
    | "three_bar_bearish"     // 3-bar reversal: up, inside/doji, down (starts at barIndex-2)
    | "higher_high"           // bar makes a higher high than previous bar
    | "lower_low"             // bar makes a lower low than previous bar
    | "higher_close"          // bar closes higher than previous bar
    | "lower_close"           // bar closes lower than previous bar
    | "break_above_high"      // bar close > highest high of bars 0..barIndex-1
    | "break_below_low";      // bar close < lowest low of bars 0..barIndex-1

  barIndex?: number;   // fixed bar reference (0 = first bar of day)
  value?: number;      // threshold value where applicable
  search?: SearchConfig; // dynamic search: find Nth occurrence in a range
}

export interface CustomStrategyDef {
  id: string;
  name: string;
  description: string;       // original natural language prompt
  conditions: ConditionRule[];
  direction: "long" | "short";
  entryBar: number;          // fixed bar index (used when entryMode is "fixed")
  entryPrice: "open" | "close";
  entryMode?: "fixed" | "after_pattern"; // "after_pattern" = enter relative to last dynamic match
  entryOffset?: number;      // bars after pattern match to enter (default 1, used with after_pattern)
  stopPoints: number;
  targetPoints: number;
  holdToClose: boolean;
  maxHoldBars?: number;
  timestamp: number;
}

// ── Pattern Matchers ──
// Each returns true if bar at `bi` matches the pattern

function isInsideBar(bars: Bar[], bi: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  return bars[bi].high <= bars[bi - 1].high && bars[bi].low >= bars[bi - 1].low;
}

function isOutsideBar(bars: Bar[], bi: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  return bars[bi].high > bars[bi - 1].high && bars[bi].low < bars[bi - 1].low;
}

function barRange(bar: Bar): number {
  return bar.high - bar.low;
}

function barBody(bar: Bar): number {
  return Math.abs(bar.close - bar.open);
}

function avgRangeOfPrior(bars: Bar[], bi: number, lookback: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, bi - lookback); i < bi; i++) {
    sum += barRange(bars[i]);
    count++;
  }
  return count > 0 ? sum / count : barRange(bars[bi]);
}

function isWideBar(bars: Bar[], bi: number, multiplier: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  const avg = avgRangeOfPrior(bars, bi, 5);
  return barRange(bars[bi]) >= multiplier * avg;
}

function isNarrowBar(bars: Bar[], bi: number, multiplier: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  const avg = avgRangeOfPrior(bars, bi, 5);
  return barRange(bars[bi]) <= multiplier * avg;
}

function isDoji(bars: Bar[], bi: number, maxBodyPct: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const range = barRange(bar);
  if (range === 0) return true;
  return (barBody(bar) / range) * 100 <= maxBodyPct;
}

function isHammer(bars: Bar[], bi: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const body = barBody(bar);
  const range = barRange(bar);
  if (range === 0 || body === 0) return false;
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  return lowerWick >= 2 * body && upperWick <= body;
}

function isShootingStar(bars: Bar[], bi: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const body = barBody(bar);
  const range = barRange(bar);
  if (range === 0 || body === 0) return false;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  return upperWick >= 2 * body && lowerWick <= body;
}

function isEngulfingBullish(bars: Bar[], bi: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  const curr = bars[bi];
  const prev = bars[bi - 1];
  if (curr.close <= curr.open) return false; // must be bullish
  if (prev.close >= prev.open) return false; // prev must be bearish
  return curr.close > prev.open && curr.open < prev.close;
}

function isEngulfingBearish(bars: Bar[], bi: number): boolean {
  if (bi < 1 || bi >= bars.length) return false;
  const curr = bars[bi];
  const prev = bars[bi - 1];
  if (curr.close >= curr.open) return false; // must be bearish
  if (prev.close <= prev.open) return false; // prev must be bullish
  return curr.open > prev.close && curr.close < prev.open;
}

function isPinBarBullish(bars: Bar[], bi: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const range = barRange(bar);
  if (range === 0) return false;
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  return lowerWick / range >= 0.6 && (bar.close - bar.low) / range >= 0.7;
}

function isPinBarBearish(bars: Bar[], bi: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const range = barRange(bar);
  if (range === 0) return false;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  return upperWick / range >= 0.6 && (bar.high - bar.close) / range >= 0.7;
}

function isThreeBarBullish(bars: Bar[], bi: number): boolean {
  // 3-bar pattern ending at bi: bar[bi-2] bearish, bar[bi-1] inside or doji, bar[bi] bullish
  if (bi < 2 || bi >= bars.length) return false;
  const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
  const b0Bearish = b0.close < b0.open;
  const b1Inside = (b1.high <= b0.high && b1.low >= b0.low) || isDoji(bars, bi - 1, 30);
  const b2Bullish = b2.close > b2.open;
  return b0Bearish && b1Inside && b2Bullish;
}

function isThreeBarBearish(bars: Bar[], bi: number): boolean {
  if (bi < 2 || bi >= bars.length) return false;
  const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
  const b0Bullish = b0.close > b0.open;
  const b1Inside = (b1.high <= b0.high && b1.low >= b0.low) || isDoji(bars, bi - 1, 30);
  const b2Bearish = b2.close < b2.open;
  return b0Bullish && b1Inside && b2Bearish;
}

// ── Unified Condition Evaluator ──
// Returns true/false for a single condition at a specific bar index

function evaluateConditionAtBar(
  cond: ConditionRule,
  day: TradingDay,
  bars: Bar[],
  bi: number,
): boolean {
  const bar = bi >= 0 && bi < bars.length ? bars[bi] : null;

  switch (cond.type) {
    // ── Fixed / simple conditions ──
    case "candle_bullish":
      return bar != null && bar.close > bar.open;
    case "candle_bearish":
      return bar != null && bar.close < bar.open;
    case "candle_body_min_pct":
      return bar != null && (barBody(bar) / bar.open) * 100 >= (cond.value ?? 0);
    case "candle_body_max_pct":
      return bar != null && (barBody(bar) / bar.open) * 100 <= (cond.value ?? 0);
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
      return bar != null && (barRange(bar) / bar.open) * 100 >= (cond.value ?? 0);
    case "bar_range_max_pct":
      return bar != null && (barRange(bar) / bar.open) * 100 <= (cond.value ?? 0);
    case "close_in_upper_half":
      if (!bar || bar.high === bar.low) return false;
      return (bar.close - bar.low) / (bar.high - bar.low) >= 0.5;
    case "close_in_lower_half":
      if (!bar || bar.high === bar.low) return false;
      return (bar.close - bar.low) / (bar.high - bar.low) < 0.5;

    // ── Pattern conditions ──
    case "inside_bar":
      return isInsideBar(bars, bi);
    case "outside_bar":
      return isOutsideBar(bars, bi);
    case "wide_bar":
      return isWideBar(bars, bi, cond.value ?? 1.5);
    case "narrow_bar":
      return isNarrowBar(bars, bi, cond.value ?? 0.5);
    case "doji":
      return isDoji(bars, bi, cond.value ?? 20);
    case "hammer":
      return isHammer(bars, bi);
    case "shooting_star":
      return isShootingStar(bars, bi);
    case "engulfing_bullish":
      return isEngulfingBullish(bars, bi);
    case "engulfing_bearish":
      return isEngulfingBearish(bars, bi);
    case "pin_bar_bullish":
      return isPinBarBullish(bars, bi);
    case "pin_bar_bearish":
      return isPinBarBearish(bars, bi);
    case "three_bar_bullish":
      return isThreeBarBullish(bars, bi);
    case "three_bar_bearish":
      return isThreeBarBearish(bars, bi);
    case "higher_high":
      return bi >= 1 && bar != null && bars[bi].high > bars[bi - 1].high;
    case "lower_low":
      return bi >= 1 && bar != null && bars[bi].low < bars[bi - 1].low;
    case "higher_close":
      return bi >= 1 && bar != null && bars[bi].close > bars[bi - 1].close;
    case "lower_close":
      return bi >= 1 && bar != null && bars[bi].close < bars[bi - 1].close;
    case "break_above_high": {
      if (!bar || bi < 1) return false;
      let maxHigh = -Infinity;
      for (let j = 0; j < bi; j++) maxHigh = Math.max(maxHigh, bars[j].high);
      return bar.close > maxHigh;
    }
    case "break_below_low": {
      if (!bar || bi < 1) return false;
      let minLow = Infinity;
      for (let j = 0; j < bi; j++) minLow = Math.min(minLow, bars[j].low);
      return bar.close < minLow;
    }
    default:
      return false;
  }
}

// ── Search: find the Nth occurrence of a pattern in a bar range ──
// Returns the bar index where the pattern was found, or -1

function searchForPattern(
  cond: ConditionRule,
  day: TradingDay,
  bars: Bar[],
  search: SearchConfig,
): number {
  const from = search.fromBar ?? 0;
  const to = Math.min(search.toBar ?? bars.length - 1, bars.length - 1);
  const targetOccurrence = search.occurrence ?? 1;
  let found = 0;

  for (let i = from; i <= to; i++) {
    if (evaluateConditionAtBar(cond, day, bars, i)) {
      found++;
      if (found === targetOccurrence) return i;
    }
  }
  return -1;
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

    // Evaluate all conditions, tracking the last dynamically-found bar index
    let allPass = true;
    let lastPatternBar = -1;

    for (const cond of strategy.conditions) {
      if (cond.search) {
        // Dynamic search: find the pattern in a range
        const foundAt = searchForPattern(cond, day, bars, cond.search);
        if (foundAt < 0) {
          allPass = false;
          break;
        }
        lastPatternBar = Math.max(lastPatternBar, foundAt);
      } else {
        // Fixed bar check
        const bi = cond.barIndex ?? 0;
        if (!evaluateConditionAtBar(cond, day, bars, bi)) {
          allPass = false;
          break;
        }
      }
    }

    if (!allPass) continue;

    // Determine entry bar
    let ei: number;
    if (strategy.entryMode === "after_pattern" && lastPatternBar >= 0) {
      const offset = strategy.entryOffset ?? 1;
      ei = lastPatternBar + offset;
    } else {
      ei = strategy.entryBar;
    }
    ei = Math.min(ei, bars.length - 1);
    if (ei >= bars.length || ei < 0) continue;

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
