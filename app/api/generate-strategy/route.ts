import { NextRequest, NextResponse } from "next/server";

interface GenerateRequest {
  prompt: string;
}

const SYSTEM_PROMPT = `You are a trading strategy compiler. Convert natural language into JSON for backtesting NASDAQ-100 5-min bars.

Day = 78 bars. Bar 0 = 9:30, Bar 5 = 10:00, Bar 11 = 10:30, Bar 23 = 11:30, Bar 77 = close.

OUTPUT FORMAT — JSON only, no explanation:
{
  "name": "string",
  "conditions": [{ "type": "string", "barIndex": N, "value": N, "search": { "fromBar": N, "toBar": N, "occurrence": N } }],
  "direction": "long"|"short",
  "entryBar": N,
  "entryPrice": "open"|"close",
  "entryMode": "fixed"|"after_pattern",
  "entryOffset": N,
  "stopPoints": N,
  "targetPoints": N,
  "stopAtr": N,
  "targetAtr": N,
  "atrLength": N,
  "holdToClose": bool,
  "maxHoldBars": N
}

TWO MODES:
1. FIXED: check a specific bar → use "barIndex", set entryMode: "fixed"
2. DYNAMIC: find a pattern → use "search" (NOT barIndex), set entryMode: "after_pattern", entryOffset: 1

CRITICAL: When the user says "first", "find", or describes a pattern to SEARCH FOR (like "first inside bar", "find a hammer", "after an engulfing"), you MUST use "search" with fromBar/toBar/occurrence. Do NOT use barIndex for dynamic patterns.

EXAMPLES:

User: "Go long after the first inside bar of the day"
{
  "name": "First Inside Bar Long",
  "conditions": [{"type": "inside_bar", "search": {"fromBar": 1, "toBar": 77, "occurrence": 1}}],
  "direction": "long",
  "entryBar": 0,
  "entryPrice": "open",
  "entryMode": "after_pattern",
  "entryOffset": 1,
  "stopPoints": 0,
  "targetPoints": 0,
  "holdToClose": true
}

User: "Short after the first shooting star in the first hour, stop 50 pts"
{
  "name": "First Hour Shooting Star Short",
  "conditions": [{"type": "shooting_star", "search": {"fromBar": 1, "toBar": 11, "occurrence": 1}}],
  "direction": "short",
  "entryBar": 0,
  "entryPrice": "open",
  "entryMode": "after_pattern",
  "entryOffset": 1,
  "stopPoints": 50,
  "targetPoints": 0,
  "holdToClose": true
}

User: "Go long if the 3rd candle closes bullish"
{
  "name": "3rd Candle Bullish Long",
  "conditions": [{"type": "candle_bullish", "barIndex": 2}],
  "direction": "long",
  "entryBar": 3,
  "entryPrice": "open",
  "entryMode": "fixed",
  "entryOffset": 1,
  "stopPoints": 0,
  "targetPoints": 0,
  "holdToClose": true
}

User: "Long after first inside bar that is also bullish, with 1.5 ATR stop"
{
  "name": "Bullish Inside Bar + ATR Stop",
  "conditions": [
    {"type": "inside_bar", "search": {"fromBar": 1, "toBar": 40, "occurrence": 1}},
    {"type": "candle_bullish", "search": {"fromBar": 1, "toBar": 40, "occurrence": 1}}
  ],
  "direction": "long",
  "entryBar": 0,
  "entryPrice": "open",
  "entryMode": "after_pattern",
  "entryOffset": 1,
  "stopPoints": 0,
  "targetPoints": 0,
  "stopAtr": 1.5,
  "atrLength": 14,
  "holdToClose": true
}

User: "Long on gap up days after first wide bar breakout"
{
  "name": "Gap Up Wide Bar Breakout",
  "conditions": [
    {"type": "gap_up"},
    {"type": "wide_bar", "value": 1.5, "search": {"fromBar": 1, "toBar": 30, "occurrence": 1}},
    {"type": "candle_bullish", "search": {"fromBar": 1, "toBar": 30, "occurrence": 1}}
  ],
  "direction": "long",
  "entryBar": 0,
  "entryPrice": "open",
  "entryMode": "after_pattern",
  "entryOffset": 1,
  "stopPoints": 0,
  "targetPoints": 0,
  "holdToClose": true
}

CONDITIONS (use exact type strings):

Bar: candle_bullish, candle_bearish, candle_body_min_pct, candle_body_max_pct, bar_range_min_pct, bar_range_max_pct, close_in_upper_half, close_in_lower_half, price_above_open, price_below_open, price_above_prev_close, price_below_prev_close, higher_high, lower_low, higher_close, lower_close, break_above_high, break_below_low

Patterns: inside_bar, outside_bar, wide_bar (value=multiplier, default 1.5), narrow_bar (value=multiplier, default 0.5), doji (value=max body%, default 20), hammer, shooting_star, marubozu_bullish, marubozu_bearish, spinning_top, engulfing_bullish, engulfing_bearish, pin_bar_bullish, pin_bar_bearish, tweezer_top, tweezer_bottom

Multi-bar: three_bar_bullish, three_bar_bearish, morning_star, evening_star, consecutive_bullish (value=count), consecutive_bearish (value=count)

Comparison: body_larger_than_prev, body_smaller_than_prev

Levels: above_opening_range (value=N bars, default 6), below_opening_range, close_above_sma (value=period), close_below_sma

Gap: gap_up, gap_down, gap_min_pct (value=%), gap_filled

Day: prev_day_bullish, prev_day_bearish, first_n_bars_bullish, first_n_bars_bearish

Time: time_after (value=bar#), time_before (value=bar#)

Structure: consolidation (value=N bars)

ONLY output JSON.`;

