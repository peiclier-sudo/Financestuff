import { ClosedTrade } from "./backtestTypes";
import { TradeGroupReview } from "./reviewTypes";

export type ChallengeTarget = 15 | 30;

export interface ChallengeDay {
  date: string;
  dayName: string;
  changePercent: number;
  rangePercent: number;
  /** Trades closed during this day */
  trades: ClosedTrade[];
  /** Number of exit events (grouped by exitTime) this day */
  exitCount: number;
}

export interface ChallengeState {
  /** Unique challenge ID */
  id: string;
  target: ChallengeTarget;
  startedAt: number;
  /** Trading size used */
  tradingSize: number;
  /** All days played so far */
  days: ChallengeDay[];
  /** All closed trades across all days (flat) */
  allTrades: ClosedTrade[];
  /** Running count of exit events */
  totalExits: number;
  /** Whether the challenge is complete (target reached) */
  complete: boolean;
}

export interface ChallengeReview {
  challenge: ChallengeState;
  /** Trade group reviews (from the review flow) */
  tradeGroupReviews: TradeGroupReview[];
  /** Overall challenge rating 1-5 */
  overallRating: number;
  /** Overall notes */
  overallNotes: string;
  /** Computed stats */
  stats: {
    totalTrades: number;
    totalExits: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxRunup: number;
    bestTrade: number;
    worstTrade: number;
    avgPnl: number;
    daysPlayed: number;
  };
  submittedAt: number;
}

const CHALLENGE_KEY = "backtest_challenge";

export function saveChallenge(state: ChallengeState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHALLENGE_KEY, JSON.stringify(state));
}

export function loadChallenge(): ChallengeState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CHALLENGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChallengeState;
  } catch {
    return null;
  }
}

export function clearChallenge(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHALLENGE_KEY);
}

export function countExitEvents(trades: ClosedTrade[]): number {
  const exitTimes = new Set(trades.map((t) => t.exitTime));
  return exitTimes.size;
}

export function computeChallengeStats(trades: ClosedTrade[]): ChallengeReview["stats"] {
  const wins = trades.filter((t) => t.pnlPoints > 0);
  const losses = trades.filter((t) => t.pnlPoints <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnlPoints, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPoints, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPoints, 0) / losses.length : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));

  // Equity curve for drawdown/runup
  let peak = 0;
  let trough = 0;
  let maxDrawdown = 0;
  let maxRunup = 0;
  let equity = 0;
  for (const t of trades) {
    equity += t.pnlPoints;
    if (equity > peak) peak = equity;
    if (equity < trough) trough = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    const ru = equity - trough;
    if (ru > maxRunup) maxRunup = ru;
  }

  return {
    totalTrades: trades.length,
    totalExits: countExitEvents(trades),
    winners: wins.length,
    losers: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    avgWin,
    avgLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdown,
    maxRunup,
    bestTrade: trades.length > 0 ? Math.max(...trades.map((t) => t.pnlPoints)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map((t) => t.pnlPoints)) : 0,
    avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
    daysPlayed: new Set(trades.map((t) => new Date(t.entryTime * 1000).toDateString())).size,
  };
}
