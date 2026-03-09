"use client";

import { useState, useCallback } from "react";
import { TradingDay, FilterCriteria } from "@/lib/types";

interface Stats {
  count: number;
  bullishPct: number;
  avgChange: number;
  medianChange: number;
  avgGap: number | null;
  avgRange: number;
  avgCloseLocation: number;
  maxGain: number;
  maxLoss: number;
}

interface Props {
  days: TradingDay[];
  stats: Stats | null;
  criteria: FilterCriteria;
}

function buildFilterDescription(c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.dayOfWeek !== null) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    parts.push(`Day: ${names[c.dayOfWeek]}`);
  }
  if (c.gapDirection !== "any") parts.push(`Gap: ${c.gapDirection}`);
  if (c.direction !== "any") parts.push(`Direction: ${c.direction}`);
  if (c.prevDayDirection !== "any") parts.push(`Prev day: ${c.prevDayDirection}`);
  if (c.minGapPercent > 0) parts.push(`Min gap: ${c.minGapPercent}%`);
  if (c.maxGapPercent > 0) parts.push(`Max gap: ${c.maxGapPercent}%`);
  if (c.minRangePercent > 0) parts.push(`Min range: ${c.minRangePercent}%`);
  if (c.maxRangePercent > 0) parts.push(`Max range: ${c.maxRangePercent}%`);
  if (c.minChangePercent > 0) parts.push(`Min change: ${c.minChangePercent}%`);
  if (c.maxChangePercent > 0) parts.push(`Max change: ${c.maxChangePercent}%`);
  if (c.dateFrom) parts.push(`From: ${c.dateFrom}`);
  if (c.dateTo) parts.push(`To: ${c.dateTo}`);
  return parts.length > 0 ? parts.join(", ") : "No filters (all days)";
}

function renderMarkdown(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

export default function AIAnalysis({ days, stats, criteria }: Props) {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("deepseek_key") ?? "";
    }
    return "";
  });
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Enter your DeepSeek API key first");
      return;
    }
    if (!stats || days.length === 0) {
      setError("No days to analyze");
      return;
    }

    // Save key
    localStorage.setItem("deepseek_key", apiKey);

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const daySummaries = days.map(d => ({
        date: d.date,
        dayName: d.dayName,
        open: d.open,
        close: d.close,
        high: d.high,
        low: d.low,
        changePercent: d.changePercent,
        gapPercent: d.gapPercent,
        rangePercent: d.rangePercent,
        prevDayDirection: d.prevDayDirection,
        prevDayChangePercent: d.prevDayChangePercent,
        closeLocation: d.closeLocation,
        bodyPercent: d.bodyPercent,
      }));

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: daySummaries,
          stats,
          filterDescription: buildFilterDescription(criteria),
          apiKey: apiKey.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else {
        setAnalysis(data.analysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [apiKey, days, stats, criteria]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[var(--purple)] text-xs">&#9672;</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            AI Pattern Analysis
          </h3>
          <span className="text-[10px] text-[var(--text-dim)]">DeepSeek</span>
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {/* API Key input */}
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="DeepSeek API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 text-[11px]"
          />
          <button
            onClick={analyze}
            disabled={loading || days.length === 0}
            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              loading
                ? "bg-[var(--border)] text-[var(--text-dim)]"
                : "bg-[var(--accent-dim)] text-white hover:bg-[var(--accent)] active:scale-95"
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing...
              </span>
            ) : (
              `Analyze ${days.length} days`
            )}
          </button>
        </div>

        {error && (
          <div className="text-[11px] text-[var(--red)] bg-[var(--red)]/10 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        {loading && !analysis && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] py-4 justify-center">
            <span className="pulse-glow text-[var(--purple)]">&#9672;</span>
            DeepSeek is analyzing patterns across {days.length} trading days...
          </div>
        )}

        {analysis && (
          <div
            className="ai-content text-[11px] text-[var(--text-muted)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }}
          />
        )}

        {!analysis && !loading && !error && (
          <p className="text-[11px] text-[var(--text-dim)] text-center py-3">
            Apply filters, then click Analyze to have DeepSeek identify patterns in the matching days.
          </p>
        )}
      </div>
    </div>
  );
}
