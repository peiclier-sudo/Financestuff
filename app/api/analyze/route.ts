import { NextRequest, NextResponse } from "next/server";

interface DaySummary {
  date: string;
  dayName: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePercent: number;
  gapPercent: number | null;
  rangePercent: number;
  prevDayDirection: string | null;
  prevDayChangePercent: number | null;
  closeLocation: number;
  bodyPercent: number;
}

interface AnalyzeRequest {
  days: DaySummary[];
  stats: {
    count: number;
    bullishPct: number;
    avgChange: number;
    medianChange: number;
    avgGap: number | null;
    avgRange: number;
    avgCloseLocation: number;
    maxGain: number;
    maxLoss: number;
  };
  filterDescription: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY is not configured on the server" }, { status: 500 });
  }

  const body: AnalyzeRequest = await request.json();
  const { days, stats, filterDescription } = body;

  if (days.length === 0) {
    return NextResponse.json({ error: "No days to analyze" }, { status: 400 });
  }

  // Limit to 100 sample days to stay within token limits
  const sampleDays = days.length > 100
    ? days.filter((_, i) => i % Math.ceil(days.length / 100) === 0).slice(0, 100)
    : days;

  const prompt = `You are a quantitative market analyst. Analyze this filtered set of NASDAQ-100 (NDX) trading days and identify recurring patterns.

FILTER CRITERIA USED: ${filterDescription}

AGGREGATE STATISTICS:
- Total matching days: ${stats.count}
- Bullish days: ${stats.bullishPct.toFixed(1)}%
- Average daily change: ${stats.avgChange.toFixed(3)}%
- Median daily change: ${stats.medianChange.toFixed(3)}%
- Average gap: ${stats.avgGap !== null ? stats.avgGap.toFixed(3) + "%" : "N/A"}
- Average range: ${stats.avgRange.toFixed(3)}%
- Average close location (0=low, 1=high): ${stats.avgCloseLocation.toFixed(2)}
- Max gain: +${stats.maxGain.toFixed(2)}% | Max loss: ${stats.maxLoss.toFixed(2)}%

SAMPLE OF ${sampleDays.length} DAYS (from ${days.length} total):
${sampleDays.map(d =>
  `${d.date} ${d.dayName.slice(0, 3)} | O:${d.open.toFixed(0)} C:${d.close.toFixed(0)} H:${d.high.toFixed(0)} L:${d.low.toFixed(0)} | Chg:${d.changePercent > 0 ? "+" : ""}${d.changePercent.toFixed(2)}% Gap:${d.gapPercent !== null ? (d.gapPercent > 0 ? "+" : "") + d.gapPercent.toFixed(2) + "%" : "N/A"} Rng:${d.rangePercent.toFixed(2)}% | PrevDay:${d.prevDayDirection ?? "N/A"} ${d.prevDayChangePercent !== null ? (d.prevDayChangePercent > 0 ? "+" : "") + d.prevDayChangePercent.toFixed(2) + "%" : ""} | CloseLoc:${d.closeLocation.toFixed(2)}`
).join("\n")}

Provide your analysis in these sections:
1. **Pattern Summary** (2-3 sentences on the dominant pattern)
2. **Key Observations** (3-5 bullet points on notable tendencies)
3. **Intraday Behavior** (how price typically moves during these days - does it trend, reverse, etc.)
4. **Edge / Bias** (is there a statistical edge? bullish/bearish bias? quantify it)
5. **Risk Notes** (what can go wrong, outlier behavior)

Be concise and data-driven. Use specific numbers from the data.`;

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
          { role: "system", content: "You are a quantitative trading analyst specialized in intraday NASDAQ patterns. Be precise, data-driven, and concise." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
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
    const analysis = data.choices?.[0]?.message?.content ?? "No analysis returned.";

    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach DeepSeek API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
