import { supabase } from "./supabase";
import { ChallengeReview } from "./challengeTypes";

export async function saveChallengeReview(review: ChallengeReview): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase not configured" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("challenge_reviews").insert({
    user_id: user.id,
    challenge_id: review.challenge.id,
    instrument: review.instrument ?? null,
    target: review.challenge.target,
    trading_size: review.challenge.tradingSize,
    days_played: review.stats.daysPlayed,
    total_trades: review.stats.totalTrades,
    total_exits: review.stats.totalExits,
    winners: review.stats.winners,
    losers: review.stats.losers,
    win_rate: review.stats.winRate,
    total_pnl: review.stats.totalPnl,
    avg_win: review.stats.avgWin,
    avg_loss: review.stats.avgLoss,
    profit_factor: review.stats.profitFactor,
    max_drawdown: review.stats.maxDrawdown,
    max_runup: review.stats.maxRunup,
    best_trade: review.stats.bestTrade,
    worst_trade: review.stats.worstTrade,
    avg_pnl: review.stats.avgPnl,
    overall_rating: review.overallRating,
    overall_notes: review.overallNotes,
    trade_group_reviews: review.tradeGroupReviews,
    challenge_days: review.challenge.days,
    all_trades: review.challenge.allTrades,
    submitted_at: new Date(review.submittedAt).toISOString(),
  });

  return { error: error?.message ?? null };
}

export interface ChallengeHistoryRow {
  id: string;
  challenge_id: string;
  instrument: string | null;
  target: number;
  days_played: number;
  total_trades: number;
  total_exits: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  max_drawdown: number;
  max_runup: number;
  best_trade: number;
  worst_trade: number;
  avg_pnl: number;
  overall_rating: number;
  submitted_at: string;
  trade_group_reviews: unknown;
}

export async function loadChallengeHistory(target?: number): Promise<{ data: ChallengeHistoryRow[]; error: string | null }> {
  if (!supabase) return { data: [], error: "Supabase not configured" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: "Not signed in" };

  let query = supabase
    .from("challenge_reviews")
    .select("id, challenge_id, instrument, target, days_played, total_trades, total_exits, winners, losers, win_rate, total_pnl, avg_win, avg_loss, profit_factor, max_drawdown, max_runup, best_trade, worst_trade, avg_pnl, overall_rating, submitted_at, trade_group_reviews")
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (target) {
    query = query.eq("target", target);
  }

  const { data, error } = await query;

  return { data: data ?? [], error: error?.message ?? null };
}
