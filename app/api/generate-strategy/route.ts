import { NextRequest, NextResponse } from "next/server";

interface GenerateRequest {
  prompt: string;
}

const SYSTEM_PROMPT = `You are a quantitative trading strategy compiler. You convert natural language trading ideas into a structured JSON rule format for backtesting on NASDAQ-100 (NDX) 5-minute intraday data.

The trading day has approximately 78 five-minute bars (9:30 AM to 4:00 PM ET).
- Bar 0 = first 5 min (9:30-9:35), Bar 1 = 9:35-9:40, Bar 2 = 9:40-9:45, etc.
- "3rd candle" = barIndex: 2 (0-indexed). "first 30 minutes" = bars 0-5.
- Bar 5 = 10:00 AM. Bar 11 = 10:30 AM. Bar 23 = 11:30 AM. Bar 77 = last bar.

You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no code fences).

SCHEMA:
{
  "name": "Short descriptive name",
  "conditions": [
    {
      "type": "<condition_type>",
      "barIndex": <number>,         // for FIXED bar checks
      "value": <number or omit>,
      "search": {                    // for DYNAMIC pattern searching (omit for fixed)
        "fromBar": <number>,         // start scanning from (default 0)
        "toBar": <number>,           // stop scanning at (default 77)
        "occurrence": <number>       // which occurrence (1=first, 2=second, default 1)
      }
    }
  ],
  "direction": "long" | "short",
  "entryBar": <number>,             // fixed bar index (used when entryMode is "fixed")
  "entryPrice": "open" | "close",
  "entryMode": "fixed" | "after_pattern",  // "after_pattern" = enter relative to last dynamic match
  "entryOffset": <number>,          // bars after pattern to enter (default 1, used with after_pattern)
  "stopPoints": <number, 0 if none>,
  "targetPoints": <number, 0 if none>,
  "holdToClose": <boolean>,
  "maxHoldBars": <number or omit>
}

CONDITIONS — Two modes:

A) FIXED BAR (use "barIndex"):
Check a specific bar by index. Example: { "type": "candle_bullish", "barIndex": 2 }

B) DYNAMIC SEARCH (use "search"):
Scan a range of bars to find the Nth occurrence of a pattern. Example:
{ "type": "inside_bar", "search": { "fromBar": 1, "toBar": 20, "occurrence": 1 } }
When using search, omit barIndex. The executor finds where the pattern occurs.
Use entryMode: "after_pattern" so entry is relative to the found bar.

AVAILABLE CONDITION TYPES:

Simple bar conditions (use barIndex or search):
- "candle_bullish" — close > open (green candle)
- "candle_bearish" — close < open (red candle)
- "candle_body_min_pct" — body >= value% of open. Needs value.
- "candle_body_max_pct" — body <= value% of open. Needs value.
- "bar_range_min_pct" — (high-low)/open >= value%. Needs value.
- "bar_range_max_pct" — (high-low)/open <= value%. Needs value.
- "close_in_upper_half" — close in upper half of bar's range
- "close_in_lower_half" — close in lower half of bar's range
- "price_above_open" — bar close > day's opening price
- "price_below_open" — bar close < day's opening price
- "price_above_prev_close" — bar close > previous day close
- "price_below_prev_close" — bar close < previous day close
- "higher_high" — bar makes higher high than previous bar
- "lower_low" — bar makes lower low than previous bar
- "higher_close" — bar closes higher than previous bar
- "lower_close" — bar closes lower than previous bar
- "break_above_high" — bar close > highest high of all prior bars
- "break_below_low" — bar close < lowest low of all prior bars

Candle patterns (best with search for dynamic detection):
- "inside_bar" — high <= prev high AND low >= prev low (contraction)
- "outside_bar" — high > prev high AND low < prev low (expansion/engulfing range)
- "wide_bar" — range >= value× avg range of prior 5 bars (default value: 1.5)
- "narrow_bar" — range <= value× avg range of prior 5 bars (default value: 0.5)
- "doji" — body <= value% of total range (default value: 20)
- "hammer" — long lower wick >= 2× body, tiny upper wick (bullish reversal)
- "shooting_star" — long upper wick >= 2× body, tiny lower wick (bearish reversal)
- "engulfing_bullish" — bullish bar whose body engulfs previous bearish bar's body
- "engulfing_bearish" — bearish bar whose body engulfs previous bullish bar's body
- "pin_bar_bullish" — lower wick >= 60% of range, close in upper 30% (rejection)
- "pin_bar_bearish" — upper wick >= 60% of range, close in lower 30% (rejection)
- "three_bar_bullish" — 3-bar pattern: bearish, inside/doji, bullish (reversal)
- "three_bar_bearish" — 3-bar pattern: bullish, inside/doji, bearish (reversal)

Day-level conditions (no barIndex needed):
- "gap_up" — day gapped up
- "gap_down" — day gapped down
- "gap_min_pct" — |gap%| >= value. Needs value.
- "prev_day_bullish" — previous day was green
- "prev_day_bearish" — previous day was red
- "first_n_bars_bullish" — close at barIndex > day's open (net bullish over N bars)
- "first_n_bars_bearish" — close at barIndex < day's open (net bearish over N bars)

RULES:
1. For DYNAMIC strategies (e.g. "first inside bar"), use "search" on the pattern condition and set "entryMode": "after_pattern", "entryOffset": 1.
2. For FIXED strategies (e.g. "3rd candle bullish"), use "barIndex" and set "entryMode": "fixed".
3. "entryBar" is for fixed mode. "entryOffset" is for after_pattern mode.
4. Default entry at the NEXT bar's open after the signal.
5. If no stops/targets specified, use 0 (hold to close).
6. Be smart: "inside bar" = inside_bar, "wide candle" = wide_bar, "engulfing" = engulfing_bullish or engulfing_bearish based on context.
7. For wide_bar, value is a multiplier (1.5 = 1.5× average). For doji, value is max body %.
8. ONLY output JSON. No other text.`;

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

    return NextResponse.json({ strategy: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach DeepSeek API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
