import { Bar, TradingDay, FilterCriteria } from "./types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseCSV(text: string): Bar[] {
  const lines = text.trim().split("\n");
  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    bars.push({
      time: parseInt(parts[0]),
      open: parseFloat(parts[1]),
      high: parseFloat(parts[2]),
      low: parseFloat(parts[3]),
      close: parseFloat(parts[4]),
    });
  }
  return bars;
}

export function groupIntoDays(bars: Bar[]): TradingDay[] {
  const dayMap = new Map<string, Bar[]>();

  for (const bar of bars) {
    const d = new Date(bar.time * 1000);
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, []);
    }
    dayMap.get(dateStr)!.push(bar);
  }

  const sortedDates = Array.from(dayMap.keys()).sort();
  const days: TradingDay[] = [];

  for (let i = 0; i < sortedDates.length; i++) {
    const dateStr = sortedDates[i];
    const dayBars = dayMap.get(dateStr)!;
    dayBars.sort((a, b) => a.time - b.time);

    const open = dayBars[0].open;
    const close = dayBars[dayBars.length - 1].close;
    let high = -Infinity, low = Infinity;
    for (const b of dayBars) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
    }

    const d = new Date(dateStr + "T12:00:00");
    const dayOfWeek = d.getDay();
    const prevClose = i > 0 ? days[i - 1].close : null;
    const gapPercent = prevClose !== null ? ((open - prevClose) / prevClose) * 100 : null;

    const changePercent = ((close - open) / open) * 100;
    const rangePercent = ((high - low) / open) * 100;
    const bodyPercent = (Math.abs(close - open) / open) * 100;
    const upperWickPercent = ((high - Math.max(open, close)) / open) * 100;
    const lowerWickPercent = ((Math.min(open, close) - low) / open) * 100;
    const closeLocation = high !== low ? (close - low) / (high - low) : 0.5;

    const prevDay = i > 0 ? days[i - 1] : null;

    days.push({
      date: dateStr,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      open,
      high,
      low,
      close,
      prevClose,
      gapPercent,
      rangePercent,
      changePercent,
      bars: dayBars,
      prevDayDirection: prevDay ? (prevDay.changePercent > 0 ? "bullish" : "bearish") : null,
      prevDayChangePercent: prevDay ? prevDay.changePercent : null,
      prevDayRangePercent: prevDay ? prevDay.rangePercent : null,
      prevDayGapPercent: prevDay ? prevDay.gapPercent : null,
      bodyPercent,
      upperWickPercent,
      lowerWickPercent,
      closeLocation,
    });
  }

  return days;
}

export function filterDays(days: TradingDay[], criteria: FilterCriteria): TradingDay[] {
  return days.filter((day) => {
    if (criteria.dayOfWeek !== null && day.dayOfWeek !== criteria.dayOfWeek) return false;

    // Gap direction
    if (criteria.gapDirection !== "any" && day.gapPercent !== null) {
      if (criteria.gapDirection === "up" && day.gapPercent <= 0) return false;
      if (criteria.gapDirection === "down" && day.gapPercent >= 0) return false;
    }

    // Gap size
    if (day.gapPercent !== null) {
      const absGap = Math.abs(day.gapPercent);
      if (absGap < criteria.minGapPercent) return false;
      if (criteria.maxGapPercent > 0 && absGap > criteria.maxGapPercent) return false;
    }

    // Range
    if (day.rangePercent < criteria.minRangePercent) return false;
    if (criteria.maxRangePercent > 0 && day.rangePercent > criteria.maxRangePercent) return false;

    // Direction (bullish/bearish)
    if (criteria.direction === "bullish" && day.changePercent <= 0) return false;
    if (criteria.direction === "bearish" && day.changePercent >= 0) return false;

    // Change %
    const absChange = Math.abs(day.changePercent);
    if (absChange < criteria.minChangePercent) return false;
    if (criteria.maxChangePercent > 0 && absChange > criteria.maxChangePercent) return false;

    // Previous day direction
    if (criteria.prevDayDirection !== "any" && day.prevDayDirection !== null) {
      if (day.prevDayDirection !== criteria.prevDayDirection) return false;
    }

    // Previous day change %
    if (day.prevDayChangePercent !== null) {
      const absPrevChange = Math.abs(day.prevDayChangePercent);
      if (absPrevChange < criteria.prevDayMinChangePercent) return false;
      if (criteria.prevDayMaxChangePercent > 0 && absPrevChange > criteria.prevDayMaxChangePercent) return false;
    }

    // Date range
    if (criteria.dateFrom && day.date < criteria.dateFrom) return false;
    if (criteria.dateTo && day.date > criteria.dateTo) return false;

    return true;
  });
}

// Compute aggregate statistics for a set of filtered days
export function computeStats(days: TradingDay[]) {
  if (days.length === 0) return null;

  const changes = days.map(d => d.changePercent);
  const gaps = days.filter(d => d.gapPercent !== null).map(d => d.gapPercent!);
  const ranges = days.map(d => d.rangePercent);
  const closeLocs = days.map(d => d.closeLocation);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const bullishDays = days.filter(d => d.changePercent > 0).length;
  const bearishDays = days.filter(d => d.changePercent <= 0).length;

  return {
    count: days.length,
    bullishCount: bullishDays,
    bearishCount: bearishDays,
    bullishPct: (bullishDays / days.length) * 100,
    avgChange: avg(changes),
    medianChange: median(changes),
    avgGap: gaps.length > 0 ? avg(gaps) : null,
    avgRange: avg(ranges),
    medianRange: median(ranges),
    avgCloseLocation: avg(closeLocs),
    maxGain: Math.max(...changes),
    maxLoss: Math.min(...changes),
  };
}
