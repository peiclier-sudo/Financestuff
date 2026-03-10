import { Bar, TradingDay } from "./types";
import { TradeResult, StrategyResult } from "./strategies";

// ══════════════════════════════════════════════════════════
// Block Type Definitions
// ══════════════════════════════════════════════════════════

// ── Entry Block ──

export type EntryType =
  | "candle_breakout"
  | "level_breakout"
  | "candle_close"
  | "time_entry"
  | "pattern_entry"
  | "atr_breakout";

export interface EntryBlock {
  type: EntryType;
  direction: "long" | "short" | "auto";
  // candle_breakout
  candleStart?: number;
  candleEnd?: number;
  breakSide?: "high" | "low";
  // level_breakout
  level?: "day_open" | "prev_close" | "prev_day_high" | "prev_day_low" | "opening_range_high" | "opening_range_low";
  orBars?: number; // for opening range
  // candle_close
  closeBar?: number;
  closeDirection?: "bullish" | "bearish" | "any";
  // time_entry
  entryBar?: number;
  // pattern_entry
  pattern?: string;
  searchFrom?: number;
  searchTo?: number;
  occurrence?: number;
  entryOffset?: number;
  // atr_breakout
  atrMultiplier?: number;
  atrLength?: number;
  atrSide?: "above" | "below";
}

// ── Exit Block (Stop Loss) ──

export type ExitType =
  | "none"
  | "fixed_points"
  | "candle_extremity"
  | "atr"
  | "level"
  | "prev_day_range";

export interface ExitBlock {
  type: ExitType;
  // fixed_points
  points?: number;
  // candle_extremity
  candleRef?: "entry" | "prev" | "group";
  groupStart?: number;
  groupEnd?: number;
  padding?: number;
  // atr
  atrMultiplier?: number;
  atrLength?: number;
  // level
  levelType?: "prev_close" | "prev_day_high" | "prev_day_low" | "day_open";
  // prev_day_range
  rangeMultiplier?: number;
}

// ── Take Profit Block ──

export type TakeProfitType =
  | "none"
  | "fixed_points"
  | "risk_multiple"
  | "prev_day_level"
  | "atr"
  | "hold_bars";

export interface TakeProfitBlock {
  type: TakeProfitType;
  // fixed_points
  points?: number;
  // risk_multiple
  riskMultiple?: number;
  // prev_day_level
  levelType?: "prev_day_high" | "prev_day_low" | "prev_close" | "day_open" | "prev_day_gap";
  // atr
  atrMultiplier?: number;
  atrLength?: number;
  // hold_bars
  holdBars?: number;
}

// ── Management Block ──

export type ManagementType = "none" | "be" | "trail" | "be_and_trail";

export type BETriggerType = "points" | "risk_multiple" | "level" | "day_open";
export type TrailTriggerType = "points" | "risk_multiple" | "level";
export type TrailMethodType = "candle_hl" | "atr" | "fixed_distance";

export interface ManagementBlock {
  type: ManagementType;
  // BE config
  beTrigger?: BETriggerType;
  beValue?: number;
  beLevel?: "prev_day_high" | "prev_day_low" | "prev_close" | "day_open";
  // Trail config
  trailTrigger?: TrailTriggerType;
  trailTriggerValue?: number;
  trailTriggerLevel?: "prev_day_high" | "prev_day_low" | "prev_close" | "day_open";
  trailMethod?: TrailMethodType;
  trailMethodValue?: number; // candle_hl: lookback N, atr: multiplier, fixed: pts distance
  trailAtrLength?: number;
}

// ── Combined Block Strategy ──

export interface BlockStrategy {
  id: string;
  name: string;
  description: string;
  entry: EntryBlock;
  exit: ExitBlock;
  takeProfit: TakeProfitBlock;
  management: ManagementBlock;
  timestamp: number;
}

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function computeATR(bars: Bar[], endIdx: number, length: number): number {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(1, endIdx - length + 1); i <= endIdx && i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : (bars[endIdx] ? bars[endIdx].high - bars[endIdx].low : 10);
}

