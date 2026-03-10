import { NextRequest, NextResponse } from "next/server";

interface BarBucket {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DaySummary {
  date: string;
  dayName: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePercent: number;
  gapPercent: number | null;
  rangePercent: number;
  prevClose: number | null;
  prevDayDirection: string | null;
  prevDayChangePercent: number | null;
  prevDayRangePercent: number | null;
  prevDayGapPercent: number | null;
  closeLocation: number;
  bodyPercent: number;
  upperWickPercent: number;
  lowerWickPercent: number;
  bars: BarBucket[]; // 30-min buckets from client
}

interface Stats {
  count: number;
  bullishPct: number;
  avgChange: number;
  medianChange: number;
  avgGap: number | null;
  avgRange: number;
  avgCloseLocation: number;
  maxGain: number;
  maxLoss: number;
}

interface AnalyzeRequest {
  days: DaySummary[];
  stats: Stats;
  filterDescription: string;
}

// ---------- math helpers ----------

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx, y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ---------- session time labels ----------
// Trading hours: 9:30-16:00 ET = 13 half-hour buckets
const SESSION_LABELS = [
  "09:30-10:00", "10:00-10:30", "10:30-11:00", "11:00-11:30",
  "11:30-12:00", "12:00-12:30", "12:30-13:00", "13:00-13:30",
  "13:30-14:00", "14:00-14:30", "14:30-15:00", "15:00-15:30",
  "15:30-16:00",
];

// ---------- intraday analytics from bars ----------

interface IntradayProfile {
  // Average normalized price path (% of daily range at each 30-min bucket)
  avgPricePath: { label: string; avgPctOfRange: number; avgChangeFromOpen: number }[];
  // Time of high / low
  highTimeDistribution: { label: string; pct: number }[];
  lowTimeDistribution: { label: string; pct: number }[];
  // Session segment performance
  first30min: { avgMove: number; bullishPct: number };
  firstHour: { avgMove: number; bullishPct: number };
  midday: { avgMove: number; bullishPct: number }; // 11:00-14:00
  lastHour: { avgMove: number; bullishPct: number };
  last30min: { avgMove: number; bullishPct: number };
  // Morning vs afternoon
  morningVsAfternoon: { morningAvgMove: number; afternoonAvgMove: number; morningBullishPct: number; afternoonBullishPct: number };
  // Gap fill timing
  gapFillTiming: { label: string; cumPctFilled: number }[] | null;
  // Intraday reversal detection: how often does price cross the open
  avgOpenCrosses: number;
  // Max adverse excursion / max favorable excursion from open
  avgMAE: number; // max adverse excursion (% from open, worst drawdown)
  avgMFE: number; // max favorable excursion (% from open, best run)
}

function computeIntradayProfile(days: DaySummary[]): IntradayProfile | null {
  const daysWithBars = days.filter(d => d.bars && d.bars.length >= 5);
  if (daysWithBars.length === 0) return null;

  // Helper: get bar index (0-12) for a 30-min bucket
  function getBucketIndex(bar: BarBucket, dayOpen: BarBucket): number {
    const elapsed = bar.time - dayOpen.time;
    const bucket = Math.floor(elapsed / 1800); // 1800s = 30min
    return Math.min(Math.max(bucket, 0), 12);
  }

  // ---- Average normalized price path ----
  // For each day, at each 30-min mark, compute where the close of that bucket sits
  // relative to day open as a % and relative to day range (0=low, 1=high)
  const pathPctOfRange: number[][] = Array.from({ length: 13 }, () => []);
  const pathChangeFromOpen: number[][] = Array.from({ length: 13 }, () => []);

  // ---- Time of high/low ----
  const highBucket: number[] = [];
  const lowBucket: number[] = [];

  // ---- Session segment moves ----
  const first30Moves: number[] = [];
  const firstHourMoves: number[] = [];
  const middayMoves: number[] = [];
  const lastHourMoves: number[] = [];
  const last30Moves: number[] = [];
  const morningMoves: number[] = [];
  const afternoonMoves: number[] = [];

  // ---- Gap fill timing ----
  const gapDaysWithBars = daysWithBars.filter(d => d.gapPercent !== null && d.prevClose !== null);
  const gapFillByBucket: number[] = new Array(13).fill(0);
  let totalGapDays = gapDaysWithBars.length;

  // ---- Open crosses & MAE/MFE ----
  const openCrossesList: number[] = [];
  const maeList: number[] = [];
  const mfeList: number[] = [];

  for (const day of daysWithBars) {
    const bars = day.bars;
    const dayRange = day.high - day.low;
    if (dayRange === 0) continue;
    const dayOpen = day.open;

    // Build bucket-level OHLC
    const bucketClose: (number | null)[] = new Array(13).fill(null);
    const bucketHigh: number[] = new Array(13).fill(-Infinity);
    const bucketLow: number[] = new Array(13).fill(Infinity);

    for (const bar of bars) {
      const idx = getBucketIndex(bar, bars[0]);
      bucketClose[idx] = bar.close;
      bucketHigh[idx] = Math.max(bucketHigh[idx], bar.high);
      bucketLow[idx] = Math.min(bucketLow[idx], bar.low);
    }

    // Price path
    for (let i = 0; i < 13; i++) {
      if (bucketClose[i] !== null) {
        const pctRange = (bucketClose[i]! - day.low) / dayRange;
        const chgFromOpen = ((bucketClose[i]! - dayOpen) / dayOpen) * 100;
        pathPctOfRange[i].push(pctRange);
        pathChangeFromOpen[i].push(chgFromOpen);
      }
    }

    // Time of high/low
    let maxH = -Infinity, maxHBucket = 0;
    let minL = Infinity, minLBucket = 0;
    for (let i = 0; i < 13; i++) {
      if (bucketHigh[i] > maxH) { maxH = bucketHigh[i]; maxHBucket = i; }
      if (bucketLow[i] < minL) { minL = bucketLow[i]; minLBucket = i; }
    }
    highBucket.push(maxHBucket);
    lowBucket.push(minLBucket);

    // Session segments - use bucket closes
    const getClose = (idx: number) => bucketClose[Math.min(idx, 12)];
    const openPrice = bars[0].open;

    // First 30min (bucket 0)
    if (bucketClose[0] !== null) {
      first30Moves.push(((bucketClose[0]! - openPrice) / openPrice) * 100);
    }
    // First hour (bucket 0-1)
    if (bucketClose[1] !== null) {
      firstHourMoves.push(((bucketClose[1]! - openPrice) / openPrice) * 100);
    }
    // Midday (bucket 3 to bucket 8, 11:00-14:00)
    if (bucketClose[3] !== null && bucketClose[8] !== null) {
      middayMoves.push(((bucketClose[8]! - bucketClose[3]!) / bucketClose[3]!) * 100);
    }
    // Last hour (bucket 11 to bucket 12)
    const lastClose = getClose(12);
    const hourBeforeClose = getClose(10);
    if (lastClose !== null && hourBeforeClose !== null) {
      lastHourMoves.push(((lastClose! - hourBeforeClose!) / hourBeforeClose!) * 100);
    }
    // Last 30min
    const halfHourBeforeClose = getClose(11);
    if (lastClose !== null && halfHourBeforeClose !== null) {
      last30Moves.push(((lastClose! - halfHourBeforeClose!) / halfHourBeforeClose!) * 100);
    }
    // Morning (open to 12:00 = bucket 4) vs Afternoon (12:00 to close = bucket 12)
    if (bucketClose[4] !== null) {
      morningMoves.push(((bucketClose[4]! - openPrice) / openPrice) * 100);
    }
    if (bucketClose[4] !== null && lastClose !== null) {
      afternoonMoves.push(((lastClose! - bucketClose[4]!) / bucketClose[4]!) * 100);
    }

    // Gap fill timing
    if (day.gapPercent !== null && day.prevClose !== null) {
      const pc = day.prevClose;
      const gapUp = day.gapPercent > 0;
      let filled = false;
      for (let i = 0; i < 13 && !filled; i++) {
        if (gapUp && bucketLow[i] <= pc) {
          gapFillByBucket[i]++;
          filled = true;
        } else if (!gapUp && bucketHigh[i] >= pc) {
          gapFillByBucket[i]++;
          filled = true;
        }
      }
    }

    // Open crosses (how many times price crosses the open level)
    let crosses = 0;
    let aboveOpen = bars[0].close > openPrice;
    for (let i = 1; i < bars.length; i++) {
      const nowAbove = bars[i].close > openPrice;
      if (nowAbove !== aboveOpen) {
        crosses++;
        aboveOpen = nowAbove;
      }
    }
    openCrossesList.push(crosses);

    // MAE / MFE
    const bullish = day.close > day.open;
    let maxAdverse = 0, maxFavorable = 0;
    for (const bar of bars) {
      const move = ((bar.close - openPrice) / openPrice) * 100;
      if (bullish) {
        if (move < maxAdverse) maxAdverse = move;
        if (move > maxFavorable) maxFavorable = move;
      } else {
        // For bearish days, "favorable" is negative, "adverse" is positive
        if (move > maxAdverse) maxAdverse = move; // worst upside run before dropping
        if (move < maxFavorable) maxFavorable = move; // best downside
      }
    }
    maeList.push(Math.abs(maxAdverse));
    mfeList.push(Math.abs(maxFavorable));
  }

  // Build results
  const avgPricePath = SESSION_LABELS.map((label, i) => ({
    label,
    avgPctOfRange: avg(pathPctOfRange[i]),
    avgChangeFromOpen: avg(pathChangeFromOpen[i]),
  }));

  // High/low time distribution
  const highTimeDist: Record<number, number> = {};
  const lowTimeDist: Record<number, number> = {};
  for (const b of highBucket) highTimeDist[b] = (highTimeDist[b] || 0) + 1;
  for (const b of lowBucket) lowTimeDist[b] = (lowTimeDist[b] || 0) + 1;

  const highTimeDistribution = SESSION_LABELS.map((label, i) => ({
    label,
    pct: ((highTimeDist[i] || 0) / daysWithBars.length) * 100,
  }));
  const lowTimeDistribution = SESSION_LABELS.map((label, i) => ({
    label,
    pct: ((lowTimeDist[i] || 0) / daysWithBars.length) * 100,
  }));

  // Gap fill cumulative timing
  let gapFillTiming: { label: string; cumPctFilled: number }[] | null = null;
  if (totalGapDays > 0) {
    let cumFills = 0;
    gapFillTiming = SESSION_LABELS.map((label, i) => {
      cumFills += gapFillByBucket[i];
      return { label, cumPctFilled: (cumFills / totalGapDays) * 100 };
    });
  }

  return {
    avgPricePath,
    highTimeDistribution,
    lowTimeDistribution,
    first30min: { avgMove: avg(first30Moves), bullishPct: first30Moves.filter(m => m > 0).length / Math.max(first30Moves.length, 1) * 100 },
    firstHour: { avgMove: avg(firstHourMoves), bullishPct: firstHourMoves.filter(m => m > 0).length / Math.max(firstHourMoves.length, 1) * 100 },
    midday: { avgMove: avg(middayMoves), bullishPct: middayMoves.filter(m => m > 0).length / Math.max(middayMoves.length, 1) * 100 },
    lastHour: { avgMove: avg(lastHourMoves), bullishPct: lastHourMoves.filter(m => m > 0).length / Math.max(lastHourMoves.length, 1) * 100 },
    last30min: { avgMove: avg(last30Moves), bullishPct: last30Moves.filter(m => m > 0).length / Math.max(last30Moves.length, 1) * 100 },
    morningVsAfternoon: {
      morningAvgMove: avg(morningMoves),
      afternoonAvgMove: avg(afternoonMoves),
      morningBullishPct: morningMoves.filter(m => m > 0).length / Math.max(morningMoves.length, 1) * 100,
      afternoonBullishPct: afternoonMoves.filter(m => m > 0).length / Math.max(afternoonMoves.length, 1) * 100,
    },
    gapFillTiming,
    avgOpenCrosses: avg(openCrossesList),
    avgMAE: avg(maeList),
    avgMFE: avg(mfeList),
  };
}

// ---------- daily-level derived analytics ----------

function computeDerivedAnalytics(days: DaySummary[]) {
  const gapDays = days.filter(d => d.gapPercent !== null && d.prevClose !== null);
  let gapFillCount = 0;
  let gapFadeCount = 0;
  const gapSizes: number[] = [];
  const gapFillDetails: { size: number; filled: boolean; fadePct: number; closeLocation: number }[] = [];

  for (const d of gapDays) {
    const gap = d.gapPercent!;
    const pc = d.prevClose!;
    gapSizes.push(Math.abs(gap));
    const gapUp = gap > 0;
    const filled = gapUp ? d.low <= pc : d.high >= pc;
    if (filled) gapFillCount++;
    const faded = gapUp ? d.close < d.open : d.close > d.open;
    if (faded) gapFadeCount++;
    const gapSize = d.open - pc;
    const fadePct = gapSize !== 0 ? ((d.open - d.close) / gapSize) * 100 : 0;
    gapFillDetails.push({ size: Math.abs(gap), filled, fadePct, closeLocation: d.closeLocation });
  }

  const gapFillRate = gapDays.length > 0 ? (gapFillCount / gapDays.length * 100) : null;
  const gapFadeRate = gapDays.length > 0 ? (gapFadeCount / gapDays.length * 100) : null;
  const avgGapFadePct = gapFillDetails.length > 0
    ? gapFillDetails.reduce((a, b) => a + b.fadePct, 0) / gapFillDetails.length : null;

  const gapCloseCorr = gapFillDetails.length >= 5
    ? correlation(gapFillDetails.map(g => g.size), gapFillDetails.map(g => g.closeLocation)) : null;
  const gapFadeCorr = gapFillDetails.length >= 5
    ? correlation(gapFillDetails.map(g => g.size), gapFillDetails.map(g => g.fadePct)) : null;

  const avgUpperWick = avg(days.map(d => d.upperWickPercent));
  const avgLowerWick = avg(days.map(d => d.lowerWickPercent));
  const avgBody = avg(days.map(d => d.bodyPercent));
  const closeLocs = days.map(d => d.closeLocation);
  const closeInBottom25 = closeLocs.filter(c => c <= 0.25).length;
  const closeInTop25 = closeLocs.filter(c => c >= 0.75).length;
  const closeInMiddle = closeLocs.filter(c => c > 0.25 && c < 0.75).length;

  const sequences: { pattern: string; count: number; avgNextChange: number }[] = [];
  const twoDay: Record<string, { count: number; nextChanges: number[] }> = {};
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].changePercent >= 0 ? "B" : "R";
    const curr = days[i].changePercent >= 0 ? "B" : "R";
    const pattern = `${prev}→${curr}`;
    if (!twoDay[pattern]) twoDay[pattern] = { count: 0, nextChanges: [] };
    twoDay[pattern].count++;
    if (i + 1 < days.length) twoDay[pattern].nextChanges.push(days[i + 1].changePercent);
  }
  for (const [pattern, data] of Object.entries(twoDay)) {
    sequences.push({ pattern, count: data.count, avgNextChange: data.nextChanges.length > 0 ? avg(data.nextChanges) : 0 });
  }

  const ranges = days.map(d => d.rangePercent);
  const rangeP80 = percentile(ranges, 80);
  let highVolClusters = 0, consecutiveHighVol = 0;
  for (const d of days) {
    if (d.rangePercent >= rangeP80) { consecutiveHighVol++; if (consecutiveHighVol >= 2) highVolClusters++; }
    else consecutiveHighVol = 0;
  }

  const dowStats: Record<string, { count: number; avgChange: number; bullish: number }> = {};
  for (const d of days) {
    const dow = d.dayName.slice(0, 3);
    if (!dowStats[dow]) dowStats[dow] = { count: 0, avgChange: 0, bullish: 0 };
    dowStats[dow].count++;
    dowStats[dow].avgChange += d.changePercent;
    if (d.changePercent >= 0) dowStats[dow].bullish++;
  }
  for (const v of Object.values(dowStats)) v.avgChange /= v.count;

  const reversalDays = days.filter(d => d.gapPercent !== null && ((d.gapPercent > 0 && d.changePercent < 0) || (d.gapPercent < 0 && d.changePercent > 0)));
  const trendDays = days.filter(d => d.gapPercent !== null && ((d.gapPercent > 0 && d.changePercent > 0) || (d.gapPercent < 0 && d.changePercent < 0)));

  const changes = days.map(d => d.changePercent);
  const stdDev = Math.sqrt(changes.reduce((a, c) => a + (c - avg(changes)) ** 2, 0) / changes.length);

  return {
    gapAnalysis: {
      daysWithGap: gapDays.length, fillRate: gapFillRate, fadeRate: gapFadeRate, avgGapFadePct,
      gapSizeVsCloseCorrelation: gapCloseCorr, gapSizeVsFadeCorrelation: gapFadeCorr,
      smallGapFillRate: gapFillDetails.filter(g => g.size <= median(gapSizes)).length > 0
        ? gapFillDetails.filter(g => g.size <= median(gapSizes) && g.filled).length / gapFillDetails.filter(g => g.size <= median(gapSizes)).length * 100 : null,
      largeGapFillRate: gapFillDetails.filter(g => g.size > median(gapSizes)).length > 0
        ? gapFillDetails.filter(g => g.size > median(gapSizes) && g.filled).length / gapFillDetails.filter(g => g.size > median(gapSizes)).length * 100 : null,
    },
    intradayStructure: {
      avgUpperWick, avgLowerWick, avgBody,
      closeDistribution: {
        bottom25Pct: (closeInBottom25 / days.length * 100),
        middle50Pct: (closeInMiddle / days.length * 100),
        top25Pct: (closeInTop25 / days.length * 100),
      },
    },
    sequentialPatterns: sequences.sort((a, b) => b.count - a.count),
    volatility: { stdDev, highVolClusterCount: highVolClusters, rangeP80 },
    dayOfWeekBreakdown: dowStats,
    reversalVsTrend: {
      reversalDays: reversalDays.length, trendDays: trendDays.length,
      reversalAvgChange: reversalDays.length > 0 ? avg(reversalDays.map(d => Math.abs(d.changePercent))) : 0,
      trendAvgChange: trendDays.length > 0 ? avg(trendDays.map(d => Math.abs(d.changePercent))) : 0,
    },
    changeDistribution: { p10: percentile(changes, 10), p25: percentile(changes, 25), median: median(changes), p75: percentile(changes, 75), p90: percentile(changes, 90), stdDev },
  };
}

