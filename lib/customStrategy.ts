import { Bar, TradingDay } from "./types";
import { TradeResult } from "./strategies";

// ── Custom Strategy Rule Format ──

export interface SearchConfig {
  fromBar?: number;   // start scanning from this bar (default 0)
  toBar?: number;     // stop scanning at this bar (default 77 = end of day)
  occurrence?: number; // which occurrence to find (1 = first, 2 = second, default 1)
}

export interface ConditionRule {
  type:
    // ── Simple bar conditions ──
    | "candle_bullish"          // close > open (green)
    | "candle_bearish"          // close < open (red)
    | "candle_body_min_pct"     // body >= value% of open
    | "candle_body_max_pct"     // body <= value% of open
    | "bar_range_min_pct"       // (high-low)/open >= value%
    | "bar_range_max_pct"       // (high-low)/open <= value%
    | "close_in_upper_half"     // close in upper half of bar range
    | "close_in_lower_half"     // close in lower half of bar range
    | "price_above_open"        // bar close > day open
    | "price_below_open"        // bar close < day open
    | "price_above_prev_close"  // bar close > prev day close
    | "price_below_prev_close"  // bar close < prev day close
    | "higher_high"             // high > prev bar high
    | "lower_low"               // low < prev bar low
    | "higher_close"            // close > prev bar close
    | "lower_close"             // close < prev bar close
    | "break_above_high"        // close > highest high of all prior bars
    | "break_below_low"         // close < lowest low of all prior bars
    // ── Classic candle patterns ──
    | "inside_bar"              // high <= prev high AND low >= prev low
    | "outside_bar"             // high > prev high AND low < prev low
    | "wide_bar"                // range >= value× avg of prior 5 bars (default 1.5)
    | "narrow_bar"              // range <= value× avg of prior 5 bars (default 0.5)
    | "doji"                    // body <= value% of range (default 20)
    | "hammer"                  // lower wick >= 2× body, upper wick <= body
    | "shooting_star"           // upper wick >= 2× body, lower wick <= body
    | "marubozu_bullish"        // bullish, tiny wicks (each <= value% of range, default 10)
    | "marubozu_bearish"        // bearish, tiny wicks
    | "spinning_top"            // body <= 30% of range, both wicks >= 25% of range
    | "engulfing_bullish"       // bullish body engulfs prev bearish body
    | "engulfing_bearish"       // bearish body engulfs prev bullish body
    | "pin_bar_bullish"         // lower wick >= 60% of range, close in upper 30%
    | "pin_bar_bearish"         // upper wick >= 60% of range, close in lower 30%
    | "tweezer_top"             // two bars with same high (within 0.01%)
    | "tweezer_bottom"          // two bars with same low (within 0.01%)
    // ── Multi-bar patterns ──
    | "three_bar_bullish"       // bearish, inside/doji, bullish
    | "three_bar_bearish"       // bullish, inside/doji, bearish
    | "morning_star"            // bearish, small-body gap-down, bullish closing above midpoint of first
    | "evening_star"            // bullish, small-body gap-up, bearish closing below midpoint of first
    | "consecutive_bullish"     // value consecutive green bars ending at bi
    | "consecutive_bearish"     // value consecutive red bars ending at bi
    // ── Relative / comparison ──
    | "body_larger_than_prev"   // current body > prev body
    | "body_smaller_than_prev"  // current body < prev body
    // ── Reference level conditions ──
    | "above_opening_range"     // bar close > high of first value bars (value = N bars, default 6)
    | "below_opening_range"     // bar close < low of first value bars
    | "close_above_sma"         // bar close > simple moving avg of last value bars
    | "close_below_sma"         // bar close < simple moving avg of last value bars
    // ── Gap conditions ──
    | "gap_up"                  // day gapped up
    | "gap_down"                // day gapped down
    | "gap_min_pct"             // |gap%| >= value
    | "gap_filled"              // bar close crosses back through prev close (gap fill)
    // ── Day-level conditions ──
    | "prev_day_bullish"        // previous day green
    | "prev_day_bearish"        // previous day red
    | "first_n_bars_bullish"    // close at barIndex > day open
    | "first_n_bars_bearish"    // close at barIndex < day open
    // ── Time-based conditions ──
    | "time_after"              // bar index >= value (value = bar number, e.g. 6 = after 10:00)
    | "time_before"             // bar index <= value
    // ── Consolidation ──
    | "consolidation";          // last value bars have range <= avg range × 0.5

