"use client";

import { HourlyBucket } from "@/lib/backtestTypes";

interface Props {
  buckets: HourlyBucket[];
}

export default function HourlyStats({ buckets }: Props) {
  if (buckets.length === 0) return null;

  return (
    <div>
      <h3 className="text-label mb-2">Hourly Breakdown</h3>
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-[var(--surface-2)]">
              <th className="text-left py-1 px-2 font-semibold text-[var(--text-muted)]">Hour</th>
              <th className="text-right py-1 px-2 font-semibold text-[var(--text-muted)]">Bull%</th>
              <th className="text-right py-1 px-2 font-semibold text-[var(--text-muted)]">Avg Rng%</th>
              <th className="text-right py-1 px-2 font-semibold text-[var(--text-muted)]">n</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => {
              const bullColor =
                b.bullishPct > 55 ? "var(--green)" :
                b.bullishPct < 45 ? "var(--red)" :
                "var(--text-secondary)";
              const rangeColor =
                b.avgRangePct > 0.4 ? "var(--text)" :
                b.avgRangePct > 0.25 ? "var(--text-secondary)" :
                "var(--text-dim)";

              return (
                <tr key={b.hour} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="py-1 px-2 text-[var(--text-muted)] font-mono">{b.hour}</td>
                  <td className="py-1 px-2 text-right font-mono font-semibold" style={{ color: bullColor }}>
                    {b.sampleSize > 0 ? `${b.bullishPct.toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-1 px-2 text-right font-mono" style={{ color: rangeColor }}>
                    {b.sampleSize > 0 ? `${b.avgRangePct.toFixed(3)}%` : "—"}
                  </td>
                  <td className="py-1 px-2 text-right text-[var(--text-dim)]">{b.sampleSize}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
