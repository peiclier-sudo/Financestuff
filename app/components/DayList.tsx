"use client";

import { useEffect, useRef } from "react";
import { TradingDay } from "@/lib/types";

interface Props {
  days: TradingDay[];
  selectedDates: string[];
  onSelect: (date: string, ctrlKey: boolean) => void;
}

export default function DayList({ days, selectedDates, onSelect }: Props) {
  const selectedRef = useRef<HTMLTableRowElement>(null);
  const primaryDate = selectedDates.length > 0 ? selectedDates[selectedDates.length - 1] : null;

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [primaryDate]);

  if (days.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
        No days match your filters
      </div>
    );
  }

  const selectedSet = new Set(selectedDates);
  const multiSelected = selectedDates.length > 1;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {multiSelected && (
        <div className="px-1.5 py-0.5 bg-[var(--accent-dim)]/10 border-b border-[var(--border)] text-[9px] text-[var(--accent)] flex items-center justify-between flex-shrink-0">
          <span>{selectedDates.length} days selected — Ctrl+click to toggle</span>
          <button
            onClick={() => onSelect(primaryDate!, false)}
            className="text-[var(--text-dim)] hover:text-[var(--text)] underline"
          >
            Clear
          </button>
        </div>
      )}
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
              const isPrimary = primaryDate === day.date;
              const isSecondary = !isPrimary && selectedSet.has(day.date);
              return (
                <tr
                  key={day.date}
                  ref={isPrimary ? selectedRef : undefined}
                  onMouseDown={(e) => {
                    // Use mousedown instead of click so Ctrl is reliably detected
                    // before browser intercepts Ctrl+click (context menu in iframe, etc.)
                    if (e.button !== 0) return; // only left click
                    e.preventDefault();
                    onSelect(day.date, e.ctrlKey || e.metaKey);
                  }}
                  className={`cursor-pointer border-b border-[var(--border)] transition-all duration-100 ${
                    isPrimary
                      ? "bg-[var(--accent-dim)]/15 border-l-2 border-l-[var(--accent)]"
                      : isSecondary
                        ? "bg-[#58a6ff10] border-l-2 border-l-[#58a6ff60]"
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
