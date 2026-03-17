"use client";

import { PoolFilter, DEFAULT_POOL_FILTER } from "@/lib/backtestTypes";

interface Props {
  filter: PoolFilter;
  onChange: (f: PoolFilter) => void;
  poolSize: number;
  totalSize: number;
}

const DAYS = [
  { value: null, label: "Any" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
];

export default function DayPoolFilter({ filter, onChange, poolSize, totalSize }: Props) {
  const update = (patch: Partial<PoolFilter>) => onChange({ ...filter, ...patch });
  const isDefault = JSON.stringify(filter) === JSON.stringify(DEFAULT_POOL_FILTER);

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Day Pool Filter</h3>
        {!isDefault && (
          <button
            onClick={() => onChange(DEFAULT_POOL_FILTER)}
            className="text-[9px] text-[var(--accent)] hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-[var(--text-dim)] block mb-0.5">Day of Week</label>
          <select
            value={filter.dayOfWeek === null ? "" : filter.dayOfWeek}
            onChange={(e) => update({ dayOfWeek: e.target.value === "" ? null : Number(e.target.value) })}
            className="text-[10px] py-1 px-1.5"
          >
            {DAYS.map((d) => (
              <option key={d.label} value={d.value === null ? "" : d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[9px] text-[var(--text-dim)] block mb-0.5">Gap Direction</label>
          <select
            value={filter.gapDirection}
            onChange={(e) => update({ gapDirection: e.target.value as PoolFilter["gapDirection"] })}
            className="text-[10px] py-1 px-1.5"
          >
            <option value="any">Any</option>
            <option value="up">Gap Up</option>
            <option value="down">Gap Down</option>
          </select>
        </div>

        <div>
          <label className="text-[9px] text-[var(--text-dim)] block mb-0.5">Prev Day Dir</label>
          <select
            value={filter.prevDayDirection}
            onChange={(e) => update({ prevDayDirection: e.target.value as PoolFilter["prevDayDirection"] })}
            className="text-[10px] py-1 px-1.5"
          >
            <option value="any">Any</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
          </select>
        </div>

        <div>
          <label className="text-[9px] text-[var(--text-dim)] block mb-0.5">Prev Day Gap</label>
          <select
            value={filter.prevDayGapDirection}
            onChange={(e) => update({ prevDayGapDirection: e.target.value as PoolFilter["prevDayGapDirection"] })}
            className="text-[10px] py-1 px-1.5"
          >
            <option value="any">Any</option>
            <option value="up">Gap Up</option>
            <option value="down">Gap Down</option>
          </select>
        </div>
      </div>

      <div className="text-[10px] text-[var(--text-muted)]">
        Pool: <span className="font-semibold text-[var(--accent)]">{poolSize}</span> / {totalSize} days
      </div>
    </div>
  );
}
