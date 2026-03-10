import { NextRequest, NextResponse } from "next/server";

interface ParseRequest {
  block: "entry" | "exit" | "takeProfit" | "management";
  text: string;
}

const BLOCK_PROMPTS: Record<string, string> = {
  entry: `You are a trading entry signal parser. Convert a natural language entry description into JSON.

Day = 78 five-minute bars. Bar 0 = 9:30, Bar 5 = 10:00, Bar 11 = 10:30, Bar 23 = 11:30, Bar 77 = close.

OUTPUT one JSON object with these fields:
{
  "type": "candle_breakout"|"level_breakout"|"candle_close"|"time_entry"|"pattern_entry"|"atr_breakout",
  "direction": "long"|"short"|"auto",
  // candle_breakout: candleStart, candleEnd, breakSide ("high"|"low")
  // level_breakout: level ("day_open"|"prev_close"|"prev_day_high"|"prev_day_low"|"opening_range_high"|"opening_range_low"), orBars
  // candle_close: closeBar, closeDirection ("bullish"|"bearish"|"any")
  // time_entry: entryBar
  // pattern_entry: pattern ("inside_bar"|"outside_bar"|"engulfing_bullish"|"engulfing_bearish"|"doji"|"hammer"|"shooting_star"|"bullish"|"bearish"), searchFrom, searchTo, occurrence, entryOffset
  // atr_breakout: atrMultiplier, atrLength, atrSide ("above"|"below")
}

EXAMPLES:
"Breakout of first 5 candles high going long" → {"type":"candle_breakout","direction":"long","candleStart":0,"candleEnd":4,"breakSide":"high"}
"Enter long at 10:00" → {"type":"time_entry","direction":"long","entryBar":6}
"After first inside bar" → {"type":"pattern_entry","direction":"auto","pattern":"inside_bar","searchFrom":1,"searchTo":40,"occurrence":1,"entryOffset":1}
"Price breaks above previous day high" → {"type":"level_breakout","direction":"long","level":"prev_day_high"}
"ATR breakout above 1.5x" → {"type":"atr_breakout","direction":"long","atrMultiplier":1.5,"atrLength":14,"atrSide":"above"}
"3rd candle closes bullish" → {"type":"candle_close","direction":"long","closeBar":2,"closeDirection":"bullish"}

ONLY output JSON.`,

  exit: `You are a stop loss parser. Convert a natural language stop loss description into JSON.

OUTPUT one JSON object:
{
  "type": "none"|"fixed_points"|"candle_extremity"|"atr"|"level"|"prev_day_range",
  // fixed_points: points (number)
  // candle_extremity: candleRef ("entry"|"prev"|"group"), groupStart, groupEnd, padding
  // atr: atrMultiplier, atrLength
  // level: levelType ("prev_close"|"prev_day_high"|"prev_day_low"|"day_open")
  // prev_day_range: rangeMultiplier
}

EXAMPLES:
"50 point stop" → {"type":"fixed_points","points":50}
"Stop at previous candle low" → {"type":"candle_extremity","candleRef":"prev","padding":0}
"1.5 ATR stop" → {"type":"atr","atrMultiplier":1.5,"atrLength":14}
"Stop at previous day low" → {"type":"level","levelType":"prev_day_low"}
"Half of previous day range" → {"type":"prev_day_range","rangeMultiplier":0.5}
"No stop" → {"type":"none"}

ONLY output JSON.`,

  takeProfit: `You are a take profit parser. Convert a natural language target description into JSON.

OUTPUT one JSON object:
{
  "type": "none"|"fixed_points"|"risk_multiple"|"prev_day_level"|"atr"|"hold_bars",
  // fixed_points: points (number)
  // risk_multiple: riskMultiple (number, e.g. 2 for 2R)
  // prev_day_level: levelType ("prev_day_high"|"prev_day_low"|"prev_close"|"day_open"|"prev_day_gap")
  // atr: atrMultiplier, atrLength
  // hold_bars: holdBars (number)
}

EXAMPLES:
"Hold to close" → {"type":"none"}
"100 point target" → {"type":"fixed_points","points":100}
"2R target" → {"type":"risk_multiple","riskMultiple":2}
"Previous day high" → {"type":"prev_day_level","levelType":"prev_day_high"}
"2 ATR target" → {"type":"atr","atrMultiplier":2,"atrLength":14}
"Hold for 1 hour" → {"type":"hold_bars","holdBars":12}

ONLY output JSON.`,

  management: `You are a trade management parser. Convert a natural language management description into JSON.

OUTPUT one JSON object:
{
  "type": "none"|"be"|"trail"|"be_and_trail",
  // BE: beTrigger ("points"|"risk_multiple"|"level"|"day_open"), beValue (number), beLevel (string)
  // Trail: trailTrigger ("points"|"risk_multiple"|"level"), trailTriggerValue (number), trailTriggerLevel (string),
  //        trailMethod ("candle_hl"|"atr"|"fixed_distance"), trailMethodValue (number), trailAtrLength
}

EXAMPLES:
"No management" → {"type":"none"}
"Break even at 1R" → {"type":"be","beTrigger":"risk_multiple","beValue":1}
"Trail after 30 points using candle lows, 3 bar lookback" → {"type":"trail","trailTrigger":"points","trailTriggerValue":30,"trailMethod":"candle_hl","trailMethodValue":3}
"BE at 20 pts then trail with ATR" → {"type":"be_and_trail","beTrigger":"points","beValue":20,"trailTrigger":"points","trailTriggerValue":20,"trailMethod":"atr","trailMethodValue":1.5,"trailAtrLength":14}

ONLY output JSON.`,
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  const body: ParseRequest = await request.json();
  const { block, text } = body;

  if (!text?.trim() || !BLOCK_PROMPTS[block]) {
    return NextResponse.json({ error: "Invalid block or empty text" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: BLOCK_PROMPTS[block] },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `DeepSeek error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: `Invalid JSON from AI: ${content.slice(0, 200)}` }, { status: 422 });
    }

    return NextResponse.json({ config: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
