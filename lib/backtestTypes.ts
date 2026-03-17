export type OrderType = "market" | "limit" | "stop";
export type OrderDirection = "long" | "short";
export type OrderStatus = "pending" | "filled" | "cancelled";
export type ExitReason = "sl" | "tp" | "manual" | "eod";

export interface Order {
  id: string;
  type: OrderType;
  direction: OrderDirection;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: OrderStatus;
  filledAt?: number;
  filledPrice?: number;
}

export interface Position {
  id: string;
  orderId: string;
  direction: OrderDirection;
  entryPrice: number;
  entryTime: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface ClosedTrade {
  id: string;
  direction: OrderDirection;
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  pnlPoints: number;
  pnlPercent: number;
  exitReason: ExitReason;
}

export interface DaySignature {
  dayOfWeek: number;
  prevDayDirection: "bullish" | "bearish";
  prevDayGapDirection: "up" | "down";
  currentGapDirection: "up" | "down";
}

export interface HourlyBucket {
  hour: string;
  bullishPct: number;
  bearishPct: number;
  avgRangePct: number;
  medianRangePct: number;
  sampleSize: number;
}

export interface DaySignatureStats {
  sampleSize: number;
  bullishPct: number;
  bearishPct: number;
  avgCloseLocation: number;
  medianCloseLocation: number;
  avgChangePercent: number;
  medianChangePercent: number;
  avgRangePercent: number;
  medianRangePercent: number;
  gapFillPct: number;
  hourlyBuckets: HourlyBucket[];
}

// Lightweight filter for the random day pool
export interface PoolFilter {
  dayOfWeek: number | null;
  gapDirection: "up" | "down" | "any";
  prevDayDirection: "bullish" | "bearish" | "any";
  prevDayGapDirection: "up" | "down" | "any";
}

export const DEFAULT_POOL_FILTER: PoolFilter = {
  dayOfWeek: null,
  gapDirection: "any",
  prevDayDirection: "any",
  prevDayGapDirection: "any",
};