// ══════════════════════════════════════════════════════════
// Entry Resolution
// ══════════════════════════════════════════════════════════

interface EntryResult {
  barIdx: number;
  price: number;
  direction: "long" | "short";
}

export function resolveEntry(day: TradingDay, entry: EntryBlock): EntryResult | null {
  const bars = day.bars;
  if (bars.length < 5) return null;

  const resolveDir = (autoLong: boolean): "long" | "short" => {
    if (entry.direction === "auto") return autoLong ? "long" : "short";
    return entry.direction;
  };

  switch (entry.type) {
    case "candle_breakout": {
      const start = entry.candleStart ?? 0;
      const end = Math.min(entry.candleEnd ?? start, bars.length - 1);
      let rangeHigh = -Infinity, rangeLow = Infinity;
      for (let i = start; i <= end && i < bars.length; i++) {
        rangeHigh = Math.max(rangeHigh, bars[i].high);
        rangeLow = Math.min(rangeLow, bars[i].low);
      }
      const scanFrom = end + 1;
      const side = entry.breakSide ?? "high";
      for (let i = scanFrom; i < bars.length; i++) {
        if (side === "high" && bars[i].high > rangeHigh) {
          return { barIdx: i, price: rangeHigh, direction: resolveDir(true) };
        }
        if (side === "low" && bars[i].low < rangeLow) {
          return { barIdx: i, price: rangeLow, direction: resolveDir(false) };
        }
      }
      return null;
    }

    case "level_breakout": {
      let level: number | null = null;
      const lType = entry.level ?? "day_open";
      if (lType === "day_open") level = day.open;
      else if (lType === "prev_close") level = day.prevClose;
      else if (lType === "prev_day_high") level = day.prevDayHigh;
      else if (lType === "prev_day_low") level = day.prevDayLow;
      else if (lType === "opening_range_high" || lType === "opening_range_low") {
        const n = entry.orBars ?? 6;
        if (lType === "opening_range_high") {
          let h = -Infinity;
          for (let k = 0; k < Math.min(n, bars.length); k++) h = Math.max(h, bars[k].high);
          level = h;
        } else {
          let l = Infinity;
          for (let k = 0; k < Math.min(n, bars.length); k++) l = Math.min(l, bars[k].low);
          level = l;
        }
      }
      if (level == null) return null;
      // Determine if price starts above or below
      const startAbove = bars[0].open >= level;
      for (let i = 1; i < bars.length; i++) {
        if (startAbove && bars[i].low <= level) {
          return { barIdx: i, price: level, direction: resolveDir(false) };
        }
        if (!startAbove && bars[i].high >= level) {
          return { barIdx: i, price: level, direction: resolveDir(true) };
        }
      }
      return null;
    }

    case "candle_close": {
      const bi = Math.min(entry.closeBar ?? 0, bars.length - 1);
      const bar = bars[bi];
      const closeDir = entry.closeDirection ?? "any";
      if (closeDir === "bullish" && bar.close <= bar.open) return null;
      if (closeDir === "bearish" && bar.close >= bar.open) return null;
      const dir = resolveDir(bar.close > bar.open);
      // Enter at next bar open if possible, else at this bar close
      const entryIdx = bi + 1 < bars.length ? bi + 1 : bi;
      const price = bi + 1 < bars.length ? bars[bi + 1].open : bar.close;
      return { barIdx: entryIdx, price, direction: dir };
    }

    case "time_entry": {
      const bi = Math.min(entry.entryBar ?? 0, bars.length - 1);
      return { barIdx: bi, price: bars[bi].open, direction: resolveDir(true) };
    }

    case "pattern_entry": {
      // Simplified pattern match — look for named patterns
      const from = entry.searchFrom ?? 0;
      const to = Math.min(entry.searchTo ?? bars.length - 1, bars.length - 1);
      const targetOcc = entry.occurrence ?? 1;
      const pat = entry.pattern ?? "inside_bar";
      let found = 0;

      for (let i = from; i <= to; i++) {
        if (matchPattern(bars, i, pat)) {
          found++;
          if (found === targetOcc) {
            const offset = entry.entryOffset ?? 1;
            const entryIdx = Math.min(i + offset, bars.length - 1);
            return { barIdx: entryIdx, price: bars[entryIdx].open, direction: resolveDir(true) };
          }
        }
      }
      return null;
    }

    case "atr_breakout": {
      const atrLen = entry.atrLength ?? 14;
      // Compute ATR from first few bars
      const atrIdx = Math.min(atrLen, bars.length - 1);
      const atr = computeATR(bars, atrIdx, atrLen);
      const mult = entry.atrMultiplier ?? 1.5;
      const side = entry.atrSide ?? "above";
      const level = side === "above" ? day.open + atr * mult : day.open - atr * mult;

      for (let i = 1; i < bars.length; i++) {
        if (side === "above" && bars[i].high >= level) {
          return { barIdx: i, price: level, direction: resolveDir(true) };
        }
        if (side === "below" && bars[i].low <= level) {
          return { barIdx: i, price: level, direction: resolveDir(false) };
        }
      }
      return null;
    }
  }

  return null;
}

