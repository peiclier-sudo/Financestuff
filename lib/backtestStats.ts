import { TradingDay } from "./types";
import { DaySignature, DaySignatureStats, HourlyBucket, PoolFilter } from "./backtestTypes";

const HOUR_BUCKETS = [
  { label: "9:30–10:30", startMin: 570, endMin: 630 },   // 9*60+30=570, 10*60+30=630
  { label: "10:30–11:30", startMin: 630, endMin: 690 },
  { label: "11:30–12:30", startMin: 690, endMin: 750 },
  { label: "12:30–13:30", startMin: 750, endMin: 810 },
  { label: "13:30–14:30", startMin: 810, endMin: 870 },
  { label: "14:30–15:30", startMin: 870, endMin: 930 },
  { label: "15:30–16:00", startMin: 930, endMin: 960 },
];

export function computeDaySignature(day: TradingDay): DaySignature | null {
  if (day.prevDayDirection === null) return null;
  if (day.gapPercent === null) return null;
  if (day.prevDayGapPercent === null) return null;

  return {
    dayOfWeek: day.dayOfWeek,
    prevDayDirection: day.prevDayDirection,
    prevDayGapDirection: day.prevDayGapPercent >= 0 ? "up" : "down",
    currentGapDirection: day.gapPercent >= 0 ? "up" : "down",
  };
}

export function findMatchingDays(
  allDays: TradingDay[],
  targetDay: TradingDay
): TradingDay[] {
  const sig = computeDaySignature(targetDay);
  if (!sig) return [];

  return allDays.filter((d) => {
    // Only retroactive: days strictly before the target day
    if (d.date >= targetDay.date) return false;
    const dSig = computeDaySignature(d);
    if (!dSig) return false;
    return (
      dSig.dayOfWeek === sig.dayOfWeek &&
      dSig.prevDayDirection === sig.prevDayDirection &&
      dSig.prevDayGapDirection === sig.prevDayGapDirection &&
      dSig.currentGapDirection === sig.currentGapDirection
    );
  });
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function getBarMinuteET(unixSec: number): number {
  // Convert unix seconds to Eastern Time minutes-of-day
  const d = new Date(unixSec * 1000);
  const etStr = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = etStr.split(":").map(Number);
  return h * 60 + m;
}

export function computeHourlyBuckets(matchingDays: TradingDay[]): HourlyBucket[] {
  if (matchingDays.length === 0) {
    return HOUR_BUCKETS.map((b) => ({
      hour: b.label,
      bullishPct: 0,
      bearishPct: 0,
      avgRangePct: 0,
      medianRangePct: 0,
      sampleSize: 0,
    }));
  }

  return HOUR_BUCKETS.map((bucket) => {
    const directions: boolean[] = []; // true = bullish
    const ranges: number[] = [];

    for (const day of matchingDays) {
      const barsInBucket = day.bars.filter((bar) => {
        const min = getBarMinuteET(bar.time);
        return min >= bucket.startMin && min < bucket.endMin;
      });

      if (barsInBucket.length === 0) continue;

      const firstOpen = barsInBucket[0].open;
      const lastClose = barsInBucket[barsInBucket.length - 1].close;
      let high = -Infinity, low = Infinity;
      for (const b of barsInBucket) {
        if (b.high > high) high = b.high;
        if (b.low < low) low = b.low;
      }

      directions.push(lastClose >= firstOpen);
      if (firstOpen > 0) {
        ranges.push(((high - low) / firstOpen) * 100);
      }
    }

    const bullCount = directions.filter(Boolean).length;
    const total = directions.length;

    return {
      hour: bucket.label,
      bullishPct: total > 0 ? (bullCount / total) * 100 : 0,
      bearishPct: total > 0 ? ((total - bullCount) / total) * 100 : 0,
      avgRangePct: avg(ranges),
      medianRangePct: median(ranges),
      sampleSize: total,
    };
  });
}

export function computeSignatureStats(matchingDays: TradingDay[]): DaySignatureStats {
  if (matchingDays.length === 0) {
    return {
      sampleSize: 0,
      bullishPct: 0,
      bearishPct: 0,
      avgCloseLocation: 0,
      medianCloseLocation: 0,
      avgChangePercent: 0,
      medianChangePercent: 0,
      avgRangePercent: 0,
      medianRangePercent: 0,
      gapFillPct: 0,
      hourlyBuckets: computeHourlyBuckets([]),
    };
  }

  const changes = matchingDays.map((d) => d.changePercent);
  const closeLocs = matchingDays.map((d) => d.closeLocation * 100); // scale to 0-100
  const ranges = matchingDays.map((d) => d.rangePercent);

  const bullCount = matchingDays.filter((d) => d.changePercent > 0).length;

  // Gap fill: price crossed prevClose during the day
  let gapFillCount = 0;
  for (const d of matchingDays) {
    if (d.prevClose === null || d.gapPercent === null) continue;
    const pc = d.prevClose;
    if (d.gapPercent > 0) {
      // Gap up — fill means price went below prevClose
      if (d.low <= pc) gapFillCount++;
    } else {
      // Gap down — fill means price went above prevClose
      if (d.high >= pc) gapFillCount++;
    }
  }

  return {
    sampleSize: matchingDays.length,
    bullishPct: (bullCount / matchingDays.length) * 100,
    bearishPct: ((matchingDays.length - bullCount) / matchingDays.length) * 100,
    avgCloseLocation: avg(closeLocs),
    medianCloseLocation: median(closeLocs),
    avgChangePercent: avg(changes),
    medianChangePercent: median(changes),
    avgRangePercent: avg(ranges),
    medianRangePercent: median(ranges),
    gapFillPct: (gapFillCount / matchingDays.length) * 100,
    hourlyBuckets: computeHourlyBuckets(matchingDays),
  };
}

export function filterDayPool(days: TradingDay[], filter: PoolFilter): TradingDay[] {
  return days.filter((d) => {
    if (filter.dayOfWeek !== null && d.dayOfWeek !== filter.dayOfWeek) return false;

    if (filter.gapDirection !== "any" && d.gapPercent !== null) {
      if (filter.gapDirection === "up" && d.gapPercent < 0) return false;
      if (filter.gapDirection === "down" && d.gapPercent >= 0) return false;
    }

    if (filter.prevDayDirection !== "any" && d.prevDayDirection !== null) {
      if (d.prevDayDirection !== filter.prevDayDirection) return false;
    }

    if (filter.prevDayGapDirection !== "any" && d.prevDayGapPercent !== null) {
      if (filter.prevDayGapDirection === "up" && d.prevDayGapPercent < 0) return false;
      if (filter.prevDayGapDirection === "down" && d.prevDayGapPercent >= 0) return false;
    }

    // Skip days without full characteristics (need prevDay data)
    if (d.prevDayDirection === null || d.gapPercent === null) return false;

    return true;
  });
}

export function pickRandomDay(days: TradingDay[]): TradingDay | null {
  if (days.length === 0) return null;
  return days[Math.floor(Math.random() * days.length)];
}
