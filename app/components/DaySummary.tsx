"use client";

import { TradingDay } from "@/lib/types";

interface Props {
  day: TradingDay;
}

export default function DaySummary({ day }: Props) {
  const isBull = day.changePercent > 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-2 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
        <h3 className="text-[10px] font-medium text-[var(--text-dim)]">Day Summary</h3>
        <span className={`text-[10px] font-mono font-semibold ${isBull ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {isBull ? "BULL" : "BEAR"} {day.changePercent > 0 ? "+" : ""}{day.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="px-2 py-1.5 grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]">
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

function M({ l, v, c }: { l: string; v: string; c?: "g" | "r" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-dim)]">{l}</span>
      <span className={`font-mono ${c === "g" ? "text-[var(--green)]" : c === "r" ? "text-[var(--red)]" : ""}`}>{v}</span>
    </div>
  );
}
