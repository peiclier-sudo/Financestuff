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
}
