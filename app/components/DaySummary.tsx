"use client";

import { TradingDay } from "@/lib/types";

interface Props {
  days: TradingDay[];
}

export default function DaySummary({ days }: Props) {
  if (days.length === 0) return null;

  // Single day mode
  if (days.length === 1) {
    const day = days[0];
    const isBull = day.changePercent > 0;
    return (
      <div className="glass-panel-sm overflow-hidden fade-in">
        <div className="px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex items-center justify-between">
          <h3 className="text-[10px] font-medium text-[var(--text-dim)]">Day Summary</h3>
          <span className={`text-[10px] font-mono font-semibold ${isBull ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
            {isBull ? "BULL" : "BEAR"} {day.changePercent > 0 ? "+" : ""}{day.changePercent.toFixed(2)}%
          </span>
        </div>
        <div className="px-2 py-1.5 grid gap-x-3 gap-y-0.5 text-[10px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))" }}>
          <M l="O" v={day.open.toFixed(2)} />
          <M l="H" v={day.high.toFixed(2)} />
          <M l="L" v={day.low.toFixed(2)} />
          <M l="C" v={day.close.toFixed(2)} />
          <M l="Gap" v={day.gapPercent !== null ? `${day.gapPercent > 0 ? "+" : ""}${day.gapPercent.toFixed(2)}%` : "—"}
            c={day.gapPercent === null ? undefined : day.gapPercent > 0 ? "g" : "r"} />
          <M l="Rng" v={`${day.rangePercent.toFixed(2)}%`} />
          <M l="Body" v={`${day.bodyPercent.toFixed(2)}%`} />
          <M l="CLoc" v={`${(day.closeLocation * 100).toFixed(0)}%`}
            c={day.closeLocation > 0.6 ? "g" : day.closeLocation < 0.4 ? "r" : undefined} />
          <M l="PrCl" v={day.prevClose !== null ? day.prevClose.toFixed(2) : "—"} />
          <M l="PrDir" v={day.prevDayDirection ? day.prevDayDirection.slice(0, 4) : "—"}
            c={day.prevDayDirection === "bullish" ? "g" : day.prevDayDirection === "bearish" ? "r" : undefined} />
          <M l="PrChg" v={day.prevDayChangePercent !== null ? `${day.prevDayChangePercent > 0 ? "+" : ""}${day.prevDayChangePercent.toFixed(2)}%` : "—"}
            c={day.prevDayChangePercent === null ? undefined : day.prevDayChangePercent > 0 ? "g" : "r"} />
          <M l="Bars" v={String(day.bars.length)} />
        </div>
      </div>
    );
  }

  // Multi-day aggregate mode
  const n = days.length;
  const avgChange = days.reduce((s, d) => s + d.changePercent, 0) / n;
  const avgRange = days.reduce((s, d) => s + d.rangePercent, 0) / n;
  const avgGap = days.filter(d => d.gapPercent !== null).length > 0
    ? days.filter(d => d.gapPercent !== null).reduce((s, d) => s + d.gapPercent!, 0) / days.filter(d => d.gapPercent !== null).length
    : null;
  const avgCLoc = days.reduce((s, d) => s + d.closeLocation, 0) / n;
  const bullish = days.filter(d => d.changePercent > 0).length;
  const highOfAll = Math.max(...days.map(d => d.high));
  const lowOfAll = Math.min(...days.map(d => d.low));
  const maxChg = Math.max(...days.map(d => d.changePercent));
  const minChg = Math.min(...days.map(d => d.changePercent));

  return (
    <div className="glass-panel-sm overflow-hidden fade-in">
      <div className="px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex items-center justify-between">
        <h3 className="text-[10px] font-medium text-[var(--text-dim)]">
          Range Summary ({n} days)
        </h3>
        <span className={`text-[10px] font-mono font-semibold ${avgChange >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          Avg {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
        </span>
      </div>
      <div className="px-2 py-1.5 grid gap-x-3 gap-y-0.5 text-[10px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))" }}>
        <M l="Bull" v={`${bullish}/${n}`} c={bullish > n / 2 ? "g" : "r"} />
        <M l="Win%" v={`${((bullish / n) * 100).toFixed(0)}%`} c={bullish > n / 2 ? "g" : "r"} />
        <M l="AvgRng" v={`${avgRange.toFixed(2)}%`} />
        <M l="AvgCLoc" v={`${(avgCLoc * 100).toFixed(0)}%`}
          c={avgCLoc > 0.6 ? "g" : avgCLoc < 0.4 ? "r" : undefined} />
        <M l="High" v={highOfAll.toFixed(2)} />
        <M l="Low" v={lowOfAll.toFixed(2)} />
        <M l="MaxChg" v={`+${maxChg.toFixed(2)}%`} c="g" />
        <M l="MinChg" v={`${minChg.toFixed(2)}%`} c="r" />
        <M l="AvgGap" v={avgGap !== null ? `${avgGap >= 0 ? "+" : ""}${avgGap.toFixed(2)}%` : "—"}
          c={avgGap === null ? undefined : avgGap >= 0 ? "g" : "r"} />
        <M l="Spread" v={`${(highOfAll - lowOfAll).toFixed(2)}`} />
        <M l="From" v={days[0].date.slice(5)} />
        <M l="To" v={days[days.length - 1].date.slice(5)} />
      </div>
    </div>
  );
}

function M({ l, v, c }: { l: string; v: string; c?: "g" | "r" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-dim)] text-[9px] uppercase">{l}</span>
      <span className={`font-[JetBrains_Mono,monospace] text-[10px] ${c === "g" ? "text-[var(--green)]" : c === "r" ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}>{v}</span>
    </div>
  );
}
