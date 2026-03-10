"use client";

import { FilterCriteria } from "@/lib/types";

interface Props {
  criteria: FilterCriteria;
  onChange: (criteria: FilterCriteria) => void;
  resultCount: number;
  totalCount: number;
  onReset: () => void;
}

export default function FilterPanel({ criteria, onChange, resultCount, totalCount, onReset }: Props) {
  const update = (patch: Partial<FilterCriteria>) => {
    onChange({ ...criteria, ...patch });
  };

  const pct = totalCount > 0 ? ((resultCount / totalCount) * 100).toFixed(0) : "0";

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/50">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Filters</h2>
          <div className="flex items-center gap-2">
            <span className="stat-badge blue">{resultCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
            <span className="text-[10px] text-[var(--text-dim)] font-medium">({pct}%)</span>
          </div>
        </div>
        <button
          onClick={onReset}
          className="text-[10px] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer uppercase tracking-wide font-medium"
        >
          Reset
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-x-3 gap-y-2">
          {/* Day of Week */}
          <Field label="Day">
            <select
              value={criteria.dayOfWeek ?? "any"}
              onChange={(e) => update({ dayOfWeek: e.target.value === "any" ? null : parseInt(e.target.value) })}
            >
              <option value="any">Any</option>
              <option value="1">Mon</option>
              <option value="2">Tue</option>
              <option value="3">Wed</option>
              <option value="4">Thu</option>
              <option value="5">Fri</option>
            </select>
          </Field>

          {/* Gap Direction */}
          <Field label="Gap Dir">
            <select
              value={criteria.gapDirection}
              onChange={(e) => update({ gapDirection: e.target.value as "up" | "down" | "any" })}
            >
              <option value="any">Any</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </Field>

          {/* Day Direction */}
          <Field label="Direction">
            <select
              value={criteria.direction}
              onChange={(e) => update({ direction: e.target.value as "bullish" | "bearish" | "any" })}
            >
              <option value="any">Any</option>
              <option value="bullish">Bull</option>
              <option value="bearish">Bear</option>
            </select>
          </Field>

          {/* Previous Day */}
          <Field label="Prev Day">
            <select
              value={criteria.prevDayDirection}
              onChange={(e) => update({ prevDayDirection: e.target.value as "bullish" | "bearish" | "any" })}
            >
              <option value="any">Any</option>
              <option value="bullish">Bull</option>
              <option value="bearish">Bear</option>
            </select>
          </Field>

          {/* Gap % range */}
          <Field label="Gap % Min">
            <input
              type="number" step="0.1" min="0"
              value={criteria.minGapPercent || ""}
              placeholder="0"
              onChange={(e) => update({ minGapPercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Gap % Max">
            <input
              type="number" step="0.1" min="0"
              value={criteria.maxGapPercent || ""}
              placeholder="∞"
              onChange={(e) => update({ maxGapPercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>

          {/* Range % */}
          <Field label="Range % Min">
            <input
              type="number" step="0.1" min="0"
              value={criteria.minRangePercent || ""}
              placeholder="0"
              onChange={(e) => update({ minRangePercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Range % Max">
            <input
              type="number" step="0.1" min="0"
              value={criteria.maxRangePercent || ""}
              placeholder="∞"
              onChange={(e) => update({ maxRangePercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>

          {/* Change % */}
          <Field label="Chg % Min">
            <input
              type="number" step="0.1" min="0"
              value={criteria.minChangePercent || ""}
              placeholder="0"
              onChange={(e) => update({ minChangePercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Chg % Max">
            <input
              type="number" step="0.1" min="0"
              value={criteria.maxChangePercent || ""}
              placeholder="∞"
              onChange={(e) => update({ maxChangePercent: parseFloat(e.target.value) || 0 })}
            />
          </Field>

          {/* Date range */}
          <Field label="From">
            <input
              type="date"
              value={criteria.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={criteria.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] text-[var(--text-dim)] mb-1 uppercase tracking-widest font-medium">{label}</label>
      {children}
    </div>
  );
}
