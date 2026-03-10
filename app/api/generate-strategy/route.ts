import { NextRequest, NextResponse } from "next/server";

interface GenerateRequest {
  prompt: string;
}

const SYSTEM_PROMPT = `You are a quantitative trading strategy compiler. You convert natural language trading ideas into a structured JSON rule format for backtesting on NASDAQ-100 (NDX) 5-minute intraday data.

The trading day has approximately 78 five-minute bars (9:30 AM to 4:00 PM ET).
- Bar 0 = first 5 min (9:30-9:35)
- Bar 1 = 9:35-9:40
- Bar 2 = 9:40-9:45
- "3rd candle" means barIndex: 2 (0-indexed)
- "first 30 minutes" = bars 0-5

You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no code fences). The schema:

{
  "name": "Short descriptive name",
  "conditions": [
    {
      "type": "<condition_type>",
      "barIndex": <number>,
      "value": <number or omit>
    }
  ],
  "direction": "long" | "short",
  "entryBar": <number>,
  "entryPrice": "open" | "close",
  "stopPoints": <number, 0 if none>,
  "targetPoints": <number, 0 if none>,
  "holdToClose": <boolean>,
  "maxHoldBars": <number or omit>
}

Available condition types:
- "candle_bullish" — bar at barIndex closed green (close > open). Needs barIndex.
- "candle_bearish" — bar at barIndex closed red (close < open). Needs barIndex.
- "candle_body_min_pct" — bar body size >= value% of open. Needs barIndex and value.
- "gap_up" — day opened above previous close.
- "gap_down" — day opened below previous close.
- "gap_min_pct" — absolute gap >= value%. Needs value.
- "price_above_prev_close" — bar close > prev day close. Needs barIndex.
- "price_below_prev_close" — bar close < prev day close. Needs barIndex.
- "price_above_open" — bar close > day's opening price. Needs barIndex.
- "price_below_open" — bar close < day's opening price. Needs barIndex.
- "first_n_bars_bullish" — close of bar at barIndex > open of bar 0. Needs barIndex.
- "first_n_bars_bearish" — close of bar at barIndex < open of bar 0. Needs barIndex.
- "prev_day_bullish" — previous trading day was bullish.
- "prev_day_bearish" — previous trading day was bearish.
- "bar_range_min_pct" — bar's (high-low)/open >= value%. Needs barIndex and value.
- "close_in_upper_half" — bar closed in upper half of its range. Needs barIndex.
- "close_in_lower_half" — bar closed in lower half of its range. Needs barIndex.

Rules:
1. "entryBar" should be the bar AFTER the last condition bar (e.g., if checking bar 2, enter at bar 3).
2. "entryPrice" is usually "open" of the entry bar.
3. If the user doesn't specify stops/targets, use 0 (no stop/target, hold to close).
4. If no hold duration specified, set "holdToClose": true.
5. Translate "the 3rd candle" to barIndex: 2. "the 1st candle" = barIndex: 0.
6. Be smart about what the user means. "If bullish" means candle_bullish.
7. ONLY output the JSON. No other text.`;

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
