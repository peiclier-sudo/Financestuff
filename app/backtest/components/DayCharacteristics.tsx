"use client";

import { DaySignatureStats } from "@/lib/backtestTypes";
import { TradingDay } from "@/lib/types";

interface Props {
  day: TradingDay;
  stats: DaySignatureStats;
}

export default function DayCharacteristics({ day, stats }: Props) {
  const gapDir = day.gapPercent !== null ? (day.gapPercent >= 0 ? "up" : "down") : null;
  const prevGapDir = day.prevDayGapPercent !== null ? (day.prevDayGapPercent >= 0 ? "up" : "down") : null;

  return (
    <div className="space-y-3 text-[11px]">
      {/* Day Characteristics */}
      <div>
        <h3 className="text-label mb-2">Day Parameters</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-2">
          <Param label="Day" value={day.dayName} />
          <Param
            label="Prev Direction"
            value={day.prevDayDirection === "bullish" ? "Bullish" : day.prevDayDirection === "bearish" ? "Bearish" : "N/A"}
            color={day.prevDayDirection === "bullish" ? "var(--green)" : day.prevDayDirection === "bearish" ? "var(--red)" : undefined}
          />
          <Param
            label="Prev Gap"
            value={prevGapDir ? `Gap ${prevGapDir === "up" ? "Up" : "Down"} ${day.prevDayGapPercent !== null ? Math.abs(day.prevDayGapPercent).toFixed(2) + "%" : ""}` : "N/A"}
            color={prevGapDir === "up" ? "var(--green)" : prevGapDir === "down" ? "var(--red)" : undefined}
          />
          <Param
            label="Today Gap"
            value={gapDir ? `Gap ${gapDir === "up" ? "Up" : "Down"} ${day.gapPercent !== null ? Math.abs(day.gapPercent).toFixed(2) + "%" : ""}` : "N/A"}
            color={gapDir === "up" ? "var(--green)" : gapDir === "down" ? "var(--red)" : undefined}
          />
        </div>
      </div>

      {/* Historical Stats */}
      <div>
        <h3 className="text-label mb-2">
          Historical Match <span style={{ color: "var(--text-secondary)" }}>({stats.sampleSize} days)</span>
        </h3>

        {stats.sampleSize === 0 ? (
          <p className="text-[var(--text-dim)] text-[10px]">No matching historical days found</p>
        ) : (
          <div className="space-y-2">
            {/* Bull vs Bear bar */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: "var(--green)" }}>{stats.bullishPct.toFixed(0)}% Bull</span>
                <span style={{ color: "var(--red)" }}>{stats.bearishPct.toFixed(0)}% Bear</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "var(--surface)" }}>
                <div
                  className="h-full rounded-l-full"
                  style={{ width: `${stats.bullishPct}%`, background: "var(--green)" }}
                />
                <div
                  className="h-full rounded-r-full"
                  style={{ width: `${stats.bearishPct}%`, background: "var(--red)" }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <StatRow label="Avg Close Loc" value={`${stats.avgCloseLocation.toFixed(0)}/100`} />
              <StatRow label="Med Close Loc" value={`${stats.medianCloseLocation.toFixed(0)}/100`} />
              <StatRow label="Avg Change" value={`${stats.avgChangePercent >= 0 ? "+" : ""}${stats.avgChangePercent.toFixed(2)}%`} color={stats.avgChangePercent >= 0 ? "var(--green)" : "var(--red)"} />
              <StatRow label="Med Change" value={`${stats.medianChangePercent >= 0 ? "+" : ""}${stats.medianChangePercent.toFixed(2)}%`} color={stats.medianChangePercent >= 0 ? "var(--green)" : "var(--red)"} />
              <StatRow label="Avg Range" value={`${stats.avgRangePercent.toFixed(2)}%`} />
              <StatRow label="Med Range" value={`${stats.medianRangePercent.toFixed(2)}%`} />
              <StatRow label="Gap Fill" value={`${stats.gapFillPct.toFixed(0)}%`} color="var(--text-secondary)" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Param({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span className="text-label" style={{ fontSize: "8px" }}>{label}</span>
      <div className="font-display font-semibold text-[11px]" style={{ color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-dim)] text-[10px]">{label}</span>
      <span className="text-value font-semibold" style={{ color: color || "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}
