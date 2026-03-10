export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradingDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0=Sun, 1=Mon, ...
  dayName: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number | null;
  gapPercent: number | null; // (open - prevClose) / prevClose * 100
  rangePercent: number; // (high - low) / open * 100
  changePercent: number; // (close - open) / open * 100
  bars: Bar[];
  // Previous day characteristics
  prevDayDirection: "bullish" | "bearish" | null;
  prevDayChangePercent: number | null;
  prevDayRangePercent: number | null;
  prevDayGapPercent: number | null;
  prevDayHigh: number | null;
  prevDayLow: number | null;
  // Intraday stats
  bodyPercent: number; // abs(close - open) / open * 100
  upperWickPercent: number; // (high - max(open,close)) / open * 100
  lowerWickPercent: number; // (min(open,close) - low) / open * 100
  closeLocation: number; // where close sits in the range: 0=low, 1=high
}

export interface FilterCriteria {
  dayOfWeek: number | null; // null = any
  gapDirection: "up" | "down" | "any";
  minGapPercent: number;
  maxGapPercent: number;
  minRangePercent: number;
  maxRangePercent: number;
  direction: "bullish" | "bearish" | "any"; // close vs open
  dateFrom: string;
  dateTo: string;
  // New criteria
  prevDayDirection: "bullish" | "bearish" | "any";
  minChangePercent: number;
  maxChangePercent: number;
  prevDayMinChangePercent: number;
  prevDayMaxChangePercent: number;
}