// ---------- route handler ----------

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY is not configured on the server" }, { status: 500 });
  }

  const body: AnalyzeRequest = await request.json();
  const { days, stats, filterDescription } = body;

  if (days.length === 0) {
    return NextResponse.json({ error: "No days to analyze" }, { status: 400 });
  }

  const derived = computeDerivedAnalytics(days);
  const intraday = computeIntradayProfile(days);

  // Sample days for raw data section
  const maxSample = 150;
  const sampleDays = days.length > maxSample
    ? days.filter((_, i) => i % Math.ceil(days.length / maxSample) === 0).slice(0, maxSample)
    : days;

  // Build intraday section
  let intradaySection = "";
  if (intraday) {
    intradaySection = `
═══════════════════════════════════════
INTRADAY PRICE EVOLUTION (computed from 30-min bar data across all ${days.length} days)
═══════════════════════════════════════

## AVERAGE PRICE PATH (how price evolves through the day)
${intraday.avgPricePath.map(p =>
  `${p.label}: avg position in range: ${(p.avgPctOfRange * 100).toFixed(1)}% | avg change from open: ${p.avgChangeFromOpen >= 0 ? "+" : ""}${p.avgChangeFromOpen.toFixed(3)}%`
).join("\n")}

## TIME OF DAY HIGH (when does the daily high occur?)
${intraday.highTimeDistribution.filter(h => h.pct > 0).sort((a, b) => b.pct - a.pct).map(h =>
  `${h.label}: ${h.pct.toFixed(1)}% of days`
).join("\n")}

## TIME OF DAY LOW (when does the daily low occur?)
${intraday.lowTimeDistribution.filter(l => l.pct > 0).sort((a, b) => b.pct - a.pct).map(l =>
  `${l.label}: ${l.pct.toFixed(1)}% of days`
).join("\n")}

## SESSION SEGMENT PERFORMANCE
- First 30 min (09:30-10:00): avg move ${intraday.first30min.avgMove >= 0 ? "+" : ""}${intraday.first30min.avgMove.toFixed(3)}%, bullish ${intraday.first30min.bullishPct.toFixed(1)}%
- First hour (09:30-10:30): avg move ${intraday.firstHour.avgMove >= 0 ? "+" : ""}${intraday.firstHour.avgMove.toFixed(3)}%, bullish ${intraday.firstHour.bullishPct.toFixed(1)}%
- Midday (11:00-14:00): avg move ${intraday.midday.avgMove >= 0 ? "+" : ""}${intraday.midday.avgMove.toFixed(3)}%, bullish ${intraday.midday.bullishPct.toFixed(1)}%
- Last hour (15:00-16:00): avg move ${intraday.lastHour.avgMove >= 0 ? "+" : ""}${intraday.lastHour.avgMove.toFixed(3)}%, bullish ${intraday.lastHour.bullishPct.toFixed(1)}%
- Last 30 min (15:30-16:00): avg move ${intraday.last30min.avgMove >= 0 ? "+" : ""}${intraday.last30min.avgMove.toFixed(3)}%, bullish ${intraday.last30min.bullishPct.toFixed(1)}%

## MORNING vs AFTERNOON
- Morning (open → 12:00): avg move ${intraday.morningVsAfternoon.morningAvgMove >= 0 ? "+" : ""}${intraday.morningVsAfternoon.morningAvgMove.toFixed(3)}%, bullish ${intraday.morningVsAfternoon.morningBullishPct.toFixed(1)}%
- Afternoon (12:00 → close): avg move ${intraday.morningVsAfternoon.afternoonAvgMove >= 0 ? "+" : ""}${intraday.morningVsAfternoon.afternoonAvgMove.toFixed(3)}%, bullish ${intraday.morningVsAfternoon.afternoonBullishPct.toFixed(1)}%

## INTRADAY DYNAMICS
- Average open crosses per day: ${intraday.avgOpenCrosses.toFixed(1)} (higher = more choppy/mean-reverting; lower = more trending)
- Average Max Adverse Excursion (MAE): ${intraday.avgMAE.toFixed(3)}% (typical drawdown before settlement)
- Average Max Favorable Excursion (MFE): ${intraday.avgMFE.toFixed(3)}% (typical best run before settlement)
- MFE/MAE ratio: ${(intraday.avgMFE / Math.max(intraday.avgMAE, 0.001)).toFixed(2)} (>1 = favorable, <1 = adverse moves dominate)
${intraday.gapFillTiming ? `
## GAP FILL TIMING (cumulative probability of gap fill by time)
${intraday.gapFillTiming.map(g =>
  `${g.label}: ${g.cumPctFilled.toFixed(1)}% of gaps filled by this time`
).join("\n")}` : ""}`;
  }

  const prompt = `You are a quantitative market analyst. You have COMPLETE data for a filtered set of NASDAQ-100 (NDX) trading days including the FULL INTRADAY PRICE EVOLUTION computed from 5-minute bars. Perform an exhaustive analysis. Do NOT say you lack data.

═══════════════════════════════════════
FILTER CRITERIA: ${filterDescription}
═══════════════════════════════════════

AGGREGATE STATISTICS:
- Total matching days: ${stats.count}
- Bullish days: ${stats.bullishPct.toFixed(1)}%
- Average daily change: ${stats.avgChange.toFixed(3)}%
- Median daily change: ${stats.medianChange.toFixed(3)}%
- Average gap: ${stats.avgGap !== null ? stats.avgGap.toFixed(3) + "%" : "N/A"}
- Average range: ${stats.avgRange.toFixed(3)}%
- Average close location (0=low, 1=high): ${stats.avgCloseLocation.toFixed(2)}
- Max gain: +${stats.maxGain.toFixed(2)}% | Max loss: ${stats.maxLoss.toFixed(2)}%

═══════════════════════════════════════
PRE-COMPUTED DERIVED ANALYTICS
═══════════════════════════════════════

## GAP FILL ANALYSIS
- Days with gap: ${derived.gapAnalysis.daysWithGap}
- Gap fill rate: ${derived.gapAnalysis.fillRate !== null ? derived.gapAnalysis.fillRate.toFixed(1) + "%" : "N/A"}
- Gap fade rate: ${derived.gapAnalysis.fadeRate !== null ? derived.gapAnalysis.fadeRate.toFixed(1) + "%" : "N/A"}
- Avg gap fade %: ${derived.gapAnalysis.avgGapFadePct !== null ? derived.gapAnalysis.avgGapFadePct.toFixed(1) + "%" : "N/A"}
- Small gaps fill rate: ${derived.gapAnalysis.smallGapFillRate !== null ? derived.gapAnalysis.smallGapFillRate.toFixed(1) + "%" : "N/A"}
- Large gaps fill rate: ${derived.gapAnalysis.largeGapFillRate !== null ? derived.gapAnalysis.largeGapFillRate.toFixed(1) + "%" : "N/A"}
- Correlation (gap size → close location): ${derived.gapAnalysis.gapSizeVsCloseCorrelation !== null ? derived.gapAnalysis.gapSizeVsCloseCorrelation.toFixed(3) : "N/A"}
- Correlation (gap size → fade %): ${derived.gapAnalysis.gapSizeVsFadeCorrelation !== null ? derived.gapAnalysis.gapSizeVsFadeCorrelation.toFixed(3) : "N/A"}

## INTRADAY CANDLE STRUCTURE
- Avg upper wick: ${derived.intradayStructure.avgUpperWick.toFixed(3)}%
- Avg lower wick: ${derived.intradayStructure.avgLowerWick.toFixed(3)}%
- Avg body: ${derived.intradayStructure.avgBody.toFixed(3)}%
- Close in bottom 25%: ${derived.intradayStructure.closeDistribution.bottom25Pct.toFixed(1)}% | middle 50%: ${derived.intradayStructure.closeDistribution.middle50Pct.toFixed(1)}% | top 25%: ${derived.intradayStructure.closeDistribution.top25Pct.toFixed(1)}%

## SEQUENTIAL PATTERNS (2-day → next day)
${derived.sequentialPatterns.map(s => `- ${s.pattern}: ${s.count}x → next avg: ${s.avgNextChange >= 0 ? "+" : ""}${s.avgNextChange.toFixed(3)}%`).join("\n")}

## REVERSAL vs TREND
- Reversal: ${derived.reversalVsTrend.reversalDays} days (avg |change|: ${derived.reversalVsTrend.reversalAvgChange.toFixed(3)}%)
- Trend: ${derived.reversalVsTrend.trendDays} days (avg |change|: ${derived.reversalVsTrend.trendAvgChange.toFixed(3)}%)

## VOLATILITY
- Std dev: ${derived.volatility.stdDev.toFixed(3)}% | High-vol clusters: ${derived.volatility.highVolClusterCount} | Range P80: ${derived.volatility.rangeP80.toFixed(3)}%

## CHANGE DISTRIBUTION
- P10: ${derived.changeDistribution.p10.toFixed(3)}% | P25: ${derived.changeDistribution.p25.toFixed(3)}% | Median: ${derived.changeDistribution.median.toFixed(3)}% | P75: ${derived.changeDistribution.p75.toFixed(3)}% | P90: ${derived.changeDistribution.p90.toFixed(3)}%

## DAY OF WEEK
${Object.entries(derived.dayOfWeekBreakdown).map(([dow, s]) => `- ${dow}: ${s.count} days, avg ${s.avgChange >= 0 ? "+" : ""}${s.avgChange.toFixed(3)}%, bullish ${(s.bullish / s.count * 100).toFixed(1)}%`).join("\n")}
${intradaySection}

═══════════════════════════════════════
RAW DAY-BY-DAY DATA (${sampleDays.length} of ${days.length} days)
═══════════════════════════════════════
${sampleDays.map(d =>
  `${d.date} ${d.dayName.slice(0, 3)} | O:${d.open.toFixed(2)} H:${d.high.toFixed(2)} L:${d.low.toFixed(2)} C:${d.close.toFixed(2)} | Chg:${d.changePercent > 0 ? "+" : ""}${d.changePercent.toFixed(2)}% Gap:${d.gapPercent !== null ? (d.gapPercent > 0 ? "+" : "") + d.gapPercent.toFixed(2) + "%" : "N/A"} Rng:${d.rangePercent.toFixed(2)}% | CloseLoc:${d.closeLocation.toFixed(2)} | PrevDay:${d.prevDayDirection ?? "N/A"} ${d.prevDayChangePercent !== null ? (d.prevDayChangePercent > 0 ? "+" : "") + d.prevDayChangePercent.toFixed(2) + "%" : ""}`
).join("\n")}

═══════════════════════════════════════
ANALYSIS REQUIREMENTS — FULL DEPTH
═══════════════════════════════════════

You have COMPLETE data including the full intraday price path. Analyze:

1. **Pattern Summary** — Dominant behavior in 2-3 sentences.

2. **Gap Behavior Deep Dive** — Fill rates by size, correlations, fill timing by hour. At what time of day are most gaps filled?

3. **Intraday Price Path Analysis** — THIS IS THE KEY NEW SECTION. Using the 30-min price path data:
   - How does price typically evolve from open to close? Describe the average trajectory.
   - What time does the high/low typically occur? What are the implications?
   - First 30 min vs last 30 min — who wins?
   - Morning vs afternoon — which session drives the day's direction?
   - How choppy is intraday action (open crosses)?
   - MAE/MFE analysis — how much heat does a trader take before the move plays out?

4. **Optimal Entry/Exit Timing** — Based on the price path:
   - Best time to enter (when does the favorable move begin?)
   - Best time to exit (when does the move exhaust?)
   - Gap fill probability by hour — when to fade the gap?

5. **Sequential & Clustering Patterns** — What happens after these days?

6. **Change Distribution & Tail Risk** — Skew, fat tails, position sizing.

7. **Reversal vs Trend Classification** — Which dominates? How to trade each.

8. **Complete Trading Playbook** — Specific framework using ALL the evidence:
   - Entry time window (from price path data)
   - Entry trigger (from gap/open behavior)
   - Stop loss placement (from MAE data)
   - Target setting (from MFE and distribution percentiles)
   - Exit timing (from price path exhaustion point)
   - Position sizing (from volatility data)

Use the EXACT numbers. No hedging.`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are an elite quantitative trading analyst. You have been given comprehensive data including FULL INTRADAY PRICE EVOLUTION from 5-minute bars — average price path, time-of-high/low distributions, session segment performance, gap fill timing, MAE/MFE, and open crosses. Use ALL of it to give precise, time-specific, actionable conclusions. Never claim data is missing.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `DeepSeek API error: ${response.status} - ${err}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content ?? "No analysis returned.";
    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach DeepSeek API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
