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
  prevClose: number | null;
  prevDayDirection: string | null;
  prevDayChangePercent: number | null;
  prevDayRangePercent: number | null;
  prevDayGapPercent: number | null;
  closeLocation: number;
  bodyPercent: number;
  upperWickPercent: number;
  lowerWickPercent: number;
}

interface Stats {
  count: number;
  bullishPct: number;
  avgChange: number;
  medianChange: number;
  avgGap: number | null;
  avgRange: number;
  avgCloseLocation: number;
  maxGain: number;
  maxLoss: number;
}

interface AnalyzeRequest {
  days: DaySummary[];
  stats: Stats;
  filterDescription: string;
}

// ---------- server-side derived analytics ----------

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx, y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function computeDerivedAnalytics(days: DaySummary[]) {
  // --- Gap fill analysis ---
  const gapDays = days.filter(d => d.gapPercent !== null && d.prevClose !== null);
  let gapFillCount = 0;
  let gapFadeCount = 0; // closed opposite to gap direction
  const gapSizes: number[] = [];
  const gapFillDetails: { size: number; filled: boolean; fadePct: number; closeLocation: number }[] = [];

  for (const d of gapDays) {
    const gap = d.gapPercent!;
    const pc = d.prevClose!;
    gapSizes.push(Math.abs(gap));

    // Gap fill = price returned to previous close during the day
    const gapUp = gap > 0;
    const filled = gapUp ? d.low <= pc : d.high >= pc;
    if (filled) gapFillCount++;

    // Fade = closed opposite direction of gap
    const faded = gapUp ? d.close < d.open : d.close > d.open;
    if (faded) gapFadeCount++;

    // How much of gap was faded by close
    const gapSize = d.open - pc;
    const fadePct = gapSize !== 0 ? ((d.open - d.close) / gapSize) * 100 : 0;

    gapFillDetails.push({ size: Math.abs(gap), filled, fadePct, closeLocation: d.closeLocation });
  }

  const gapFillRate = gapDays.length > 0 ? (gapFillCount / gapDays.length * 100) : null;
  const gapFadeRate = gapDays.length > 0 ? (gapFadeCount / gapDays.length * 100) : null;
  const avgGapFadePct = gapFillDetails.length > 0
    ? gapFillDetails.reduce((a, b) => a + b.fadePct, 0) / gapFillDetails.length
    : null;

  // --- Correlation: gap size vs close location ---
  const gapCloseCorr = gapFillDetails.length >= 5
    ? correlation(gapFillDetails.map(g => g.size), gapFillDetails.map(g => g.closeLocation))
    : null;

  // --- Correlation: gap size vs fade % ---
  const gapFadeCorr = gapFillDetails.length >= 5
    ? correlation(gapFillDetails.map(g => g.size), gapFillDetails.map(g => g.fadePct))
    : null;

  // --- Intraday structure analysis ---
  const upperWicks = days.map(d => d.upperWickPercent);
  const lowerWicks = days.map(d => d.lowerWickPercent);
  const bodies = days.map(d => d.bodyPercent);
  const closeLocs = days.map(d => d.closeLocation);

  const avgUpperWick = upperWicks.reduce((a, b) => a + b, 0) / days.length;
  const avgLowerWick = lowerWicks.reduce((a, b) => a + b, 0) / days.length;
  const avgBody = bodies.reduce((a, b) => a + b, 0) / days.length;

  // Close location distribution
  const closeInBottom25 = closeLocs.filter(c => c <= 0.25).length;
  const closeInTop25 = closeLocs.filter(c => c >= 0.75).length;
  const closeInMiddle = closeLocs.filter(c => c > 0.25 && c < 0.75).length;

  // --- Sequential pattern analysis ---
  // Look at 2-day and 3-day sequences
  const sequences: { pattern: string; count: number; avgNextChange: number }[] = [];
  const twoDay: Record<string, { count: number; nextChanges: number[] }> = {};

  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].changePercent >= 0 ? "B" : "R"; // Bullish/Bearish
    const curr = days[i].changePercent >= 0 ? "B" : "R";
    const pattern = `${prev}→${curr}`;

    if (!twoDay[pattern]) twoDay[pattern] = { count: 0, nextChanges: [] };
    twoDay[pattern].count++;

    // What happens the day after this pattern?
    if (i + 1 < days.length) {
      twoDay[pattern].nextChanges.push(days[i + 1].changePercent);
    }
  }

  for (const [pattern, data] of Object.entries(twoDay)) {
    const avg = data.nextChanges.length > 0
      ? data.nextChanges.reduce((a, b) => a + b, 0) / data.nextChanges.length
      : 0;
    sequences.push({ pattern, count: data.count, avgNextChange: avg });
  }

  // --- Volatility clustering ---
  // Divide days into quintiles by range, see if big-range days cluster together
  const ranges = days.map(d => d.rangePercent);
  const rangeP80 = percentile(ranges, 80);
  let highVolClusters = 0;
  let consecutiveHighVol = 0;
  for (const d of days) {
    if (d.rangePercent >= rangeP80) {
      consecutiveHighVol++;
      if (consecutiveHighVol >= 2) highVolClusters++;
    } else {
      consecutiveHighVol = 0;
    }
  }

  // --- Day-of-week breakdown ---
  const dowStats: Record<string, { count: number; avgChange: number; bullish: number }> = {};
  for (const d of days) {
    const dow = d.dayName.slice(0, 3);
    if (!dowStats[dow]) dowStats[dow] = { count: 0, avgChange: 0, bullish: 0 };
    dowStats[dow].count++;
    dowStats[dow].avgChange += d.changePercent;
    if (d.changePercent >= 0) dowStats[dow].bullish++;
  }
  for (const v of Object.values(dowStats)) {
    v.avgChange /= v.count;
  }

  // --- Reversal vs Trend analysis ---
  const reversalDays = days.filter(d => {
    if (d.gapPercent === null) return false;
    return (d.gapPercent > 0 && d.changePercent < 0) || (d.gapPercent < 0 && d.changePercent > 0);
  });
  const trendDays = days.filter(d => {
    if (d.gapPercent === null) return false;
    return (d.gapPercent > 0 && d.changePercent > 0) || (d.gapPercent < 0 && d.changePercent < 0);
  });

  // --- Change distribution ---
  const changes = days.map(d => d.changePercent);
  const p10 = percentile(changes, 10);
  const p25 = percentile(changes, 25);
  const p75 = percentile(changes, 75);
  const p90 = percentile(changes, 90);
  const stdDev = Math.sqrt(changes.reduce((a, c) => a + (c - (changes.reduce((x, y) => x + y, 0) / changes.length)) ** 2, 0) / changes.length);

  return {
    gapAnalysis: {
      daysWithGap: gapDays.length,
      fillRate: gapFillRate,
      fadeRate: gapFadeRate,
      avgGapFadePct,
      gapSizeVsCloseCorrelation: gapCloseCorr,
      gapSizeVsFadeCorrelation: gapFadeCorr,
      smallGapFillRate: gapFillDetails.filter(g => g.size <= median(gapSizes)).length > 0
        ? gapFillDetails.filter(g => g.size <= median(gapSizes) && g.filled).length / gapFillDetails.filter(g => g.size <= median(gapSizes)).length * 100
        : null,
      largeGapFillRate: gapFillDetails.filter(g => g.size > median(gapSizes)).length > 0
        ? gapFillDetails.filter(g => g.size > median(gapSizes) && g.filled).length / gapFillDetails.filter(g => g.size > median(gapSizes)).length * 100
        : null,
    },
    intradayStructure: {
      avgUpperWick,
      avgLowerWick,
      avgBody,
      closeDistribution: {
        bottom25Pct: (closeInBottom25 / days.length * 100),
        middle50Pct: (closeInMiddle / days.length * 100),
        top25Pct: (closeInTop25 / days.length * 100),
      },
    },
    sequentialPatterns: sequences.sort((a, b) => b.count - a.count),
    volatility: {
      stdDev,
      highVolClusterCount: highVolClusters,
      rangeP80,
    },
    dayOfWeekBreakdown: dowStats,
    reversalVsTrend: {
      reversalDays: reversalDays.length,
      trendDays: trendDays.length,
      reversalAvgChange: reversalDays.length > 0 ? reversalDays.reduce((a, d) => a + Math.abs(d.changePercent), 0) / reversalDays.length : 0,
      trendAvgChange: trendDays.length > 0 ? trendDays.reduce((a, d) => a + Math.abs(d.changePercent), 0) / trendDays.length : 0,
    },
    changeDistribution: { p10, p25, median: median(changes), p75, p90, stdDev },
  };
}

