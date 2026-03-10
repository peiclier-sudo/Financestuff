"use client";

import { useState, useEffect, useCallback } from "react";
import { TradingDay } from "@/lib/types";
import {
  STRATEGIES,
  StrategyParams,
  StrategyResult,
  runStrategy,
  loadSavedResults,
  saveResult,
  deleteSavedResult,
} from "@/lib/strategies";

interface Props {
  days: TradingDay[];
  filterDescription: string;
  onResult?: (result: StrategyResult | null) => void;
}

export default function StrategyLab({ days, filterDescription, onResult }: Props) {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyParams>(STRATEGIES[0]);
  const [params, setParams] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [savedResults, setSavedResults] = useState<StrategyResult[]>([]);
  const [running, setRunning] = useState(false);
  const [viewingSaved, setViewingSaved] = useState<StrategyResult | null>(null);
  const [showTrades, setShowTrades] = useState(false);

  // Init defaults
  useEffect(() => {
    const defaults: Record<string, number | string> = {};
    selectedStrategy.fields.forEach(f => { defaults[f.key] = f.default; });
    setParams(defaults);
    setResult(null);
    setViewingSaved(null);
  }, [selectedStrategy]);

  // Load saved on mount
  useEffect(() => {
    setSavedResults(loadSavedResults());
  }, []);

  const handleRun = useCallback(() => {
    if (days.length === 0) return;
    setRunning(true);
    setViewingSaved(null);
    // Run async-like via setTimeout to not block UI
    setTimeout(() => {
      const res = runStrategy(selectedStrategy.id, params, days, filterDescription);
      setResult(res);
      setRunning(false);
    }, 10);
  }, [days, selectedStrategy, params, filterDescription]);

  const handleSave = useCallback(() => {
    if (!result) return;
    const updated = saveResult(result);
    setSavedResults(updated);
  }, [result]);

  const handleDelete = useCallback((ts: number) => {
    const updated = deleteSavedResult(ts);
    setSavedResults(updated);
    if (viewingSaved?.timestamp === ts) setViewingSaved(null);
  }, [viewingSaved]);

  const activeResult = viewingSaved || result;

  // Notify parent of active result changes
  useEffect(() => {
    onResult?.(activeResult);
  }, [activeResult, onResult]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-2 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between flex-shrink-0">
        <h3 className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wide uppercase">Strategy Lab</h3>
        <span className="text-[10px] text-[var(--text-dim)]">{days.length} days</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 text-[10px]">
        {/* Strategy selector */}
        <div>
          <label className="text-[var(--text-dim)] mb-0.5 block">Strategy</label>
          <select
            value={selectedStrategy.id}
            onChange={e => setSelectedStrategy(STRATEGIES.find(s => s.id === e.target.value)!)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-1 text-[10px] text-[var(--text)]"
          >
            {STRATEGIES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <p className="text-[var(--text-dim)] mt-0.5 text-[9px]">{selectedStrategy.description}</p>
        </div>

        {/* Params */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {selectedStrategy.fields.map(field => (
            <div key={field.key}>
              <label className="text-[var(--text-dim)] block mb-0.5">{field.label}</label>
              {field.type === "select" ? (
                <select
                  value={String(params[field.key] ?? field.default)}
                  onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text)]"
                >
                  {field.options!.map(o => (
                    <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={Number(params[field.key] ?? field.default)}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onChange={e => setParams(p => ({ ...p, [field.key]: Number(e.target.value) }))}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono"
                />
              )}
            </div>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running || days.length === 0}
          className="w-full bg-[var(--accent)] text-white rounded py-1 text-[10px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {running ? "Running..." : "Run Backtest"}
        </button>

        {/* Results */}
        {activeResult && (
          <div className="border border-[var(--border)] rounded bg-[var(--bg)] overflow-hidden">
            <div className="px-2 py-1 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-semibold text-[var(--text-muted)]">
                {viewingSaved ? "Saved" : "Results"}: {activeResult.strategyLabel}
              </span>
              <div className="flex gap-1">
                {!viewingSaved && result && (
                  <button onClick={handleSave} className="text-[var(--accent)] hover:underline text-[9px]">Save</button>
                )}
                <button onClick={() => setShowTrades(t => !t)} className="text-[var(--text-dim)] hover:underline text-[9px]">
                  {showTrades ? "Hide" : "Trades"}
                </button>
              </div>
            </div>

            <div className="p-2 space-y-1">
              {/* Headline stats */}
              <div className="grid grid-cols-3 gap-1">
                <StatBox label="Trades" value={String(activeResult.totalTrades)} />
                <StatBox
                  label="Win Rate"
                  value={`${activeResult.winRate.toFixed(1)}%`}
                  color={activeResult.winRate >= 50 ? "g" : "r"}
                />
                <StatBox
                  label="Avg P&L"
                  value={`${activeResult.avgPnlPoints >= 0 ? "+" : ""}${activeResult.avgPnlPoints.toFixed(1)} pts`}
                  color={activeResult.avgPnlPoints >= 0 ? "g" : "r"}
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <StatBox
                  label="Total P&L"
                  value={`${activeResult.totalPnlPoints >= 0 ? "+" : ""}${activeResult.totalPnlPoints.toFixed(1)}`}
                  color={activeResult.totalPnlPoints >= 0 ? "g" : "r"}
                />
                <StatBox
                  label="Profit Factor"
                  value={activeResult.profitFactor === Infinity ? "∞" : activeResult.profitFactor.toFixed(2)}
                  color={activeResult.profitFactor >= 1 ? "g" : "r"}
                />
                <StatBox
                  label="Median"
                  value={`${activeResult.medianPnlPoints >= 0 ? "+" : ""}${activeResult.medianPnlPoints.toFixed(1)}`}
                  color={activeResult.medianPnlPoints >= 0 ? "g" : "r"}
                />
              </div>
              <div className="grid grid-cols-4 gap-1">
                <StatBox label="Avg Win" value={`+${activeResult.avgWin.toFixed(1)}`} color="g" />
                <StatBox label="Avg Loss" value={`-${activeResult.avgLoss.toFixed(1)}`} color="r" />
                <StatBox label="Max Win" value={`+${activeResult.maxWin.toFixed(1)}`} color="g" />
                <StatBox label="Max Loss" value={activeResult.maxLoss.toFixed(1)} color="r" />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <StatBox label="Winners" value={String(activeResult.winners)} color="g" />
                <StatBox label="Losers" value={String(activeResult.losers)} color="r" />
                <StatBox label="Avg Hold" value={`${activeResult.avgHoldBars.toFixed(0)} bars`} />
              </div>

              {/* Filter context */}
              <div className="text-[9px] text-[var(--text-dim)] pt-1 border-t border-[var(--border)]">
                Filter: {activeResult.filterDescription} ({activeResult.totalDays} days)
              </div>

              {/* Trade-by-trade list */}
              {showTrades && (
                <div className="max-h-40 overflow-y-auto border-t border-[var(--border)] mt-1">
                  <table className="w-full text-[9px]">
                    <thead className="sticky top-0 bg-[var(--surface-2)]">
                      <tr>
                        <th className="text-left px-1 py-0.5 text-[var(--text-dim)]">Date</th>
                        <th className="text-center px-1 py-0.5 text-[var(--text-dim)]">Dir</th>
                        <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">Entry</th>
                        <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">Exit</th>
                        <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">P&L</th>
                        <th className="text-center px-1 py-0.5 text-[var(--text-dim)]">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.trades.map((t, i) => (
                        <tr key={i} className="border-b border-[var(--border)]">
                          <td className="px-1 py-0.5 font-mono text-[var(--text-muted)]">{t.date.slice(5)}</td>
                          <td className={`px-1 py-0.5 text-center ${t.direction === "long" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {t.direction === "long" ? "L" : "S"}
                          </td>
                          <td className="px-1 py-0.5 text-right font-mono">{t.entryPrice.toFixed(1)}</td>
                          <td className="px-1 py-0.5 text-right font-mono">{t.exitPrice.toFixed(1)}</td>
                          <td className={`px-1 py-0.5 text-right font-mono font-medium ${t.pnlPoints >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                            {t.pnlPoints >= 0 ? "+" : ""}{t.pnlPoints.toFixed(1)}
                          </td>
                          <td className="px-1 py-0.5 text-center text-[var(--text-dim)]">
                            {t.hitTarget ? "T" : t.hitStop ? "S" : "C"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saved results */}
        {savedResults.length > 0 && (
          <div className="border border-[var(--border)] rounded bg-[var(--bg)] overflow-hidden">
            <div className="px-2 py-1 bg-[var(--surface-2)] border-b border-[var(--border)]">
              <span className="font-semibold text-[var(--text-dim)] text-[9px] uppercase tracking-wide">Saved Results ({savedResults.length})</span>
            </div>
            <div className="max-h-36 overflow-y-auto">
              {savedResults.map(sr => (
                <div
                  key={sr.timestamp}
                  className={`px-2 py-1 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] flex items-center justify-between ${
                    viewingSaved?.timestamp === sr.timestamp ? "bg-[var(--accent-dim)]/15" : ""
                  }`}
                  onClick={() => { setViewingSaved(sr); setShowTrades(false); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--text-muted)] truncate">{sr.strategyLabel}</div>
                    <div className="text-[9px] text-[var(--text-dim)] truncate">{sr.filterDescription}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={`font-mono font-semibold ${sr.totalPnlPoints >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {sr.totalPnlPoints >= 0 ? "+" : ""}{sr.totalPnlPoints.toFixed(0)}
                    </span>
                    <span className="text-[var(--text-dim)]">{sr.winRate.toFixed(0)}%</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(sr.timestamp); }}
                      className="text-[var(--red)] opacity-40 hover:opacity-100 text-[9px]"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: "g" | "r" }) {
  return (
    <div className="bg-[var(--surface)] rounded px-1.5 py-0.5 text-center">
      <div className="text-[8px] text-[var(--text-dim)] uppercase">{label}</div>
      <div className={`font-mono font-semibold text-[10px] ${
        color === "g" ? "text-[var(--green)]" : color === "r" ? "text-[var(--red)]" : "text-[var(--text)]"
      }`}>{value}</div>
    </div>
  );
}
