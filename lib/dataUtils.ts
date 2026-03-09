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
  // Group bars by calendar date (US Eastern time)
  const dayMap = new Map<string, Bar[]>();

  for (const bar of bars) {
    const d = new Date(bar.time * 1000);
    // Convert to US Eastern: use toLocaleDateString with timezone
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
      rangePercent: ((high - low) / open) * 100,
      changePercent: ((close - open) / open) * 100,
      bars: dayBars,
    });
  }

  return days;
}

export function filterDays(days: TradingDay[], criteria: FilterCriteria): TradingDay[] {
  return days.filter((day) => {
    // Day of week
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

    // Date range
    if (criteria.dateFrom && day.date < criteria.dateFrom) return false;
    if (criteria.dateTo && day.date > criteria.dateTo) return false;

    return true;
  });
}
