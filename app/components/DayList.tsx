"use client";

import { useEffect, useRef } from "react";
import { TradingDay } from "@/lib/types";

interface Props {
  days: TradingDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

export default function DayList({ days, selectedDate, onSelect }: Props) {
  const selectedRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedDate]);

  if (days.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
        No days match your filters
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--surface-2)] border-b border-[var(--border)] z-10">
            <tr>
              <th className="text-left px-1.5 py-1 text-[var(--text-dim)] font-medium">Date</th>
              <th className="text-center px-0.5 py-1 text-[var(--text-dim)] font-medium w-5">D</th>
              <th className="text-center px-0.5 py-1 text-[var(--text-dim)] font-medium w-5">P</th>
              <th className="text-right px-1 py-1 text-[var(--text-dim)] font-medium">Gap</th>
              <th className="text-right px-1 py-1 text-[var(--text-dim)] font-medium">Chg</th>
              <th className="text-right px-1 py-1 text-[var(--text-dim)] font-medium">Rng</th>
              <th className="text-right px-1.5 py-1 text-[var(--text-dim)] font-medium w-12">Cl</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const isSelected = selectedDate === day.date;
              return (
                <tr
                  key={day.date}
                  ref={isSelected ? selectedRef : undefined}
                  onClick={() => onSelect(day.date)}
                  className={`cursor-pointer border-b border-[var(--border)] transition-all duration-100 ${
                    isSelected
                      ? "bg-[var(--accent-dim)]/15 border-l-2 border-l-[var(--accent)]"
                      : "hover:bg-[var(--surface-hover)] border-l-2 border-l-transparent"
                  }`}
                >
                  <td className="px-1.5 py-0.5 font-mono text-[var(--text-muted)]">
                    {day.date.slice(5)} <span className="text-[var(--text-dim)]">{day.dayName.slice(0, 2)}</span>
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    <DirDot dir={day.changePercent > 0 ? "bull" : "bear"} />
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    {day.prevDayDirection ? (
                      <DirDot dir={day.prevDayDirection === "bullish" ? "bull" : "bear"} />
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                  <td className={`px-1 py-0.5 text-right font-mono ${
                    day.gapPercent === null ? "text-[var(--text-dim)]" :
                    day.gapPercent > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}>
                    {day.gapPercent !== null ? `${day.gapPercent > 0 ? "+" : ""}${day.gapPercent.toFixed(2)}` : "—"}
                  </td>
                  <td className={`px-1 py-0.5 text-right font-mono font-medium ${
                    day.changePercent > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}>
                    {day.changePercent > 0 ? "+" : ""}{day.changePercent.toFixed(2)}
                  </td>
                  <td className="px-1 py-0.5 text-right font-mono text-[var(--text-muted)]">
                    {day.rangePercent.toFixed(2)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[var(--text-dim)]">
                    {day.close.toFixed(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DirDot({ dir }: { dir: "bull" | "bear" }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        dir === "bull" ? "bg-[var(--green)]" : "bg-[var(--red)]"
      }`}
    />
  );
}