  barIndex?: number;
  value?: number;
  search?: SearchConfig;
}

export interface CustomStrategyDef {
  id: string;
  name: string;
  description: string;
  conditions: ConditionRule[];
  direction: "long" | "short";
  entryBar: number;
  entryPrice: "open" | "close";
  entryMode?: "fixed" | "after_pattern";
  entryOffset?: number;
  stopPoints: number;
  targetPoints: number;
  stopAtr?: number;     // dynamic stop: value × ATR of last N bars before entry
  targetAtr?: number;   // dynamic target: value × ATR
  atrLength?: number;   // lookback for ATR calculation (default 14)
  holdToClose: boolean;
  maxHoldBars?: number;
  timestamp: number;
}

// ── Helpers ──

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

function computeATR(bars: Bar[], endIdx: number, length: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(1, endIdx - length + 1); i <= endIdx; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : barRange(bars[endIdx]);
}

function sma(bars: Bar[], endIdx: number, length: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, endIdx - length + 1); i <= endIdx; i++) {
    sum += bars[i].close;
    count++;
  }
  return count > 0 ? sum / count : bars[endIdx].close;
}

// ── Pattern Matchers ──

function isDoji(bars: Bar[], bi: number, maxBodyPct: number): boolean {
  if (bi >= bars.length) return false;
  const bar = bars[bi];
  const range = barRange(bar);
  if (range === 0) return true;
  return (barBody(bar) / range) * 100 <= maxBodyPct;
}

// ── Unified Condition Evaluator ──