// ── Pattern types that should use dynamic search when no barIndex given ──
const DYNAMIC_PATTERN_TYPES = new Set([
  "inside_bar", "outside_bar", "wide_bar", "narrow_bar",
  "doji", "hammer", "shooting_star", "marubozu_bullish", "marubozu_bearish",
  "spinning_top", "engulfing_bullish", "engulfing_bearish",
  "pin_bar_bullish", "pin_bar_bearish", "tweezer_top", "tweezer_bottom",
  "three_bar_bullish", "three_bar_bearish", "morning_star", "evening_star",
  "consecutive_bullish", "consecutive_bearish",
  "body_larger_than_prev", "body_smaller_than_prev",
  "gap_filled", "above_opening_range", "below_opening_range",
  "break_above_high", "break_below_low",
  "consolidation",
]);

// ── Post-process: fix common DeepSeek mistakes ──
function fixStrategy(parsed: Record<string, unknown>): Record<string, unknown> {
  // Fix conditions
  if (Array.isArray(parsed.conditions)) {
    let hasSearch = false;
    parsed.conditions = parsed.conditions.map((cond: Record<string, unknown>) => {
      // If it's a pattern type with barIndex but no search, and the barIndex
      // looks like it was meant to be a search (barIndex > 5 or no barIndex at all),
      // convert to search mode
      const type = cond.type as string;
      if (DYNAMIC_PATTERN_TYPES.has(type)) {
        if (!cond.search && cond.barIndex == null) {
          // No barIndex and no search — add search defaults
          cond.search = { fromBar: 1, toBar: 77, occurrence: 1 };
          delete cond.barIndex;
          hasSearch = true;
        } else if (!cond.search && typeof cond.barIndex === "number") {
          // Has barIndex but it could be intentional (fixed check) — leave it
          // unless the overall strategy seems dynamic
        }
        if (cond.search) hasSearch = true;
      }
      return cond;
    });

    // If any condition uses search but entryMode is still "fixed", fix it
    if (hasSearch && parsed.entryMode !== "after_pattern") {
      parsed.entryMode = "after_pattern";
      if (!parsed.entryOffset) parsed.entryOffset = 1;
    }
  }

  // Ensure defaults
  if (!parsed.entryMode) parsed.entryMode = "fixed";
  if (!parsed.entryOffset) parsed.entryOffset = 1;
  if (!parsed.entryBar && parsed.entryBar !== 0) parsed.entryBar = 1;
  if (!parsed.entryPrice) parsed.entryPrice = "open";
  if (parsed.stopPoints == null) parsed.stopPoints = 0;
  if (parsed.targetPoints == null) parsed.targetPoints = 0;
  if (parsed.holdToClose == null) parsed.holdToClose = true;

  return parsed;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY is not configured on the server" }, { status: 500 });
  }

  const body: GenerateRequest = await request.json();
  const { prompt } = body;

  if (!prompt.trim()) {
    return NextResponse.json({ error: "Strategy description is required" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Convert this trading idea to the JSON rule format:\n\n"${prompt}"` },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `DeepSeek API error: ${response.status} - ${err}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? "";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // Parse and validate
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: `AI returned invalid JSON: ${content.slice(0, 200)}` },
        { status: 422 }
      );
    }

    // Basic validation
    if (!parsed.name || !parsed.conditions || !parsed.direction) {
      return NextResponse.json(
        { error: "AI output missing required fields (name, conditions, direction)" },
        { status: 422 }
      );
    }

    // Auto-fix common mistakes
    parsed = fixStrategy(parsed);

    return NextResponse.json({ strategy: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach DeepSeek API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
