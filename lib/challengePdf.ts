import { jsPDF } from "jspdf";
import { ChallengeReview } from "./challengeTypes";
import { TradeGroupReview } from "./reviewTypes";

// ── Color palette ──
const BG = "#0d1117";
const SURFACE = "#161b22";
const BORDER = "#2a2f38";
const WHITE = "#ffffff";
const TEXT = "#e6edf3";
const TEXT_DIM = "#8b949e";
const GREY = "#6e7681";
const GREEN = "#3fb950";
const RED = "#f85149";

export function generateChallengePdf(review: ChallengeReview): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const mg = 16;
  const usable = W - mg * 2;
  let y = 0;

  // ── Helpers ──
  const paintBg = () => {
    doc.setFillColor(BG);
    doc.rect(0, 0, W, H, "F");
  };

  const newPage = () => {
    doc.addPage();
    paintBg();
    drawPageFooter();
    y = mg;
  };

  const need = (h: number) => { if (y + h > H - 14) newPage(); };

  const drawLine = (yy: number, color = BORDER) => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.15);
    doc.line(mg, yy, W - mg, yy);
  };

  const drawCard = (x: number, cy: number, w: number, h: number) => {
    doc.setFillColor(SURFACE);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.15);
    doc.roundedRect(x, cy, w, h, 1.5, 1.5, "FD");
  };

  let pageNum = 0;
  const drawPageFooter = () => {
    pageNum++;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(GREY);
    doc.text(`Challenge ${review.challenge.target} Report`, mg, H - 6);
    doc.text(`Page ${pageNum}`, W - mg, H - 6, { align: "right" });
  };

  const sectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(TEXT_DIM);
    doc.text(title.toUpperCase(), mg, y);
    y += 5;
  };

  const stats = review.stats;
  const trades = review.challenge.allTrades;
  const dateStr = new Date(review.challenge.startedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // ════════════════════════════════════════════
  // PAGE 1: Cover + Stats + Charts
  // ════════════════════════════════════════════

  paintBg();
  drawPageFooter();

  // ── Top accent line ──
  doc.setFillColor(WHITE);
  doc.rect(mg, mg, usable, 0.4, "F");
  y = mg + 6;

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(WHITE);
  doc.text(`CHALLENGE ${review.challenge.target}`, mg, y + 8);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(TEXT_DIM);
  doc.text(`${stats.daysPlayed} days  ·  ${stats.totalExits} exits  ·  ${stats.totalTrades} trades`, mg, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(GREY);
  doc.text(dateStr, mg, y);
  y += 10;

  drawLine(y);
  y += 8;

  // ── Stats grid (2 rows of 5) ──
  sectionTitle("Performance");

  const statItems = [
    { label: "Total P&L", value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? GREEN : RED },
    { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, color: WHITE },
    { label: "Profit Factor", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: WHITE },
    { label: "Avg Win", value: `$${stats.avgWin.toFixed(2)}`, color: GREEN },
    { label: "Avg Loss", value: `$${stats.avgLoss.toFixed(2)}`, color: RED },
    { label: "Best Trade", value: `$${stats.bestTrade.toFixed(2)}`, color: GREEN },
    { label: "Worst Trade", value: `$${stats.worstTrade.toFixed(2)}`, color: RED },
    { label: "Max Drawdown", value: `$${stats.maxDrawdown.toFixed(2)}`, color: RED },
    { label: "Max Runup", value: `$${stats.maxRunup.toFixed(2)}`, color: GREEN },
    { label: "Avg P&L", value: `$${stats.avgPnl.toFixed(2)}`, color: stats.avgPnl >= 0 ? GREEN : RED },
  ];

  const cardCols = 5;
  const cardGap = 2.5;
  const cardW = (usable - cardGap * (cardCols - 1)) / cardCols;
  const cardH = 16;

  statItems.forEach((s, i) => {
    const col = i % cardCols;
    const row = Math.floor(i / cardCols);
    const cx = mg + col * (cardW + cardGap);
    const cy = y + row * (cardH + cardGap);

    drawCard(cx, cy, cardW, cardH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(GREY);
    doc.text(s.label.toUpperCase(), cx + cardW / 2, cy + 5.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(s.color);
    doc.text(s.value, cx + cardW / 2, cy + 11.5, { align: "center" });
  });
  y += Math.ceil(statItems.length / cardCols) * (cardH + cardGap) + 6;

  // ── Overall rating ──
  drawLine(y);
  y += 6;
  sectionTitle("Overall Rating");

  const starsFilled = review.overallRating;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.setTextColor(WHITE);
  doc.text("★".repeat(starsFilled), mg, y + 1);
  doc.setTextColor("#2a2f38");
  doc.text("★".repeat(5 - starsFilled), mg + starsFilled * 6.5, y + 1);
  y += 7;

  if (review.overallNotes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(TEXT);
    const noteLines = doc.splitTextToSize(review.overallNotes, usable);
    drawCard(mg, y, usable, noteLines.length * 4 + 6);
    doc.setTextColor(TEXT);
    doc.text(noteLines, mg + 4, y + 5);
    y += noteLines.length * 4 + 10;
  }
  y += 4;

  // ── Equity Curve ──
  drawLine(y);
  y += 6;
  sectionTitle("Equity Curve");

  const chartH = 40;
  drawCard(mg, y, usable, chartH);

  const equityPts: number[] = [0];
  let eqVal = 0;
  for (const t of trades) { eqVal += t.pnlPoints; equityPts.push(eqVal); }
  const eqMin = Math.min(...equityPts);
  const eqMax = Math.max(...equityPts);
  const eqRange = eqMax - eqMin || 1;

  const chartLeft = mg + 3;
  const chartRight = mg + usable - 3;
  const chartTop = y + 4;
  const chartBot = y + chartH - 4;
  const chartInnerW = chartRight - chartLeft;
  const chartInnerH = chartBot - chartTop;

  // Zero line
  const zeroChartY = chartBot - ((0 - eqMin) / eqRange) * chartInnerH;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.1);
  doc.line(chartLeft, zeroChartY, chartRight, zeroChartY);

  // Axis labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(GREY);
  doc.text(`$${eqMax.toFixed(0)}`, chartLeft - 1, chartTop + 2, { align: "right" });
  doc.text(`$${eqMin.toFixed(0)}`, chartLeft - 1, chartBot, { align: "right" });
  doc.text("$0", chartLeft - 1, zeroChartY + 1, { align: "right" });

  // Gradient fill under curve (approximate with rectangles)
  for (let i = 1; i < equityPts.length; i++) {
    const x1 = chartLeft + ((i - 1) / (equityPts.length - 1)) * chartInnerW;
    const x2 = chartLeft + (i / (equityPts.length - 1)) * chartInnerW;
    const cy1 = chartBot - ((equityPts[i - 1] - eqMin) / eqRange) * chartInnerH;
    const cy2 = chartBot - ((equityPts[i] - eqMin) / eqRange) * chartInnerH;
    const topY = Math.min(cy1, cy2);

    // Subtle fill from curve to zero
    const fillAlpha = equityPts[i] >= 0 ? GREEN : RED;
    doc.setFillColor(fillAlpha);
    doc.setGState(doc.GState({ opacity: 0.08 }));
    doc.rect(x1, topY, x2 - x1, zeroChartY - topY, "F");
    doc.setGState(doc.GState({ opacity: 1 }));
  }

  // Draw equity line
  doc.setDrawColor(WHITE);
  doc.setLineWidth(0.6);
  for (let i = 1; i < equityPts.length; i++) {
    const x1 = chartLeft + ((i - 1) / (equityPts.length - 1)) * chartInnerW;
    const x2 = chartLeft + (i / (equityPts.length - 1)) * chartInnerW;
    const cy1 = chartBot - ((equityPts[i - 1] - eqMin) / eqRange) * chartInnerH;
    const cy2 = chartBot - ((equityPts[i] - eqMin) / eqRange) * chartInnerH;
    doc.line(x1, cy1, x2, cy2);
  }

  // End value dot
  if (equityPts.length > 1) {
    const lastX = chartRight;
    const lastY = chartBot - ((equityPts[equityPts.length - 1] - eqMin) / eqRange) * chartInnerH;
    doc.setFillColor(eqVal >= 0 ? GREEN : RED);
    doc.circle(lastX, lastY, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(eqVal >= 0 ? GREEN : RED);
    doc.text(`$${eqVal.toFixed(1)}`, lastX - 2, lastY - 2, { align: "right" });
  }

  y += chartH + 6;

  // ── Trade-by-trade P&L bars ──
  drawLine(y);
  y += 6;
  sectionTitle("Trade-by-Trade P&L");

  const barCardH = 35;
  drawCard(mg, y, usable, barCardH);

  const barLeft = mg + 3;
  const barRight = mg + usable - 3;
  const barTop = y + 4;
  const barBot = y + barCardH - 4;
  const barInnerW = barRight - barLeft;
  const barInnerH = barBot - barTop;
  const barZeroY2 = barTop + barInnerH / 2;

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.1);
  doc.line(barLeft, barZeroY2, barRight, barZeroY2);

  const maxAbsPnl = Math.max(...trades.map((t) => Math.abs(t.pnlPoints)), 0.01);
  const barW = Math.min(barInnerW / trades.length, 6);
  const totalBarsW = barW * trades.length;
  const barOffset = barLeft + (barInnerW - totalBarsW) / 2;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const bh = (Math.abs(t.pnlPoints) / maxAbsPnl) * (barInnerH / 2 - 2);
    const bx = barOffset + i * barW + barW * 0.15;
    const bw = barW * 0.7;

    doc.setFillColor(t.pnlPoints >= 0 ? GREEN : RED);
    if (t.pnlPoints >= 0) {
      doc.rect(bx, barZeroY2 - bh, bw, bh, "F");
    } else {
      doc.rect(bx, barZeroY2, bw, bh, "F");
    }
  }

  // Bar axis labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(GREY);
  doc.text("1", barOffset, barBot + 3);
  doc.text(`${trades.length}`, barOffset + totalBarsW, barBot + 3, { align: "right" });

  y += barCardH + 6;

  // ════════════════════════════════════════════
  // PAGE 2+: Trade Reviews
  // ════════════════════════════════════════════

  newPage();

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(WHITE);
  doc.text("TRADE REVIEWS", mg, y + 5);
  y += 12;
  doc.setFontSize(8);
  doc.setTextColor(TEXT_DIM);
  doc.text(`${review.tradeGroupReviews.length} trade groups reviewed`, mg, y);
  y += 8;

  drawLine(y, WHITE);
  y += 8;

  review.tradeGroupReviews.forEach((g: TradeGroupReview, i: number) => {
    // Estimate height needed for this trade card
    const hasNotes = !!(g.idea || g.coherent || g.executionNotes);
    const allTags = [...g.tags, ...g.customTags];
    const noteHeight = [g.idea, g.coherent, g.executionNotes]
      .filter(Boolean)
      .reduce((h, text) => h + doc.splitTextToSize(text!, usable - 22).length * 3.5 + 5, 0);
    const cardEstimate = 20 + g.trades.length * 5 + (allTags.length > 0 ? 6 : 0) + (hasNotes ? noteHeight + 2 : 0);

    need(cardEstimate + 4);

    const groupPnl = g.trades.reduce((s, t) => s + t.pnlPoints, 0);
    const cardStart = y;

    // ── Trade number + P&L header ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(WHITE);
    doc.text(`Trade ${i + 1}`, mg, y + 1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(groupPnl >= 0 ? GREEN : RED);
    doc.text(`${groupPnl >= 0 ? "+" : ""}$${groupPnl.toFixed(2)}`, mg + 28, y + 1);

    // Rating
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(WHITE);
    const filledStars = "★".repeat(g.rating);
    doc.text(filledStars, W - mg, y + 1, { align: "right" });
    doc.setTextColor(BORDER);
    doc.text("★".repeat(5 - g.rating), W - mg - g.rating * 4.2, y + 1, { align: "right" });
    y += 7;

    // Tags row
    if (allTags.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(TEXT_DIM);

      let tagX = mg;
      allTags.forEach((tag) => {
        const tw = doc.getTextWidth(tag) + 4;
        if (tagX + tw > W - mg) { y += 4.5; tagX = mg; }
        // Tag pill background
        doc.setFillColor(SURFACE);
        doc.setDrawColor(BORDER);
        doc.setLineWidth(0.1);
        doc.roundedRect(tagX, y - 2.5, tw, 4, 1, 1, "FD");
        doc.setTextColor(TEXT_DIM);
        doc.text(tag, tagX + 2, y);
        tagX += tw + 1.5;
      });
      y += 5;
    }

    // Entries table
    // Header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(GREY);
    doc.text("DIR", mg + 2, y);
    doc.text("ENTRY", mg + 22, y);
    doc.text("EXIT", mg + 42, y);
    doc.text("P&L", mg + 62, y);
    doc.text("REASON", mg + 85, y);
    y += 2;
    drawLine(y, BORDER);
    y += 3;

    g.trades.forEach((t) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);

      doc.setTextColor(t.direction === "long" ? GREEN : RED);
      doc.text(t.direction === "long" ? "LONG" : "SHORT", mg + 2, y);

      doc.setTextColor(TEXT);
      doc.text(t.entryPrice.toFixed(1), mg + 22, y);
      doc.text(t.exitPrice.toFixed(1), mg + 42, y);

      doc.setTextColor(t.pnlPoints >= 0 ? GREEN : RED);
      doc.text(`${t.pnlPoints >= 0 ? "+" : ""}$${t.pnlPoints.toFixed(2)}`, mg + 62, y);

      doc.setTextColor(GREY);
      doc.text(t.exitReason.toUpperCase(), mg + 85, y);
      y += 4.5;
    });
    y += 2;

    // Notes section
    const noteEntries = [
      { label: "IDEA", text: g.idea },
      { label: "PLAN", text: g.coherent },
      { label: "EXEC", text: g.executionNotes },
    ].filter((n) => n.text);

    if (noteEntries.length > 0) {
      noteEntries.forEach((n) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(GREY);
        doc.text(n.label, mg + 2, y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(TEXT);
        const noteLines = doc.splitTextToSize(n.text!, usable - 22);
        doc.text(noteLines, mg + 16, y);
        y += noteLines.length * 3.5 + 2;
      });
    }

    y += 2;

    // Card border around the whole trade
    const cardHeight = y - cardStart + 2;
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.15);
    doc.roundedRect(mg - 1, cardStart - 4, usable + 2, cardHeight + 2, 1.5, 1.5, "D");

    y += 6;
  });

  // ── Final page footer ──
  need(20);
  y += 4;
  drawLine(y, GREY);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(GREY);
  doc.text("Generated by Backtest Challenge System", W / 2, y, { align: "center" });

  // Save
  const fileName = `challenge_${review.challenge.target}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