function matchPattern(bars: Bar[], bi: number, pattern: string): boolean {
  if (bi < 0 || bi >= bars.length) return false;
  const bar = bars[bi];
  switch (pattern) {
    case "inside_bar":
      return bi >= 1 && bar.high <= bars[bi - 1].high && bar.low >= bars[bi - 1].low;
    case "outside_bar":
      return bi >= 1 && bar.high > bars[bi - 1].high && bar.low < bars[bi - 1].low;
    case "engulfing_bullish": {
      if (bi < 1) return false;
      const prev = bars[bi - 1];
      return bar.close > bar.open && prev.close < prev.open && bar.close > prev.open && bar.open < prev.close;
    }
    case "engulfing_bearish": {
      if (bi < 1) return false;
      const prev = bars[bi - 1];
      return bar.close < bar.open && prev.close > prev.open && bar.open > prev.close && bar.close < prev.open;
    }
    case "doji": {
      const range = bar.high - bar.low;
      return range > 0 && (Math.abs(bar.close - bar.open) / range) * 100 <= 20;
    }
    case "hammer": {
      const body = Math.abs(bar.close - bar.open);
      const lw = Math.min(bar.open, bar.close) - bar.low;
      const uw = bar.high - Math.max(bar.open, bar.close);
      return body > 0 && lw >= 2 * body && uw <= body;
    }
    case "shooting_star": {
      const body = Math.abs(bar.close - bar.open);
      const uw = bar.high - Math.max(bar.open, bar.close);
      const lw = Math.min(bar.open, bar.close) - bar.low;
      return body > 0 && uw >= 2 * body && lw <= body;
    }
    case "bullish":
      return bar.close > bar.open;
    case "bearish":
      return bar.close < bar.open;
    default:
      return false;
  }
}

// ══════════════════════════════════════════════════════════
// Stop Loss Resolution
// ══════════════════════════════════════════════════════════