// ---------- route handler ----------

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

  // Compute derived analytics server-side
  const derived = computeDerivedAnalytics(days);

  // Sample days for the raw data section (keep to ~150 to manage tokens)
  const maxSample = 150;
  const sampleDays = days.length > maxSample
    ? days.filter((_, i) => i % Math.ceil(days.length / maxSample) === 0).slice(0, maxSample)
    : days;

  const prompt = `You are a quantitative market analyst. You have been given COMPLETE raw day-by-day OHLC data for a filtered set of NASDAQ-100 (NDX) trading days, plus pre-computed derived analytics. Perform a DEEP, day-by-day analysis. Do NOT say you lack data — you have everything below.

═══════════════════════════════════════
FILTER CRITERIA: ${filterDescription}
═══════════════════════════════════════

AGGREGATE STATISTICS:
- Total matching days: ${stats.count}
- Bullish days: ${stats.bullishPct.toFixed(1)}%
- Average daily change: ${stats.avgChange.toFixed(3)}%
- Median daily change: ${stats.medianChange.toFixed(3)}%
- Average gap: ${stats.avgGap !== null ? stats.avgGap.toFixed(3) + "%" : "N/A"}
- Average range: ${stats.avgRange.toFixed(3)}%
- Average close location (0=low, 1=high): ${stats.avgCloseLocation.toFixed(2)}
- Max gain: +${stats.maxGain.toFixed(2)}% | Max loss: ${stats.maxLoss.toFixed(2)}%

═══════════════════════════════════════
PRE-COMPUTED DERIVED ANALYTICS
═══════════════════════════════════════

## GAP FILL ANALYSIS
- Days with gap: ${derived.gapAnalysis.daysWithGap}
- Gap fill rate (price returned to prev close): ${derived.gapAnalysis.fillRate !== null ? derived.gapAnalysis.fillRate.toFixed(1) + "%" : "N/A"}
- Gap fade rate (closed opposite to gap direction): ${derived.gapAnalysis.fadeRate !== null ? derived.gapAnalysis.fadeRate.toFixed(1) + "%" : "N/A"}
- Average gap fade %: ${derived.gapAnalysis.avgGapFadePct !== null ? derived.gapAnalysis.avgGapFadePct.toFixed(1) + "%" : "N/A"}
- Small gaps fill rate: ${derived.gapAnalysis.smallGapFillRate !== null ? derived.gapAnalysis.smallGapFillRate.toFixed(1) + "%" : "N/A"}
- Large gaps fill rate: ${derived.gapAnalysis.largeGapFillRate !== null ? derived.gapAnalysis.largeGapFillRate.toFixed(1) + "%" : "N/A"}
- Correlation (gap size → close location): ${derived.gapAnalysis.gapSizeVsCloseCorrelation !== null ? derived.gapAnalysis.gapSizeVsCloseCorrelation.toFixed(3) : "N/A"}
- Correlation (gap size → fade %): ${derived.gapAnalysis.gapSizeVsFadeCorrelation !== null ? derived.gapAnalysis.gapSizeVsFadeCorrelation.toFixed(3) : "N/A"}

## INTRADAY CANDLE STRUCTURE
- Avg upper wick: ${derived.intradayStructure.avgUpperWick.toFixed(3)}%
- Avg lower wick: ${derived.intradayStructure.avgLowerWick.toFixed(3)}%
- Avg body size: ${derived.intradayStructure.avgBody.toFixed(3)}%
- Close in bottom 25% of range: ${derived.intradayStructure.closeDistribution.bottom25Pct.toFixed(1)}% of days
- Close in middle 50% of range: ${derived.intradayStructure.closeDistribution.middle50Pct.toFixed(1)}% of days
- Close in top 25% of range: ${derived.intradayStructure.closeDistribution.top25Pct.toFixed(1)}% of days

## SEQUENTIAL PATTERNS (2-day patterns → what happens next)
${derived.sequentialPatterns.map(s =>
  `- ${s.pattern}: ${s.count} occurrences → next day avg change: ${s.avgNextChange >= 0 ? "+" : ""}${s.avgNextChange.toFixed(3)}%`
).join("\n")}

## REVERSAL vs TREND DAYS
- Reversal days (gap up → close down, or gap down → close up): ${derived.reversalVsTrend.reversalDays} (avg |change|: ${derived.reversalVsTrend.reversalAvgChange.toFixed(3)}%)
- Trend days (gap and close same direction): ${derived.reversalVsTrend.trendDays} (avg |change|: ${derived.reversalVsTrend.trendAvgChange.toFixed(3)}%)

## VOLATILITY
- Daily change std dev: ${derived.volatility.stdDev.toFixed(3)}%
- High-volatility clusters (≥2 consecutive days above 80th pctl range): ${derived.volatility.highVolClusterCount}
- 80th percentile range: ${derived.volatility.rangeP80.toFixed(3)}%

## CHANGE DISTRIBUTION
- 10th percentile: ${derived.changeDistribution.p10.toFixed(3)}%
- 25th percentile: ${derived.changeDistribution.p25.toFixed(3)}%
- Median: ${derived.changeDistribution.median.toFixed(3)}%
- 75th percentile: ${derived.changeDistribution.p75.toFixed(3)}%
- 90th percentile: ${derived.changeDistribution.p90.toFixed(3)}%

## DAY OF WEEK BREAKDOWN
${Object.entries(derived.dayOfWeekBreakdown).map(([dow, s]) =>
  `- ${dow}: ${s.count} days, avg change ${s.avgChange >= 0 ? "+" : ""}${s.avgChange.toFixed(3)}%, bullish ${(s.bullish / s.count * 100).toFixed(1)}%`
).join("\n")}

═══════════════════════════════════════
RAW DAY-BY-DAY DATA (${sampleDays.length} of ${days.length} days)
═══════════════════════════════════════
${sampleDays.map(d =>
  `${d.date} ${d.dayName.slice(0, 3)} | O:${d.open.toFixed(2)} H:${d.high.toFixed(2)} L:${d.low.toFixed(2)} C:${d.close.toFixed(2)} | Chg:${d.changePercent > 0 ? "+" : ""}${d.changePercent.toFixed(2)}% Gap:${d.gapPercent !== null ? (d.gapPercent > 0 ? "+" : "") + d.gapPercent.toFixed(2) + "%" : "N/A"} Rng:${d.rangePercent.toFixed(2)}% | Body:${d.bodyPercent.toFixed(2)}% UW:${d.upperWickPercent.toFixed(2)}% LW:${d.lowerWickPercent.toFixed(2)}% | CloseLoc:${d.closeLocation.toFixed(2)} | PrevDay:${d.prevDayDirection ?? "N/A"} ${d.prevDayChangePercent !== null ? (d.prevDayChangePercent > 0 ? "+" : "") + d.prevDayChangePercent.toFixed(2) + "%" : ""}`
).join("\n")}

═══════════════════════════════════════
ANALYSIS REQUIREMENTS — GO DEEP
═══════════════════════════════════════

You have ALL the raw data. Perform a thorough analysis covering:

1. **Pattern Summary** — Dominant behavior in 2-3 sentences.

2. **Gap Behavior Deep Dive** — Gap fill probability broken down by size. Is the relationship between gap size and fade linear? Does a larger gap predict a lower/higher close location? Interpret the correlations provided.

3. **Intraday Price Action** — Using candle structure (body vs wicks), close location distribution: Do these days trend or mean-revert? Is there a tendency to sell off from highs (large upper wick) or buy up from lows (large lower wick)? What does the close location distribution tell us about end-of-day behavior?

4. **Sequential & Clustering Patterns** — What happens AFTER these filtered days? Do they cluster (volatility begets volatility)? What do the 2-day sequential patterns predict for the next day? Any exploitable edges?

5. **Day-of-Week Effects** — Any specific day bias within this filtered set?

6. **Change Distribution & Tail Risk** — Shape of the distribution (skew, fat tails). What does the 10th vs 90th percentile spread tell us? How to size positions given the tail risk?

7. **Reversal vs Trend Classification** — Ratio of reversal to trend days. Which type produces bigger moves? Can a trader exploit the dominant type?

8. **Actionable Trading Thesis** — Specific entry/exit framework based on ALL the evidence above. Include:
   - Optimal entry timing inference (based on candle structure)
   - Stop loss placement (based on range/wick data)
   - Target setting (based on change distribution percentiles)
   - Position sizing consideration (based on volatility)

Be specific. Use the exact numbers from the data. No hedging with "we'd need more data" — you HAVE the data.`;

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
          {
            role: "system",
            content: "You are an elite quantitative trading analyst specialized in NASDAQ-100 intraday patterns. You have been given comprehensive raw data AND pre-computed statistical analyses. Use ALL of it. Be precise, exhaustive, and data-driven. Never claim data is missing — everything you need is in the prompt. Give specific, actionable conclusions with exact numbers.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
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