function evaluateConditionAtBar(
  cond: ConditionRule,
  day: TradingDay,
  bars: Bar[],
  bi: number,
): boolean {
  const bar = bi >= 0 && bi < bars.length ? bars[bi] : null;

  switch (cond.type) {
    // ── Simple bar conditions ──
    case "candle_bullish":
      return bar != null && bar.close > bar.open;
    case "candle_bearish":
      return bar != null && bar.close < bar.open;
    case "candle_body_min_pct":
      return bar != null && (barBody(bar) / bar.open) * 100 >= (cond.value ?? 0);
    case "candle_body_max_pct":
      return bar != null && (barBody(bar) / bar.open) * 100 <= (cond.value ?? 0);
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
    case "price_above_open":
      return bar != null && bar.close > bars[0].open;
    case "price_below_open":
      return bar != null && bar.close < bars[0].open;
    case "price_above_prev_close":
      return bar != null && day.prevClose != null && bar.close > day.prevClose;
    case "price_below_prev_close":
      return bar != null && day.prevClose != null && bar.close < day.prevClose;
    case "higher_high":
      return bi >= 1 && bar != null && bar.high > bars[bi - 1].high;
    case "lower_low":
      return bi >= 1 && bar != null && bar.low < bars[bi - 1].low;
    case "higher_close":
      return bi >= 1 && bar != null && bar.close > bars[bi - 1].close;
    case "lower_close":
      return bi >= 1 && bar != null && bar.close < bars[bi - 1].close;
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

    // ── Classic candle patterns ──
    case "inside_bar":
      if (bi < 1 || bi >= bars.length) return false;
      return bars[bi].high <= bars[bi - 1].high && bars[bi].low >= bars[bi - 1].low;
    case "outside_bar":
      if (bi < 1 || bi >= bars.length) return false;
      return bars[bi].high > bars[bi - 1].high && bars[bi].low < bars[bi - 1].low;
    case "wide_bar": {
      if (bi < 1 || bi >= bars.length) return false;
      const avg = avgRangeOfPrior(bars, bi, 5);
      return barRange(bars[bi]) >= (cond.value ?? 1.5) * avg;
    }
    case "narrow_bar": {
      if (bi < 1 || bi >= bars.length) return false;
      const avg = avgRangeOfPrior(bars, bi, 5);
      return barRange(bars[bi]) <= (cond.value ?? 0.5) * avg;
    }
    case "doji":
      return isDoji(bars, bi, cond.value ?? 20);
    case "hammer": {
      if (!bar) return false;
      const body = barBody(bar);
      const range = barRange(bar);
      if (range === 0 || body === 0) return false;
      const lw = Math.min(bar.open, bar.close) - bar.low;
      const uw = bar.high - Math.max(bar.open, bar.close);
      return lw >= 2 * body && uw <= body;
    }
    case "shooting_star": {
      if (!bar) return false;
      const body = barBody(bar);
      const range = barRange(bar);
      if (range === 0 || body === 0) return false;
      const uw = bar.high - Math.max(bar.open, bar.close);
      const lw = Math.min(bar.open, bar.close) - bar.low;
      return uw >= 2 * body && lw <= body;
    }
    case "marubozu_bullish": {
      if (!bar || bar.close <= bar.open) return false;
      const range = barRange(bar);
      if (range === 0) return false;
      const maxWickPct = cond.value ?? 10;
      const uw = bar.high - bar.close;
      const lw = bar.open - bar.low;
      return (uw / range) * 100 <= maxWickPct && (lw / range) * 100 <= maxWickPct;
    }
    case "marubozu_bearish": {
      if (!bar || bar.close >= bar.open) return false;
      const range = barRange(bar);
      if (range === 0) return false;
      const maxWickPct = cond.value ?? 10;
      const uw = bar.high - bar.open;
      const lw = bar.close - bar.low;
      return (uw / range) * 100 <= maxWickPct && (lw / range) * 100 <= maxWickPct;
    }
    case "spinning_top": {
      if (!bar) return false;
      const range = barRange(bar);
      if (range === 0) return false;
      const body = barBody(bar);
      const uw = bar.high - Math.max(bar.open, bar.close);
      const lw = Math.min(bar.open, bar.close) - bar.low;
      return (body / range) <= 0.3 && (uw / range) >= 0.25 && (lw / range) >= 0.25;
    }
    case "engulfing_bullish": {
      if (bi < 1 || bi >= bars.length) return false;
      const curr = bars[bi], prev = bars[bi - 1];
      if (curr.close <= curr.open || prev.close >= prev.open) return false;
      return curr.close > prev.open && curr.open < prev.close;
    }
    case "engulfing_bearish": {
      if (bi < 1 || bi >= bars.length) return false;
      const curr = bars[bi], prev = bars[bi - 1];
      if (curr.close >= curr.open || prev.close <= prev.open) return false;
      return curr.open > prev.close && curr.close < prev.open;
    }
    case "pin_bar_bullish": {
      if (!bar) return false;
      const range = barRange(bar);
      if (range === 0) return false;
      const lw = Math.min(bar.open, bar.close) - bar.low;
      return lw / range >= 0.6 && (bar.close - bar.low) / range >= 0.7;
    }
    case "pin_bar_bearish": {
      if (!bar) return false;
      const range = barRange(bar);
      if (range === 0) return false;
      const uw = bar.high - Math.max(bar.open, bar.close);
      return uw / range >= 0.6 && (bar.high - bar.close) / range >= 0.7;
    }
    case "tweezer_top": {
      if (bi < 1 || !bar) return false;
      const prev = bars[bi - 1];
      const tolerance = bar.high * 0.0001; // 0.01%
      return Math.abs(bar.high - prev.high) <= tolerance;
    }
    case "tweezer_bottom": {
      if (bi < 1 || !bar) return false;
      const prev = bars[bi - 1];
      const tolerance = bar.low * 0.0001;
      return Math.abs(bar.low - prev.low) <= tolerance;
    }

    // ── Multi-bar patterns ──
    case "three_bar_bullish": {
      if (bi < 2 || bi >= bars.length) return false;
      const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
      return b0.close < b0.open
        && ((b1.high <= b0.high && b1.low >= b0.low) || isDoji(bars, bi - 1, 30))
        && b2.close > b2.open;
    }
    case "three_bar_bearish": {
      if (bi < 2 || bi >= bars.length) return false;
      const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
      return b0.close > b0.open
        && ((b1.high <= b0.high && b1.low >= b0.low) || isDoji(bars, bi - 1, 30))
        && b2.close < b2.open;
    }
    case "morning_star": {
      // bearish candle, small body (gap down or small), bullish candle closing above midpoint of first
      if (bi < 2 || bi >= bars.length) return false;
      const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
      const b0Bearish = b0.close < b0.open;
      const b1Small = barBody(b1) <= barRange(b1) * 0.35;
      const b2Bullish = b2.close > b2.open;
      const b0Mid = (b0.open + b0.close) / 2;
      return b0Bearish && b1Small && b2Bullish && b2.close > b0Mid;
    }
    case "evening_star": {
      if (bi < 2 || bi >= bars.length) return false;
      const b0 = bars[bi - 2], b1 = bars[bi - 1], b2 = bars[bi];
      const b0Bullish = b0.close > b0.open;
      const b1Small = barBody(b1) <= barRange(b1) * 0.35;
      const b2Bearish = b2.close < b2.open;
      const b0Mid = (b0.open + b0.close) / 2;
      return b0Bullish && b1Small && b2Bearish && b2.close < b0Mid;
    }
    case "consecutive_bullish": {
      const n = cond.value ?? 3;
      if (bi < n - 1) return false;
      for (let k = bi - n + 1; k <= bi; k++) {
        if (k < 0 || k >= bars.length || bars[k].close <= bars[k].open) return false;
      }
      return true;
    }
    case "consecutive_bearish": {
      const n = cond.value ?? 3;
      if (bi < n - 1) return false;
      for (let k = bi - n + 1; k <= bi; k++) {
        if (k < 0 || k >= bars.length || bars[k].close >= bars[k].open) return false;
      }
      return true;
    }

    // ── Relative / comparison ──
    case "body_larger_than_prev":
      if (bi < 1 || !bar) return false;
      return barBody(bar) > barBody(bars[bi - 1]);
    case "body_smaller_than_prev":
      if (bi < 1 || !bar) return false;
      return barBody(bar) < barBody(bars[bi - 1]);

    // ── Reference levels ──
    case "above_opening_range": {
      if (!bar) return false;
      const n = cond.value ?? 6;
      let orHigh = -Infinity;
      for (let k = 0; k < Math.min(n, bars.length); k++) orHigh = Math.max(orHigh, bars[k].high);
      return bi >= n && bar.close > orHigh;
    }
    case "below_opening_range": {
      if (!bar) return false;
      const n = cond.value ?? 6;
      let orLow = Infinity;
      for (let k = 0; k < Math.min(n, bars.length); k++) orLow = Math.min(orLow, bars[k].low);
      return bi >= n && bar.close < orLow;
    }
    case "close_above_sma": {
      if (!bar) return false;
      const len = cond.value ?? 20;
      if (bi < len - 1) return false;
      return bar.close > sma(bars, bi, len);
    }
    case "close_below_sma": {
      if (!bar) return false;
      const len = cond.value ?? 20;
      if (bi < len - 1) return false;
      return bar.close < sma(bars, bi, len);
    }

    // ── Gap conditions ──
    case "gap_up":
      return day.gapPercent != null && day.gapPercent > 0;
    case "gap_down":
      return day.gapPercent != null && day.gapPercent < 0;
    case "gap_min_pct":
      return day.gapPercent != null && Math.abs(day.gapPercent) >= (cond.value ?? 0);
    case "gap_filled": {
      if (!bar || day.prevClose == null) return false;
      if (day.gapPercent == null || day.gapPercent === 0) return false;
      // Gap up filled = price dips to or below prev close
      if (day.gapPercent > 0) return bar.low <= day.prevClose;
      // Gap down filled = price rises to or above prev close
      return bar.high >= day.prevClose;
    }

    // ── Day-level conditions ──
    case "prev_day_bullish":
      return day.prevDayDirection === "bullish";
    case "prev_day_bearish":
      return day.prevDayDirection === "bearish";
    case "first_n_bars_bullish":
      return bi < bars.length && bars[bi].close > bars[0].open;
    case "first_n_bars_bearish":
      return bi < bars.length && bars[bi].close < bars[0].open;

    // ── Time-based ──
    case "time_after":
      return bi >= (cond.value ?? 0);
    case "time_before":
      return bi <= (cond.value ?? 77);

    // ── Consolidation ──
    case "consolidation": {
      const n = cond.value ?? 5;
      if (bi < n - 1 || !bar) return false;
      let maxH = -Infinity, minL = Infinity;
      for (let k = bi - n + 1; k <= bi; k++) {
        maxH = Math.max(maxH, bars[k].high);
        minL = Math.min(minL, bars[k].low);
      }
      const consolidationRange = maxH - minL;
      const avg = avgRangeOfPrior(bars, bi - n + 1, 10);
      return consolidationRange <= avg * (n * 0.5);
    }

    default:
      return false;
  }
}

