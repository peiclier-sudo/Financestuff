import { ClosedTrade } from "./backtestTypes";

export const REVIEW_TAGS = [
  // Emotional
  "FOMO", "Revenge", "Impulse", "Patience",
  // Execution
  "Early Exit", "Late Entry", "Chasing", "Oversize", "Scaling",
  // Plan
  "Plan A", "Plan B", "Conviction",
] as const;

export type ReviewTag = (typeof REVIEW_TAGS)[number] | string;

export interface TradeGroupReview {
  /** Exit bar time (groups all trades that exited on this bar) */
  exitTime: number;
  exitPrice: number;
  /** All closed trades in this group */
  trades: ClosedTrade[];
  /** 1-5 star rating */
  rating: number;
  /** Selected tags */
  tags: ReviewTag[];
  /** Custom tags added by user */
  customTags: string[];
  /** Free-text: what was the idea */
  idea: string;
  /** Free-text: was it coherent with plan */
  coherent: string;
  /** Free-text: execution notes */
  executionNotes: string;
}

export interface DayReview {
  /** ISO date string */
  date: string;
  dayName: string;
  /** Day change % */
  changePercent: number;
  rangePercent: number;
  /** All trade group reviews */
  tradeGroups: TradeGroupReview[];
  /** Day-level rating 1-5 */
  dayRating: number;
  /** Day-level improvement note */
  dayNotes: string;
  /** Auto-captured stats */
  stats: {
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
  };
  /** Trading size used */
  tradingSize: number;
  /** Timestamp of review submission */
  submittedAt: number;
}

export interface UserFeedbackProfile {
  userId: string;
  createdAt: number;
  dayReviews: DayReview[];
}
