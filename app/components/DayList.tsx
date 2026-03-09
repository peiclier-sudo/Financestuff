"use client";

import { TradingDay } from "@/lib/types";

interface Props {
  days: TradingDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

export default function DayList({ days, selectedDate, onSelect }: Props) {
  if (days.length === 0) {
    return (
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-8 text-center text-[#888]">
        No days match your filter criteria. Try adjusting the filters.
      </div>
    );
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg overflow-hidden">
      <div className="max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className="text-left px-3 py-2 text-[#888] font-medium">Date</th>
              <th className="text-left px-3 py-2 text-[#888] font-medium">Day</th>
              <th className="text-right px-3 py-2 text-[#888] font-medium">Open</th>
              <th className="text-right px-3 py-2 text-[#888] font-medium">Close</th>
              <th className="text-right px-3 py-2 text-[#888] font-medium">Gap %</th>
              <th className="text-right px-3 py-2 text-[#888] font-medium">Change %</th>
              <th className="text-right px-3 py-2 text-[#888] font-medium">Range %</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr
                key={day.date}
                onClick={() => onSelect(day.date)}
                className={`cursor-pointer border-b border-[#1e1e1e] transition-colors ${
                  selectedDate === day.date
                    ? "bg-[#1a2332]"
                    : "hover:bg-[#1a1a1a]"
                }`}
              >
                <td className="px-3 py-2 font-mono">{day.date}</td>
                <td className="px-3 py-2">{day.dayName.slice(0, 3)}</td>
                <td className="px-3 py-2 text-right font-mono">{day.open.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono">{day.close.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right font-mono ${
                  day.gapPercent === null ? "text-[#888]" :
                  day.gapPercent > 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}>
                  {day.gapPercent !== null ? `${day.gapPercent > 0 ? "+" : ""}${day.gapPercent.toFixed(2)}%` : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${
                  day.changePercent > 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}>
                  {day.changePercent > 0 ? "+" : ""}{day.changePercent.toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {day.rangePercent.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
