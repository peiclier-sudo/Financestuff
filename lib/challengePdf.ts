import { jsPDF } from "jspdf";
import { ChallengeReview } from "./challengeTypes";
import { TradeGroupReview } from "./reviewTypes";

export function generateChallengePdf(review: ChallengeReview): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 15;
  const usable = W - margin * 2;
  let y = margin;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkPage = (needed: number) => { if (y + needed > 280) addPage(); };

  // Colors
  const black = "#0d1117";
  const white = "#ffffff";
  const grey = "#7d8590";
  const green = "#3fb950";
  const red = "#f85149";
  const lightGrey = "#c0c0c0";

  // Background
  doc.setFillColor(black);
  doc.rect(0, 0, W, 297, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(white);
  doc.text(`CHALLENGE ${review.challenge.target}`, margin, y + 8);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(grey);
  doc.text(`${review.stats.daysPlayed} days | ${review.stats.totalExits} exits | ${review.stats.totalTrades} trades`, margin, y);
  const dateStr = new Date(review.challenge.startedAt).toLocaleDateString();
  doc.text(`Started: ${dateStr}`, W - margin, y, { align: "right" });
  y += 10;

  // Divider
  doc.setDrawColor(grey);
  doc.setLineWidth(0.2);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // Stats grid
  const stats = review.stats;
  const statItems = [
    { label: "Total P&L", value: `$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? green : red },
    { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, color: white },
    { label: "Profit Factor", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: white },
    { label: "Avg Win", value: `$${stats.avgWin.toFixed(2)}`, color: green },
    { label: "Avg Loss", value: `$${stats.avgLoss.toFixed(2)}`, color: red },
    { label: "Best Trade", value: `$${stats.bestTrade.toFixed(2)}`, color: green },
    { label: "Worst Trade", value: `$${stats.worstTrade.toFixed(2)}`, color: red },
    { label: "Max Drawdown", value: `$${stats.maxDrawdown.toFixed(2)}`, color: red },
    { label: "Max Runup", value: `$${stats.maxRunup.toFixed(2)}`, color: green },
    { label: "Avg P&L", value: `$${stats.avgPnl.toFixed(2)}`, color: stats.avgPnl >= 0 ? green : red },
  ];

  const cols = 3;
  const colW = usable / cols;
  statItems.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * colW;
    const sy = y + row * 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(grey);
    doc.text(s.label.toUpperCase(), x, sy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(s.color);
    doc.text(s.value, x, sy + 5);
  });
  y += Math.ceil(statItems.length / cols) * 12 + 5;

  // Overall rating
  checkPage(15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(grey);
  doc.text("OVERALL RATING", margin, y);
  y += 5;
  doc.setFontSize(14);
  doc.setTextColor(white);
  const stars = "★".repeat(review.overallRating) + "☆".repeat(5 - review.overallRating);
  doc.text(stars, margin, y);
  y += 4;
  if (review.overallNotes) {
    doc.setFontSize(8);
    doc.setTextColor(lightGrey);
    const lines = doc.splitTextToSize(review.overallNotes, usable);
    doc.text(lines, margin, y + 4);
    y += 4 + lines.length * 3.5;
  }
  y += 8;

  // Equity curve
  checkPage(55);
  doc.setDrawColor(grey);
  doc.setLineWidth(0.2);
  doc.line(margin, y, W - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(white);
  doc.text("EQUITY CURVE", margin, y);
  y += 6;

  const chartH = 35;
  const chartW = usable;
  const trades = review.challenge.allTrades;

  // Compute equity points
  const equityPts: number[] = [0];
  let eq = 0;
  for (const t of trades) {
    eq += t.pnlPoints;
    equityPts.push(eq);
  }
  const eqMin = Math.min(...equityPts);
  const eqMax = Math.max(...equityPts);
  const eqRange = eqMax - eqMin || 1;

  // Draw zero line
  const zeroY = y + chartH - ((0 - eqMin) / eqRange) * chartH;
  doc.setDrawColor("#333333");
  doc.setLineWidth(0.1);
  doc.line(margin, zeroY, margin + chartW, zeroY);

  // Draw equity line
  doc.setDrawColor(white);
  doc.setLineWidth(0.5);
  for (let i = 1; i < equityPts.length; i++) {
    const x1 = margin + ((i - 1) / (equityPts.length - 1)) * chartW;
    const x2 = margin + (i / (equityPts.length - 1)) * chartW;
    const y1 = y + chartH - ((equityPts[i - 1] - eqMin) / eqRange) * chartH;
    const y2 = y + chartH - ((equityPts[i] - eqMin) / eqRange) * chartH;
    doc.line(x1, y1, x2, y2);
  }
  y += chartH + 8;

  // Trade-by-trade bars
  checkPage(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(white);
  doc.text("TRADE-BY-TRADE P&L", margin, y);
  y += 6;

  const barChartH = 30;
  const maxAbsPnl = Math.max(...trades.map((t) => Math.abs(t.pnlPoints)), 0.01);
  const barW = Math.min(chartW / trades.length, 8);
  const barsStart = margin;
  const barZeroY = y + barChartH / 2;

  // Zero line
  doc.setDrawColor("#333333");
  doc.setLineWidth(0.1);
  doc.line(barsStart, barZeroY, barsStart + chartW, barZeroY);

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const barH = (Math.abs(t.pnlPoints) / maxAbsPnl) * (barChartH / 2 - 1);
    const x = barsStart + i * barW + barW * 0.15;
    const w = barW * 0.7;

    if (t.pnlPoints >= 0) {
      doc.setFillColor(green);
      doc.rect(x, barZeroY - barH, w, barH, "F");
    } else {
      doc.setFillColor(red);
      doc.rect(x, barZeroY, w, barH, "F");
    }
  }
  y += barChartH + 10;

  // Trade reviews
  addPage();
  doc.setFillColor(black);
  doc.rect(0, 0, W, 297, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(white);
  doc.text("TRADE REVIEWS", margin, y + 6);
  y += 14;

  review.tradeGroupReviews.forEach((g: TradeGroupReview, i: number) => {
    checkPage(45);
    if (y > margin + 5) {
      // Add background for new pages
      if (y === margin) {
        doc.setFillColor(black);
        doc.rect(0, 0, W, 297, "F");
      }
    }

    const groupPnl = g.trades.reduce((s, t) => s + t.pnlPoints, 0);

    // Group header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(white);
    doc.text(`Trade ${i + 1}`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(groupPnl >= 0 ? green : red);
    doc.text(`${groupPnl >= 0 ? "+" : ""}$${groupPnl.toFixed(2)}`, margin + 25, y);

    // Rating
    doc.setTextColor(white);
    doc.text("★".repeat(g.rating) + "☆".repeat(5 - g.rating), W - margin, y, { align: "right" });
    y += 5;

    // Tags
    const allTags = [...g.tags, ...g.customTags];
    if (allTags.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(lightGrey);
      doc.text(allTags.join(" · "), margin, y);
      y += 4;
    }

    // Entries table
    g.trades.forEach((t) => {
      doc.setFontSize(7);
      doc.setTextColor(t.direction === "long" ? green : red);
      doc.text(t.direction.toUpperCase(), margin, y);
      doc.setTextColor(lightGrey);
      doc.text(`${t.entryPrice.toFixed(1)} → ${t.exitPrice.toFixed(1)}`, margin + 18, y);
      doc.setTextColor(t.pnlPoints >= 0 ? green : red);
      doc.text(`${t.pnlPoints >= 0 ? "+" : ""}$${t.pnlPoints.toFixed(2)}`, margin + 55, y);
      doc.setTextColor(grey);
      doc.text(t.exitReason.toUpperCase(), margin + 80, y);
      y += 3.5;
    });
    y += 2;

    // Notes
    if (g.idea) {
      doc.setFontSize(7);
      doc.setTextColor(grey);
      doc.text("Idea: ", margin, y);
      doc.setTextColor(lightGrey);
      const ideaLines = doc.splitTextToSize(g.idea, usable - 12);
      doc.text(ideaLines, margin + 12, y);
      y += ideaLines.length * 3.5;
    }
    if (g.coherent) {
      doc.setFontSize(7);
      doc.setTextColor(grey);
      doc.text("Plan: ", margin, y);
      doc.setTextColor(lightGrey);
      const planLines = doc.splitTextToSize(g.coherent, usable - 12);
      doc.text(planLines, margin + 12, y);
      y += planLines.length * 3.5;
    }
    if (g.executionNotes) {
      doc.setFontSize(7);
      doc.setTextColor(grey);
      doc.text("Exec: ", margin, y);
      doc.setTextColor(lightGrey);
      const execLines = doc.splitTextToSize(g.executionNotes, usable - 12);
      doc.text(execLines, margin + 12, y);
      y += execLines.length * 3.5;
    }

    y += 5;

    // Separator
    doc.setDrawColor("#222222");
    doc.setLineWidth(0.1);
    doc.line(margin, y, W - margin, y);
    y += 5;
  });

  // Save
  const fileName = `challenge_${review.challenge.target}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