export function resolveStop(
  day: TradingDay, bars: Bar[], exit: ExitBlock,
  entryIdx: number, entryPrice: number, direction: "long" | "short",
): number {
  switch (exit.type) {
    case "none":
      return 0;

    case "fixed_points":
      return exit.points ?? 30;

    case "candle_extremity": {
      const padding = exit.padding ?? 0;
      let extremity: number;

      if (exit.candleRef === "entry") {
        extremity = direction === "long" ? bars[entryIdx].low : bars[entryIdx].high;
      } else if (exit.candleRef === "group") {
        const gStart = Math.max(exit.groupStart ?? 0, 0);
        const gEnd = Math.min(exit.groupEnd ?? entryIdx, entryIdx);
        if (direction === "long") {
          extremity = Infinity;
          for (let k = gStart; k <= gEnd && k < bars.length; k++) extremity = Math.min(extremity, bars[k].low);
        } else {
          extremity = -Infinity;
          for (let k = gStart; k <= gEnd && k < bars.length; k++) extremity = Math.max(extremity, bars[k].high);
        }
      } else {
        // "prev" = entry bar - 1
        const prevIdx = Math.max(entryIdx - 1, 0);
        extremity = direction === "long" ? bars[prevIdx].low : bars[prevIdx].high;
      }

      const dist = direction === "long"
        ? Math.max(0, entryPrice - extremity + padding)
        : Math.max(0, extremity - entryPrice + padding);
      return dist;
    }

    case "atr": {
      const atr = computeATR(bars, Math.max(entryIdx - 1, 1), exit.atrLength ?? 14);
      return atr * (exit.atrMultiplier ?? 1.5);
    }

    case "level": {
      let level: number | null = null;
      const lt = exit.levelType ?? "prev_close";
      if (lt === "prev_close") level = day.prevClose;
      else if (lt === "prev_day_high") level = day.prevDayHigh;
      else if (lt === "prev_day_low") level = day.prevDayLow;
      else if (lt === "day_open") level = day.open;
      if (level == null) return 30; // fallback
      return Math.abs(entryPrice - level);
    }

    case "prev_day_range": {
      const pdh = day.prevDayHigh;
      const pdl = day.prevDayLow;
      if (pdh == null || pdl == null) return 30;
      const prevRange = pdh - pdl;
      return prevRange * (exit.rangeMultiplier ?? 0.5);
    }
  }

  return 0;
}

// ══════════════════════════════════════════════════════════
// Take Profit Resolution
// ══════════════════════════════════════════════════════════

interface TargetResult {
  targetPts: number;
  maxHoldBars: number;
}

export function resolveTarget(
  day: TradingDay, bars: Bar[], tp: TakeProfitBlock,
  entryIdx: number, entryPrice: number, direction: "long" | "short",
  initialStopPts: number,
): TargetResult {
  const defaultMax = bars.length - entryIdx;

  switch (tp.type) {
    case "none":
      return { targetPts: 0, maxHoldBars: defaultMax };

    case "fixed_points":
      return { targetPts: tp.points ?? 50, maxHoldBars: defaultMax };

    case "risk_multiple": {
      if (initialStopPts <= 0) return { targetPts: 0, maxHoldBars: defaultMax };
      return { targetPts: (tp.riskMultiple ?? 2) * initialStopPts, maxHoldBars: defaultMax };
    }

    case "prev_day_level": {
      let level: number | null = null;
      const lt = tp.levelType ?? "prev_day_high";
      if (lt === "prev_day_high") level = day.prevDayHigh;
      else if (lt === "prev_day_low") level = day.prevDayLow;
      else if (lt === "prev_close") level = day.prevClose;
      else if (lt === "day_open") level = day.open;
      else if (lt === "prev_day_gap" && day.prevClose != null) {
        level = day.prevClose; // gap fill target
      }
      if (level == null) return { targetPts: 0, maxHoldBars: defaultMax };
      const dist = direction === "long" ? level - entryPrice : entryPrice - level;
      return { targetPts: Math.max(0, dist), maxHoldBars: defaultMax };
    }

    case "atr": {
      const atr = computeATR(bars, Math.max(entryIdx - 1, 1), tp.atrLength ?? 14);
      return { targetPts: atr * (tp.atrMultiplier ?? 2), maxHoldBars: defaultMax };
    }

    case "hold_bars":
      return { targetPts: 0, maxHoldBars: tp.holdBars ?? 12 };
  }

  return { targetPts: 0, maxHoldBars: defaultMax };
}

// ══════════════════════════════════════════════════════════
// Trade Simulation
// ══════════════════════════════════════════════════════════

function resolveLevelValue(day: TradingDay, levelName: string | undefined): number | null {
  if (!levelName) return null;
  switch (levelName) {
    case "prev_day_high": return day.prevDayHigh;
    case "prev_day_low": return day.prevDayLow;
    case "prev_close": return day.prevClose;
    case "day_open": return day.open;
    default: return null;
  }
}

