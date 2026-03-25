-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- Creates the challenge_reviews table and RLS policies

CREATE TABLE challenge_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  challenge_id text NOT NULL,
  instrument text,
  target smallint NOT NULL,
  trading_size real NOT NULL,
  days_played smallint NOT NULL,
  total_trades smallint NOT NULL,
  total_exits smallint NOT NULL,
  winners smallint NOT NULL,
  losers smallint NOT NULL,
  win_rate real NOT NULL,
  total_pnl real NOT NULL,
  avg_win real NOT NULL,
  avg_loss real NOT NULL,
  profit_factor real NOT NULL,
  max_drawdown real NOT NULL,
  max_runup real NOT NULL,
  best_trade real NOT NULL,
  worst_trade real NOT NULL,
  avg_pnl real NOT NULL,
  overall_rating smallint NOT NULL,
  overall_notes text,
  trade_group_reviews jsonb,
  challenge_days jsonb,
  all_trades jsonb,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE challenge_reviews ENABLE ROW LEVEL SECURITY;

-- Users can only read their own reviews
CREATE POLICY "Users can read own reviews"
  ON challenge_reviews FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own reviews
CREATE POLICY "Users can insert own reviews"
  ON challenge_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups by user
CREATE INDEX idx_challenge_reviews_user_id ON challenge_reviews(user_id);
CREATE INDEX idx_challenge_reviews_submitted_at ON challenge_reviews(user_id, submitted_at DESC);
