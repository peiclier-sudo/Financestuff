"use client";

import { FilterCriteria } from "@/lib/types";

interface Props {
  criteria: FilterCriteria;
  onChange: (criteria: FilterCriteria) => void;
  resultCount: number;
  totalCount: number;
}

export default function FilterPanel({ criteria, onChange, resultCount, totalCount }: Props) {
  const update = (patch: Partial<FilterCriteria>) => {
    onChange({ ...criteria, ...patch });
  };

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Filters</h2>
        <span className="text-sm text-[#888]">
          {resultCount} / {totalCount} days
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Day of Week */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Day of Week</label>
          <select
            value={criteria.dayOfWeek ?? "any"}
            onChange={(e) =>
              update({ dayOfWeek: e.target.value === "any" ? null : parseInt(e.target.value) })
            }
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          >
            <option value="any">Any</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
          </select>
        </div>

        {/* Gap Direction */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Gap Direction</label>
          <select
            value={criteria.gapDirection}
            onChange={(e) =>
              update({ gapDirection: e.target.value as "up" | "down" | "any" })
            }
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          >
            <option value="any">Any</option>
            <option value="up">Gap Up</option>
            <option value="down">Gap Down</option>
          </select>
        </div>

        {/* Day Direction */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Day Direction</label>
          <select
            value={criteria.direction}
            onChange={(e) =>
              update({ direction: e.target.value as "bullish" | "bearish" | "any" })
            }
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          >
            <option value="any">Any</option>
            <option value="bullish">Bullish (Close &gt; Open)</option>
            <option value="bearish">Bearish (Close &lt; Open)</option>
          </select>
        </div>

        {/* Min Gap % */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Min Gap %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={criteria.minGapPercent}
            onChange={(e) => update({ minGapPercent: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          />
        </div>

        {/* Max Gap % */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Max Gap %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={criteria.maxGapPercent}
            onChange={(e) => update({ maxGapPercent: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
            placeholder="0 = no limit"
          />
        </div>

        {/* Min Range % */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Min Range %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={criteria.minRangePercent}
            onChange={(e) => update({ minRangePercent: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          />
        </div>

        {/* Max Range % */}
        <div>
          <label className="block text-sm text-[#888] mb-1">Max Range %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={criteria.maxRangePercent}
            onChange={(e) => update({ maxRangePercent: parseFloat(e.target.value) || 0 })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
            placeholder="0 = no limit"
          />
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[#888] mb-1">From Date</label>
          <input
            type="date"
            value={criteria.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-[#888] mb-1">To Date</label>
          <input
            type="date"
            value={criteria.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
