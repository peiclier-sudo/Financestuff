import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DayReview } from "@/lib/reviewTypes";

const DATA_DIR = path.join(process.cwd(), "data", "feedback");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

function dayReviewToMarkdown(review: DayReview): string {
  const lines: string[] = [];
  lines.push(`## ${review.date} (${review.dayName})`);
  lines.push("");
  lines.push(`**Change:** ${review.changePercent >= 0 ? "+" : ""}${review.changePercent.toFixed(2)}% | **Range:** ${review.rangePercent.toFixed(2)}% | **Size:** ${review.tradingSize}`);
  lines.push("");

  // Stats
  const s = review.stats;
  lines.push(`### Stats`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Trades | ${s.totalTrades} |`);
  lines.push(`| Win Rate | ${s.winRate.toFixed(1)}% |`);
  lines.push(`| Total P&L | $${s.totalPnl.toFixed(2)} |`);
  lines.push(`| Avg Win | $${s.avgWin.toFixed(2)} |`);
  lines.push(`| Avg Loss | $${s.avgLoss.toFixed(2)} |`);
  lines.push(`| Profit Factor | ${s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)} |`);
  lines.push(`| Winners | ${s.winners} |`);
  lines.push(`| Losers | ${s.losers} |`);
  lines.push("");

  // Trade groups
  lines.push(`### Trade Reviews`);
  lines.push("");
  review.tradeGroups.forEach((g, i) => {
    lines.push(`#### Trade Group ${i + 1} — Exit @ ${g.exitPrice.toFixed(1)}`);
    lines.push("");
    lines.push(`- **Rating:** ${"★".repeat(g.rating)}${"☆".repeat(5 - g.rating)}`);
    const allTags = [...g.tags, ...g.customTags];
    if (allTags.length > 0) lines.push(`- **Tags:** ${allTags.join(", ")}`);
    if (g.idea) lines.push(`- **Idea:** ${g.idea}`);
    if (g.coherent) lines.push(`- **Coherent with plan:** ${g.coherent}`);
    if (g.executionNotes) lines.push(`- **Execution:** ${g.executionNotes}`);
    lines.push("");
    lines.push(`| Direction | Entry | Exit | P&L | Reason |`);
    lines.push(`|-----------|-------|------|-----|--------|`);
    g.trades.forEach((t) => {
      lines.push(`| ${t.direction} | ${t.entryPrice.toFixed(1)} | ${t.exitPrice.toFixed(1)} | $${t.pnlPoints.toFixed(2)} | ${t.exitReason} |`);
    });
    lines.push("");
  });

  // Day summary
  lines.push(`### Day Summary`);
  lines.push(`- **Day Rating:** ${"★".repeat(review.dayRating)}${"☆".repeat(5 - review.dayRating)}`);
  if (review.dayNotes) lines.push(`- **Notes:** ${review.dayNotes}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// POST — save a day review
export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const body = await req.json();
    const { userId, review } = body as { userId: string; review: DayReview };

    if (!userId || !review) {
      return NextResponse.json({ error: "Missing userId or review" }, { status: 400 });
    }

    const safeId = sanitizeId(userId);
    const md = dayReviewToMarkdown(review);

    // Write individual day file
    const dayFile = path.join(DATA_DIR, `${safeId}_${review.date}.md`);
    fs.writeFileSync(dayFile, `# Day Review: ${review.date}\n\n${md}`, "utf-8");

    // Append to cumulative journal
    const journalFile = path.join(DATA_DIR, `${safeId}_journal.md`);
    const header = fs.existsSync(journalFile) ? "" : `# Trading Journal — ${safeId}\n\n`;
    fs.appendFileSync(journalFile, `${header}${md}`, "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Feedback save error:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// GET — retrieve journal by userId
export async function GET(req: NextRequest) {
  try {
    ensureDir();
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const safeId = sanitizeId(userId);
    const journalFile = path.join(DATA_DIR, `${safeId}_journal.md`);

    if (!fs.existsSync(journalFile)) {
      return NextResponse.json({ error: "No journal found" }, { status: 404 });
    }

    const content = fs.readFileSync(journalFile, "utf-8");
    return NextResponse.json({ journal: content });
  } catch (err) {
    console.error("Feedback read error:", err);
    return NextResponse.json({ error: "Failed to read" }, { status: 500 });
  }
}