export function simulateBlockTrade(
  bars: Bar[], entryIdx: number, entryPrice: number,
  direction: "long" | "short", initialStopPts: number,
  targetPts: number, maxHoldBars: number, date: string,
  mgmt: ManagementBlock, day: TradingDay,
): TradeResult | null {
  if (entryIdx >= bars.length) return null;

  const hasBE = mgmt.type === "be" || mgmt.type === "be_and_trail";
  const hasTrail = mgmt.type === "trail" || mgmt.type === "be_and_trail";

  let exitPrice = entryPrice;
  let exitTime = bars[entryIdx].time;
  let hitTarget = false;
  let hitStop = false;
  let timedOut = false;
  let holdBars = 0;

  let currentStopPts = initialStopPts;
  let beTriggered = false;
  let trailActivated = false;
  let bestPrice = entryPrice;

  const maxIdx = Math.min(entryIdx + maxHoldBars, bars.length - 1);

  for (let i = entryIdx; i <= maxIdx; i++) {
    const bar = bars[i];
    holdBars = i - entryIdx;

    // Track best price for trail
    if (direction === "long") {
      if (bar.high > bestPrice) bestPrice = bar.high;
    } else {
      if (bar.low < bestPrice) bestPrice = bar.low;
    }

    // ── Break-even check ──
    if (hasBE && !beTriggered && initialStopPts > 0 && i > entryIdx) {
      const unrealised = direction === "long" ? bar.close - entryPrice : entryPrice - bar.close;
      let beTarget = 0;
      const trigger = mgmt.beTrigger ?? "points";
      if (trigger === "points") {
        beTarget = mgmt.beValue ?? 0;
      } else if (trigger === "risk_multiple") {
        beTarget = (mgmt.beValue ?? 1) * initialStopPts;
      } else if (trigger === "day_open") {
        const dayOpenDist = direction === "long" ? day.open - entryPrice : entryPrice - day.open;
        // BE triggers when price reaches day open distance
        beTarget = Math.max(0, dayOpenDist);
      } else if (trigger === "level") {
        const lvl = resolveLevelValue(day, mgmt.beLevel);
        if (lvl != null) {
          beTarget = direction === "long" ? lvl - entryPrice : entryPrice - lvl;
          beTarget = Math.max(0, beTarget);
        }
      }
      if (unrealised >= beTarget && beTarget > 0) {
        currentStopPts = 0; // move to entry
        beTriggered = true;
      }
    }

    // ── Trail activation check ──
    if (hasTrail && !trailActivated && i > entryIdx) {
      const unrealised = direction === "long" ? bar.close - entryPrice : entryPrice - bar.close;
      const trigger = mgmt.trailTrigger ?? "points";
      let triggerTarget = 0;
      if (trigger === "points") {
        triggerTarget = mgmt.trailTriggerValue ?? 0;
      } else if (trigger === "risk_multiple") {
        triggerTarget = (mgmt.trailTriggerValue ?? 1) * initialStopPts;
      } else if (trigger === "level") {
        const lvl = resolveLevelValue(day, mgmt.trailTriggerLevel);
        if (lvl != null) {
          triggerTarget = direction === "long" ? lvl - entryPrice : entryPrice - lvl;
          triggerTarget = Math.max(0, triggerTarget);
        }
      }
      if (unrealised >= triggerTarget && triggerTarget > 0) {
        trailActivated = true;
      }
    }

    // ── Trail stop update ──
    if (hasTrail && trailActivated && i > entryIdx) {
      const method = mgmt.trailMethod ?? "candle_hl";
      if (method === "candle_hl") {
        const lookback = Math.max(1, Math.floor(mgmt.trailMethodValue ?? 3));
        const fromIdx = Math.max(entryIdx, i - lookback);
        if (direction === "long") {
          let trailLow = Infinity;
          for (let k = fromIdx; k <= i; k++) trailLow = Math.min(trailLow, bars[k].low);
          const trailDist = entryPrice - trailLow;
          if (trailDist >= 0 && (currentStopPts <= 0 || trailDist < currentStopPts)) {
            currentStopPts = trailDist;
          }
        } else {
          let trailHigh = -Infinity;
          for (let k = fromIdx; k <= i; k++) trailHigh = Math.max(trailHigh, bars[k].high);
          const trailDist = trailHigh - entryPrice;
          if (trailDist >= 0 && (currentStopPts <= 0 || trailDist < currentStopPts)) {
            currentStopPts = trailDist;
          }
        }
      } else if (method === "atr") {
        const liveAtr = computeATR(bars, i, mgmt.trailAtrLength ?? 14);
        const trailDist = (mgmt.trailMethodValue ?? 1.5) * liveAtr;
        if (direction === "long") {
          const trailLevel = bar.close - trailDist;
          const newDist = entryPrice - trailLevel;
          if (trailLevel > entryPrice) {
            currentStopPts = -(trailLevel - entryPrice);
          } else if (newDist >= 0 && (currentStopPts <= 0 || newDist < currentStopPts)) {
            currentStopPts = newDist;
          }
        } else {
          const trailLevel = bar.close + trailDist;
          const newDist = trailLevel - entryPrice;
          if (trailLevel < entryPrice) {
            currentStopPts = -(entryPrice - trailLevel);
          } else if (newDist >= 0 && (currentStopPts <= 0 || newDist < currentStopPts)) {
            currentStopPts = newDist;
          }
        }
      } else if (method === "fixed_distance") {
        const dist = mgmt.trailMethodValue ?? 20;
        if (direction === "long") {
          const trailLevel = bestPrice - dist;
          const newDist = entryPrice - trailLevel;
          if (trailLevel > entryPrice) {
            currentStopPts = -(trailLevel - entryPrice);
          } else if (newDist >= 0 && (currentStopPts <= 0 || newDist < currentStopPts)) {
            currentStopPts = newDist;
          }
        } else {
          const trailLevel = bestPrice + dist;
          const newDist = trailLevel - entryPrice;
          if (trailLevel < entryPrice) {
            currentStopPts = -(entryPrice - trailLevel);
          } else if (newDist >= 0 && (currentStopPts <= 0 || newDist < currentStopPts)) {
            currentStopPts = newDist;
          }
        }
      }
    }

    // ── Stop check ──
    if (direction === "long") {
      if (currentStopPts !== 0) {
        const stopLevel = entryPrice - currentStopPts;
        if (bar.low <= stopLevel) {
          exitPrice = stopLevel;
          exitTime = bar.time;
          hitStop = true;
          break;
        }
      }
      if (targetPts > 0 && bar.high >= entryPrice + targetPts) {
        exitPrice = entryPrice + targetPts;
        exitTime = bar.time;
        hitTarget = true;
        break;
      }
    } else {
      if (currentStopPts !== 0) {
        const stopLevel = entryPrice + currentStopPts;
        if (bar.high >= stopLevel) {
          exitPrice = stopLevel;
          exitTime = bar.time;
          hitStop = true;
          break;
        }
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

  const pnlPoints = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;

  let stopPrice: number | null = null;
  let targetPrice: number | null = null;
  if (initialStopPts > 0) {
    stopPrice = direction === "long" ? entryPrice - initialStopPts : entryPrice + initialStopPts;
  }
  if (targetPts > 0) {
    targetPrice = direction === "long" ? entryPrice + targetPts : entryPrice - targetPts;
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
    riskPoints: initialStopPts > 0 ? initialStopPts : undefined,
  };
}

// ══════════════════════════════════════════════════════════
// Main Runner
// ══════════════════════════════════════════════════════════

export function runBlockStrategy(
  strategy: BlockStrategy,
  days: TradingDay[],
): TradeResult[] {
  const trades: TradeResult[] = [];

  for (const day of days) {
    if (day.bars.length < 5) continue;

    const entryResult = resolveEntry(day, strategy.entry);
    if (!entryResult) continue;

    const { barIdx, price, direction } = entryResult;
    const bars = day.bars;

    const stopPts = resolveStop(day, bars, strategy.exit, barIdx, price, direction);
    const { targetPts, maxHoldBars } = resolveTarget(
      day, bars, strategy.takeProfit, barIdx, price, direction, stopPts,
    );

    const trade = simulateBlockTrade(
      bars, barIdx, price, direction, stopPts, targetPts, maxHoldBars,
      day.date, strategy.management, day,
    );
    if (trade) trades.push(trade);
  }

  return trades;
}

// ── Build StrategyResult from trades ──

export function buildBlockResult(
  trades: TradeResult[],
  strategy: BlockStrategy,
  filterDescription: string,
  totalDays: number,
): StrategyResult {
  const wins = trades.filter(t => t.pnlPoints > 0);
  const losses = trades.filter(t => t.pnlPoints <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));
  const pnls = trades.map(t => t.pnlPoints);
  const sorted = [...pnls].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    strategyId: `block_${strategy.id}`,
    strategyLabel: strategy.name || "Block Strategy",
    params: {},
    filterDescription,
    totalDays,
    trades,
    totalTrades: trades.length,
    winners: wins.length,
    losers: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgPnlPoints: trades.length > 0 ? pnls.reduce((a, b) => a + b, 0) / trades.length : 0,
    avgPnlPercent: trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length : 0,
    medianPnlPoints: median,
    totalPnlPoints: pnls.reduce((a, b) => a + b, 0),
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxWin: trades.length > 0 ? Math.max(...pnls) : 0,
    maxLoss: trades.length > 0 ? Math.min(...pnls) : 0,
    avgHoldBars: trades.length > 0 ? trades.reduce((s, t) => s + t.holdBars, 0) / trades.length : 0,
    timestamp: Date.now(),
  };
}

// ── Defaults ──

export const DEFAULT_ENTRY: EntryBlock = { type: "candle_breakout", direction: "long", candleStart: 0, candleEnd: 4, breakSide: "high" };
export const DEFAULT_EXIT: ExitBlock = { type: "fixed_points", points: 30 };
export const DEFAULT_TP: TakeProfitBlock = { type: "none" };
export const DEFAULT_MGMT: ManagementBlock = { type: "none" };

// ── Labels for UI ──

export const ENTRY_LABELS: Record<EntryType, string> = {
  candle_breakout: "Candle Breakout",
  level_breakout: "Level Breakout",
  candle_close: "Candle Close",
  time_entry: "Time Entry",
  pattern_entry: "Pattern Entry",
  atr_breakout: "ATR Breakout",
};

export const EXIT_LABELS: Record<ExitType, string> = {
  none: "None (no stop)",
  fixed_points: "Fixed Points",
  candle_extremity: "Candle Extremity",
  atr: "ATR-Based",
  level: "Level-Based",
  prev_day_range: "Prev Day Range",
};

export const TP_LABELS: Record<TakeProfitType, string> = {
  none: "None (hold to close)",
  fixed_points: "Fixed Points",
  risk_multiple: "Risk Multiple (N×SL)",
  prev_day_level: "Prev Day Level",
  atr: "ATR-Based",
  hold_bars: "Hold N Bars",
};

export const MGMT_LABELS: Record<ManagementType, string> = {
  none: "None",
  be: "Break-Even Only",
  trail: "Trail Stop Only",
  be_and_trail: "BE + Trail",
};

// ── localStorage persistence ──

const BLOCK_STRATEGIES_KEY = "ndx_block_strategies";

export function loadBlockStrategies(): BlockStrategy[] {
  try {
    const raw = localStorage.getItem(BLOCK_STRATEGIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBlockStrategy(strategy: BlockStrategy): BlockStrategy[] {
  const existing = loadBlockStrategies();
  existing.unshift(strategy);
  const trimmed = existing.slice(0, 30);
  localStorage.setItem(BLOCK_STRATEGIES_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deleteBlockStrategy(id: string): BlockStrategy[] {
  const existing = loadBlockStrategies();
  const filtered = existing.filter(s => s.id !== id);
  localStorage.setItem(BLOCK_STRATEGIES_KEY, JSON.stringify(filtered));
  return filtered;
}
