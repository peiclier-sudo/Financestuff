"use client";

import { TradingDay } from "@/lib/types";

interface Props {
  day: TradingDay;
}

export default function DaySummary({ day }: Props) {
  const isBull = day.changePercent > 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
        <h3 className="text-xs font-medium text-[var(--text-muted)]">Day Summary</h3>
        <span className={`stat-badge ${isBull ? "green" : "red"}`}>
          {isBull ? "BULL" : "BEAR"} {day.changePercent > 0 ? "+" : ""}{day.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="px-3 py-2 grid grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        <Metric label="Open" value={day.open.toFixed(2)} />
        <Metric label="High" value={day.high.toFixed(2)} />
        <Metric label="Low" value={day.low.toFixed(2)} />
        <Metric label="Close" value={day.close.toFixed(2)} />
        <Metric label="Gap" value={day.gapPercent !== null ? `${day.gapPercent > 0 ? "+" : ""}${day.gapPercent.toFixed(3)}%` : "—"}
          color={day.gapPercent === null ? undefined : day.gapPercent > 0 ? "green" : "red"} />
        <Metric label="Range" value={`${day.rangePercent.toFixed(3)}%`} />
        <Metric label="Body" value={`${day.bodyPercent.toFixed(3)}%`} />
        <Metric label="Close Loc" value={`${(day.closeLocation * 100).toFixed(0)}%`}
          color={day.closeLocation > 0.6 ? "green" : day.closeLocation < 0.4 ? "red" : undefined} />
        <Metric label="Prev Close" value={day.prevClose !== null ? day.prevClose.toFixed(2) : "—"} />
        <Metric label="Prev Dir" value={day.prevDayDirection ?? "—"}
          color={day.prevDayDirection === "bullish" ? "green" : day.prevDayDirection === "bearish" ? "red" : undefined} />
        <Metric label="Prev Chg" value={day.prevDayChangePercent !== null ? `${day.prevDayChangePercent > 0 ? "+" : ""}${day.prevDayChangePercent.toFixed(2)}%` : "—"}
          color={day.prevDayChangePercent === null ? undefined : day.prevDayChangePercent > 0 ? "green" : "red"} />
        <Metric label="Bars" value={String(day.bars.length)} />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const colorClass = color === "green" ? "text-[var(--green)]" : color === "red" ? "text-[var(--red)]" : "";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className={`font-mono ${colorClass}`}>{value}</span>
    </div>
  );
}