// ── Search: find the Nth occurrence of a pattern in a bar range ──

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
        const foundAt = searchForPattern(cond, day, bars, cond.search);
        if (foundAt < 0) {
          allPass = false;
          break;
        }
        lastPatternBar = Math.max(lastPatternBar, foundAt);
      } else {
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
      ei = lastPatternBar + (strategy.entryOffset ?? 1);
    } else {
      ei = strategy.entryBar;
    }
    ei = Math.min(ei, bars.length - 1);
    if (ei >= bars.length || ei < 0) continue;

    const entryPrice = strategy.entryPrice === "open" ? bars[ei].open : bars[ei].close;
    const dir = strategy.direction;

    // Compute stop/target — ATR-based or fixed
    let stopPts = strategy.stopPoints;
    let targetPts = strategy.targetPoints;
    if (strategy.stopAtr && strategy.stopAtr > 0) {
      const atr = computeATR(bars, Math.max(ei - 1, 1), strategy.atrLength ?? 14);
      stopPts = strategy.stopAtr * atr;
    }
    if (strategy.targetAtr && strategy.targetAtr > 0) {
      const atr = computeATR(bars, Math.max(ei - 1, 1), strategy.atrLength ?? 14);
      targetPts = strategy.targetAtr * atr;
    }

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
      const b = bars[i];
      holdBars = i - ei;

      if (dir === "long") {
        if (stopPts > 0 && b.low <= entryPrice - stopPts) {
          exitPrice = entryPrice - stopPts;
          exitTime = b.time;
          hitStop = true;
          break;
        }
        if (targetPts > 0 && b.high >= entryPrice + targetPts) {
          exitPrice = entryPrice + targetPts;
          exitTime = b.time;
          hitTarget = true;
          break;
        }
      } else {
        if (stopPts > 0 && b.high >= entryPrice + stopPts) {
          exitPrice = entryPrice + stopPts;
          exitTime = b.time;
          hitStop = true;
          break;
        }
        if (targetPts > 0 && b.low <= entryPrice - targetPts) {
          exitPrice = entryPrice - targetPts;
          exitTime = b.time;
          hitTarget = true;
          break;
        }
      }

      if (i === maxIdx) {
        exitPrice = b.close;
        exitTime = b.time;
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
