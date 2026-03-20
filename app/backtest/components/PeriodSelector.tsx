"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { TradingDay } from "@/lib/types";

interface Props {
  allDays: TradingDay[];
  onConfirm: (dateFrom: string, dateTo: string) => void;
}

// Preset periods
const PRESETS = [
  { label: "All", from: null, to: null },
  { label: "2015–2017", from: "2015-01-01", to: "2017-12-31" },
  { label: "2018–2019", from: "2018-01-01", to: "2019-12-31" },
  { label: "2020–2021", from: "2020-01-01", to: "2021-12-31" },
  { label: "2022–2023", from: "2022-01-01", to: "2023-12-31" },
  { label: "2024–2025", from: "2024-01-01", to: "2025-12-31" },
  { label: "Last 3 Years", from: null, to: null, lastYears: 3 },
  { label: "Last 5 Years", from: null, to: null, lastYears: 5 },
] as const;

export default function PeriodSelector({ allDays, onConfirm }: Props) {
  const firstDate = allDays[0]?.date ?? "2015-01-01";
  const lastDate = allDays[allDays.length - 1]?.date ?? "2025-12-31";

  const [dateFrom, setDateFrom] = useState(firstDate);
  const [dateTo, setDateTo] = useState(lastDate);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"from" | "to" | null>(null);

  // Convert date string to 0-1 fraction along the data range
  const dateToFrac = useCallback((d: string) => {
    const ts = new Date(d).getTime();
    const minTs = new Date(firstDate).getTime();
    const maxTs = new Date(lastDate).getTime();
    return Math.max(0, Math.min(1, (ts - minTs) / (maxTs - minTs)));
  }, [firstDate, lastDate]);

  // Convert 0-1 fraction to date string
  const fracToDate = useCallback((frac: number) => {
    const minTs = new Date(firstDate).getTime();
    const maxTs = new Date(lastDate).getTime();
    const ts = minTs + frac * (maxTs - minTs);
    return new Date(ts).toISOString().slice(0, 10);
  }, [firstDate, lastDate]);

  const fromFrac = dateToFrac(dateFrom);
  const toFrac = dateToFrac(dateTo);

  // Compute stats for selected period
  const selectedDays = useMemo(() =>
    allDays.filter((d) => d.date >= dateFrom && d.date <= dateTo),
    [allDays, dateFrom, dateTo]
  );

  // Monthly bar data for the timeline visualization
  const monthlyBars = useMemo(() => {
    const months = new Map<string, { count: number; avgChange: number; minPrice: number; maxPrice: number }>();
    for (const day of allDays) {
      const m = day.date.slice(0, 7); // YYYY-MM
      if (!months.has(m)) months.set(m, { count: 0, avgChange: 0, minPrice: Infinity, maxPrice: -Infinity });
      const entry = months.get(m)!;
      entry.count++;
      entry.avgChange += day.changePercent;
      if (day.low < entry.minPrice) entry.minPrice = day.low;
      if (day.high > entry.maxPrice) entry.maxPrice = day.high;
    }
    const result: { month: string; count: number; avgChange: number; minPrice: number; maxPrice: number }[] = [];
    for (const [month, data] of months) {
      result.push({ month, count: data.count, avgChange: data.avgChange / data.count, minPrice: data.minPrice, maxPrice: data.maxPrice });
    }
    result.sort((a, b) => a.month.localeCompare(b.month));
    return result;
  }, [allDays]);

  // Price range for scaling the mini chart
  const globalMinPrice = useMemo(() => Math.min(...monthlyBars.map((m) => m.minPrice)), [monthlyBars]);
  const globalMaxPrice = useMemo(() => Math.max(...monthlyBars.map((m) => m.maxPrice)), [monthlyBars]);
  const priceRange = globalMaxPrice - globalMinPrice || 1;

  // Drag handlers
  const handlePointerDown = useCallback((handle: "from" | "to") => {
    dragging.current = handle;
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!dragging.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const date = fracToDate(frac);

      if (dragging.current === "from") {
        if (date < dateTo) setDateFrom(date);
      } else {
        if (date > dateFrom) setDateTo(date);
      }
    };
    const handleUp = () => { dragging.current = null; };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [fracToDate, dateFrom, dateTo]);

  const applyPreset = (preset: typeof PRESETS[number]) => {
    if ("lastYears" in preset && preset.lastYears) {
      const endDate = lastDate;
      const startYear = parseInt(lastDate.slice(0, 4)) - preset.lastYears;
      const startDate = `${startYear}${lastDate.slice(4)}`;
      setDateFrom(startDate < firstDate ? firstDate : startDate);
      setDateTo(endDate);
    } else if (preset.from && preset.to) {
      setDateFrom(preset.from < firstDate ? firstDate : preset.from);
      setDateTo(preset.to > lastDate ? lastDate : preset.to);
    } else {
      setDateFrom(firstDate);
      setDateTo(lastDate);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Year markers for the timeline
  const years = useMemo(() => {
    const startYear = parseInt(firstDate.slice(0, 4));
    const endYear = parseInt(lastDate.slice(0, 4));
    const result: { year: number; frac: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      result.push({ year: y, frac: dateToFrac(`${y}-01-01`) });
    }
    return result;
  }, [firstDate, lastDate, dateToFrac]);

  return (
    <div className="h-screen flex items-center justify-center" style={{ background: "#0d1117" }}>
      <div className="w-full max-w-3xl px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-xl font-bold tracking-tight mb-2" style={{ color: "rgba(255,255,255,0.95)" }}>
            Select Data Period
          </h1>
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Choose the NASDAQ date range to trade on
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {PRESETS.map((p) => {
            const isActive = (() => {
              if ("lastYears" in p && p.lastYears) {
                const startYear = parseInt(lastDate.slice(0, 4)) - p.lastYears;
                const expected = `${startYear}${lastDate.slice(4)}`;
                return dateFrom === (expected < firstDate ? firstDate : expected) && dateTo === lastDate;
              }
              if (p.from && p.to) {
                return dateFrom === (p.from < firstDate ? firstDate : p.from) && dateTo === (p.to > lastDate ? lastDate : p.to);
              }
              return dateFrom === firstDate && dateTo === lastDate;
            })();

            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="text-[10px] font-mono px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                  color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Timeline with mini price chart */}
        <div className="rounded-lg p-4 mb-4" style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {/* Mini price chart */}
          <div className="relative h-16 mb-2">
            {monthlyBars.map((m, i) => {
              const x = i / monthlyBars.length;
              const w = 1 / monthlyBars.length;
              const barH = ((m.maxPrice - m.minPrice) / priceRange) * 100;
              const barBottom = ((m.minPrice - globalMinPrice) / priceRange) * 100;
              const monthDate = m.month + "-01";
              const inRange = monthDate >= dateFrom && monthDate <= dateTo;

              return (
                <div
                  key={m.month}
                  className="absolute bottom-0 transition-opacity"
                  style={{
                    left: `${x * 100}%`,
                    width: `${w * 100}%`,
                    bottom: `${barBottom}%`,
                    height: `${Math.max(barH, 1)}%`,
                    background: inRange
                      ? (m.avgChange >= 0 ? "rgba(63, 185, 80, 0.5)" : "rgba(248, 81, 73, 0.5)")
                      : "rgba(255,255,255,0.06)",
                    borderRadius: "1px",
                  }}
                />
              );
            })}

            {/* Dimmed overlay outside selected range */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `linear-gradient(to right,
                rgba(0,0,0,0.6) 0%,
                rgba(0,0,0,0.6) ${fromFrac * 100}%,
                transparent ${fromFrac * 100}%,
                transparent ${toFrac * 100}%,
                rgba(0,0,0,0.6) ${toFrac * 100}%,
                rgba(0,0,0,0.6) 100%)`,
            }} />

            {/* Selection border lines */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{
              left: `${fromFrac * 100}%`,
              width: `${(toFrac - fromFrac) * 100}%`,
              borderLeft: "1.5px solid rgba(255,255,255,0.4)",
              borderRight: "1.5px solid rgba(255,255,255,0.4)",
            }} />
          </div>

          {/* Slider track */}
          <div ref={trackRef} className="relative h-6 select-none touch-none">
            {/* Track background */}
            <div className="absolute top-2.5 left-0 right-0 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />

            {/* Selected range fill */}
            <div className="absolute top-2.5 h-1 rounded-full" style={{
              left: `${fromFrac * 100}%`,
              width: `${(toFrac - fromFrac) * 100}%`,
              background: "rgba(255,255,255,0.3)",
            }} />

            {/* Year ticks */}
            {years.map((y) => (
              <div key={y.year} className="absolute top-0 flex flex-col items-center" style={{ left: `${y.frac * 100}%`, transform: "translateX(-50%)" }}>
                <div className="w-px h-1.5" style={{ background: "rgba(255,255,255,0.15)" }} />
                <span className="text-[7px] mt-0.5 font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {y.year}
                </span>
              </div>
            ))}

            {/* From handle */}
            <div
              className="absolute top-0.5 z-10 cursor-grab active:cursor-grabbing"
              style={{ left: `${fromFrac * 100}%`, transform: "translateX(-50%)" }}
              onPointerDown={() => handlePointerDown("from")}
            >
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                background: "rgba(255,255,255,0.9)",
                boxShadow: "0 0 8px rgba(255,255,255,0.3)",
              }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#0d1117" }} />
              </div>
            </div>

            {/* To handle */}
            <div
              className="absolute top-0.5 z-10 cursor-grab active:cursor-grabbing"
              style={{ left: `${toFrac * 100}%`, transform: "translateX(-50%)" }}
              onPointerDown={() => handlePointerDown("to")}
            >
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                background: "rgba(255,255,255,0.9)",
                boxShadow: "0 0 8px rgba(255,255,255,0.3)",
              }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#0d1117" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Selected range display */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>From</div>
              <div className="text-[13px] font-mono font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {formatDate(dateFrom)}
              </div>
            </div>
            <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.2)" }}>→</div>
            <div className="text-center">
              <div className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>To</div>
              <div className="text-[13px] font-mono font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {formatDate(dateTo)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-[20px] font-mono font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                {selectedDays.length}
              </div>
              <div className="text-[8px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                Trading Days
              </div>
            </div>
            <div className="text-center">
              <div className="text-[20px] font-mono font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                {Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24 * 365.25 * 10)) / 10}y
              </div>
              <div className="text-[8px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                Span
              </div>
            </div>
          </div>
        </div>

        {/* Confirm button */}
        <div className="text-center">
          <button
            onClick={() => onConfirm(dateFrom, dateTo)}
            disabled={selectedDays.length < 5}
            className="text-[12px] font-mono font-semibold px-8 py-2.5 rounded-lg transition-all hover:brightness-110 disabled:opacity-30"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.95)",
            }}
          >
            Start Trading ({selectedDays.length} days)
          </button>
        </div>
      </div>
    </div>
  );
}
