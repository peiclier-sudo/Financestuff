"use client";

import { useState, useEffect, useCallback } from "react";
import { TradingDay } from "@/lib/types";
import {
  STRATEGIES,
  StrategyParams,
  StrategyResult,
  TradeResult,
  runStrategy,
  loadSavedResults,
  saveResult,
  deleteSavedResult,
} from "@/lib/strategies";
import {
  CustomStrategyDef,
  runCustomStrategy,
  loadCustomStrategies,
  saveCustomStrategy,
  deleteCustomStrategy,
} from "@/lib/customStrategy";

interface Props {
  days: TradingDay[];
  filterDescription: string;
  onResult?: (result: StrategyResult | null) => void;
}

// Helper: build a StrategyResult from custom trades
function buildResult(
  trades: TradeResult[],
  label: string,
  filterDescription: string,
  totalDays: number,
): StrategyResult {
  const wins = trades.filter(t => t.pnlPoints > 0);
  const losses = trades.filter(t => t.pnlPoints <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));
  const pnls = trades.map(t => t.pnlPoints);
  const sorted = [...pnls].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    strategyId: "custom_ai",
    strategyLabel: label,
    params: {},
    filterDescription,
    totalDays,
    trades,
    totalTrades: trades.length,
    winners: wins.length,
    losers: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgPnlPoints: trades.length > 0 ? pnls.reduce((a, b) => a + b, 0) / trades.length : 0,
    avgPnlPercent: trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length : 0,
    medianPnlPoints: median,
    totalPnlPoints: pnls.reduce((a, b) => a + b, 0),
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxWin: trades.length > 0 ? Math.max(...pnls) : 0,
    maxLoss: trades.length > 0 ? Math.min(...pnls) : 0,
    avgHoldBars: trades.length > 0 ? trades.reduce((s, t) => s + t.holdBars, 0) / trades.length : 0,
    timestamp: Date.now(),
  };
}

export default function StrategyLab({ days, filterDescription, onResult }: Props) {
  const [tab, setTab] = useState<"preset" | "ai">("preset");

  // ── Preset strategy state ──
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyParams>(STRATEGIES[0]);
  const [params, setParams] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [savedResults, setSavedResults] = useState<StrategyResult[]>([]);
  const [running, setRunning] = useState(false);
  const [viewingSaved, setViewingSaved] = useState<StrategyResult | null>(null);
  const [showTrades, setShowTrades] = useState(false);

  // ── AI custom strategy state ──
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<StrategyResult | null>(null);
  const [aiStrategy, setAiStrategy] = useState<CustomStrategyDef | null>(null);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategyDef[]>([]);
  const [viewingCustom, setViewingCustom] = useState<CustomStrategyDef | null>(null);
  const [showAiTrades, setShowAiTrades] = useState(false);

  // Init defaults for preset
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
    setCustomStrategies(loadCustomStrategies());
  }, []);

  // ── Preset handlers ──
  const handleRun = useCallback(() => {
    if (days.length === 0) return;
    setRunning(true);
    setViewingSaved(null);
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

  // ── AI strategy handlers ──
  const handleGenerateAndRun = useCallback(async () => {
    if (!aiPrompt.trim() || days.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiStrategy(null);

    try {
      const res = await fetch("/api/generate-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Failed to generate strategy");
        setAiLoading(false);
        return;
      }

      const raw = data.strategy;
      const stratDef: CustomStrategyDef = {
        id: `custom_${Date.now()}`,
        name: raw.name || "AI Strategy",
        description: aiPrompt,
        conditions: raw.conditions || [],
        direction: raw.direction || "long",
        entryBar: raw.entryBar ?? 1,
        entryPrice: raw.entryPrice || "open",
        entryMode: raw.entryMode || "fixed",
        entryOffset: raw.entryOffset ?? 1,
        stopPoints: raw.stopPoints || 0,
        targetPoints: raw.targetPoints || 0,
        stopAtr: raw.stopAtr,
        targetAtr: raw.targetAtr,
        atrLength: raw.atrLength,
        holdToClose: raw.holdToClose ?? true,
        maxHoldBars: raw.maxHoldBars,
        timestamp: Date.now(),
      };

      setAiStrategy(stratDef);

      // Run it
      const trades = runCustomStrategy(stratDef, days);
      const stratResult = buildResult(trades, stratDef.name, filterDescription, days.length);
      setAiResult(stratResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Network error");
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, days, filterDescription]);

  const handleSaveCustom = useCallback(() => {
    if (!aiStrategy) return;
    const updated = saveCustomStrategy(aiStrategy);
    setCustomStrategies(updated);
  }, [aiStrategy]);

  const handleRunSavedCustom = useCallback((strat: CustomStrategyDef) => {
    setViewingCustom(strat);
    const trades = runCustomStrategy(strat, days);
    const stratResult = buildResult(trades, strat.name, filterDescription, days.length);
    setAiResult(stratResult);
    setAiStrategy(strat);
    setShowAiTrades(false);
  }, [days, filterDescription]);

  const handleDeleteCustom = useCallback((id: string) => {
    const updated = deleteCustomStrategy(id);
    setCustomStrategies(updated);
    if (viewingCustom?.id === id) {
      setViewingCustom(null);
      setAiResult(null);
      setAiStrategy(null);
    }
  }, [viewingCustom]);

  // ── Active result for chart ──
  const presetActiveResult = viewingSaved || result;
  const activeResult = tab === "preset" ? presetActiveResult : aiResult;

  useEffect(() => {
    onResult?.(activeResult ?? null);
  }, [activeResult, onResult]);

  // ── Render ──
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {/* Tab header */}
      <div className="flex border-b border-[var(--border)] flex-shrink-0">
        <button
          onClick={() => setTab("preset")}
          className={`flex-1 text-[9px] py-1 font-semibold tracking-wide transition-colors ${
            tab === "preset"
              ? "bg-[var(--surface-2)] text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          Strategies
        </button>
        <button
          onClick={() => setTab("ai")}
          className={`flex-1 text-[9px] py-1 font-semibold tracking-wide transition-colors ${
            tab === "ai"
              ? "bg-[var(--surface-2)] text-[var(--purple)] border-b-2 border-[var(--purple)]"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          AI Backtest
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 text-[10px]">
        {tab === "preset" ? (
          <>
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
            {presetActiveResult && (
              <ResultsPanel
                result={presetActiveResult}
                isViewingSaved={!!viewingSaved}
                showTrades={showTrades}
                onToggleTrades={() => setShowTrades(t => !t)}
                onSave={!viewingSaved && result ? handleSave : undefined}
              />
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
          </>
        ) : (
          <>
            {/* AI Backtest input */}
            <div>
              <label className="text-[var(--text-dim)] mb-0.5 block">Describe your strategy idea</label>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateAndRun();
                  }
                }}
                placeholder="e.g. Go long if the 3rd candle closes bullish with a stop of 50 points..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-1 text-[10px] text-[var(--text)] resize-none"
                rows={3}
                disabled={aiLoading}
              />
              <p className="text-[var(--text-dim)] mt-0.5 text-[9px]">
                DeepSeek converts your idea into rules and backtests it. Enter to run.
              </p>
            </div>

            <button
              onClick={handleGenerateAndRun}
              disabled={aiLoading || !aiPrompt.trim() || days.length === 0}
              className="w-full bg-[var(--purple)] text-white rounded py-1 text-[10px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {aiLoading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
                  Generating & running...
                </span>
              ) : (
                `Generate & Backtest (${days.length} days)`
              )}
            </button>

            {aiError && (
              <div className="text-[10px] text-[var(--red)] bg-[var(--red)]/10 rounded px-2 py-1">
                {aiError}
              </div>
            )}

            {/* Show generated rules */}
            {aiStrategy && (
              <div className="border border-[var(--purple)]/30 rounded bg-[var(--purple)]/5 px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[var(--purple)] font-semibold text-[10px]">{aiStrategy.name}</span>
                  <button
                    onClick={handleSaveCustom}
                    className="text-[var(--purple)] hover:underline text-[9px]"
                  >
                    Save
                  </button>
                </div>
                <div className="text-[9px] text-[var(--text-dim)] space-y-0.5">
                  <div><span className="text-[var(--text-muted)]">Direction:</span> {aiStrategy.direction}</div>
                  <div>
                    <span className="text-[var(--text-muted)]">Entry:</span>{" "}
                    {aiStrategy.entryMode === "after_pattern"
                      ? `+${aiStrategy.entryOffset ?? 1} bar(s) after pattern (${aiStrategy.entryPrice})`
                      : `bar ${aiStrategy.entryBar} (${aiStrategy.entryPrice})`}
                  </div>
                  {(aiStrategy.stopPoints > 0 || aiStrategy.stopAtr) && (
                    <div><span className="text-[var(--text-muted)]">Stop:</span> {aiStrategy.stopAtr ? `${aiStrategy.stopAtr}× ATR(${aiStrategy.atrLength ?? 14})` : `${aiStrategy.stopPoints} pts`}</div>
                  )}
                  {(aiStrategy.targetPoints > 0 || aiStrategy.targetAtr) && (
                    <div><span className="text-[var(--text-muted)]">Target:</span> {aiStrategy.targetAtr ? `${aiStrategy.targetAtr}× ATR(${aiStrategy.atrLength ?? 14})` : `${aiStrategy.targetPoints} pts`}</div>
                  )}
                  <div><span className="text-[var(--text-muted)]">Conditions:</span></div>
                  {aiStrategy.conditions.map((c, i) => (
                    <div key={i} className="pl-2 text-[var(--text-dim)]">
                      <span className="text-[var(--text-muted)]">{c.type.replace(/_/g, " ")}</span>
                      {c.search
                        ? ` — find #${c.search.occurrence ?? 1} in bars ${c.search.fromBar ?? 0}-${c.search.toBar ?? 77}`
                        : c.barIndex != null ? ` (bar ${c.barIndex})` : ""}
                      {c.value != null ? ` [${c.value}]` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI results */}
            {aiResult && (
              <ResultsPanel
                result={aiResult}
                isViewingSaved={false}
                showTrades={showAiTrades}
                onToggleTrades={() => setShowAiTrades(t => !t)}
              />
            )}

            {/* Specific Backtests (saved custom strategies) */}
            {customStrategies.length > 0 && (
              <div className="border border-[var(--border)] rounded bg-[var(--bg)] overflow-hidden">
                <div className="px-2 py-1 bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <span className="font-semibold text-[var(--purple)] text-[9px] uppercase tracking-wide">
                    Specific Backtests ({customStrategies.length})
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {customStrategies.map(cs => (
                    <div
                      key={cs.id}
                      className={`px-2 py-1 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] ${
                        viewingCustom?.id === cs.id ? "bg-[var(--purple)]/10" : ""
                      }`}
                      onClick={() => handleRunSavedCustom(cs)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-muted)] truncate">{cs.name}</div>
                          <div className="text-[9px] text-[var(--text-dim)] truncate italic">{cs.description}</div>
                          <div className="text-[9px] text-[var(--text-dim)]">
                            {cs.direction} | {cs.entryMode === "after_pattern" ? `+${cs.entryOffset ?? 1} after pattern` : `bar ${cs.entryBar}`} | {cs.conditions.length} rules
                            {cs.stopPoints > 0 ? ` | SL ${cs.stopPoints}` : ""}
                            {cs.targetPoints > 0 ? ` | TP ${cs.targetPoints}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteCustom(cs.id); }}
                          className="text-[var(--red)] opacity-40 hover:opacity-100 text-[9px] ml-2"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared results panel ──
function ResultsPanel({
  result,
  isViewingSaved,
  showTrades,
  onToggleTrades,
  onSave,
}: {
  result: StrategyResult;
  isViewingSaved: boolean;
  showTrades: boolean;
  onToggleTrades: () => void;
  onSave?: () => void;
}) {
  return (
    <div className="border border-[var(--border)] rounded bg-[var(--bg)] overflow-hidden">
      <div className="px-2 py-1 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <span className="font-semibold text-[var(--text-muted)]">
          {isViewingSaved ? "Saved" : "Results"}: {result.strategyLabel}
        </span>
        <div className="flex gap-1">
          {onSave && (
            <button onClick={onSave} className="text-[var(--accent)] hover:underline text-[9px]">Save</button>
          )}
          <button onClick={onToggleTrades} className="text-[var(--text-dim)] hover:underline text-[9px]">
            {showTrades ? "Hide" : "Trades"}
          </button>
        </div>
      </div>

      <div className="p-2 space-y-1">
        <div className="grid grid-cols-3 gap-1">
          <StatBox label="Trades" value={String(result.totalTrades)} />
          <StatBox label="Win Rate" value={`${result.winRate.toFixed(1)}%`} color={result.winRate >= 50 ? "g" : "r"} />
          <StatBox label="Avg P&L" value={`${result.avgPnlPoints >= 0 ? "+" : ""}${result.avgPnlPoints.toFixed(1)} pts`} color={result.avgPnlPoints >= 0 ? "g" : "r"} />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <StatBox label="Total P&L" value={`${result.totalPnlPoints >= 0 ? "+" : ""}${result.totalPnlPoints.toFixed(1)}`} color={result.totalPnlPoints >= 0 ? "g" : "r"} />
          <StatBox label="Profit Factor" value={result.profitFactor === Infinity ? "∞" : result.profitFactor.toFixed(2)} color={result.profitFactor >= 1 ? "g" : "r"} />
          <StatBox label="Median" value={`${result.medianPnlPoints >= 0 ? "+" : ""}${result.medianPnlPoints.toFixed(1)}`} color={result.medianPnlPoints >= 0 ? "g" : "r"} />
        </div>
        <div className="grid grid-cols-4 gap-1">
          <StatBox label="Avg Win" value={`+${result.avgWin.toFixed(1)}`} color="g" />
          <StatBox label="Avg Loss" value={`-${result.avgLoss.toFixed(1)}`} color="r" />
          <StatBox label="Max Win" value={`+${result.maxWin.toFixed(1)}`} color="g" />
          <StatBox label="Max Loss" value={result.maxLoss.toFixed(1)} color="r" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <StatBox label="Winners" value={String(result.winners)} color="g" />
          <StatBox label="Losers" value={String(result.losers)} color="r" />
          <StatBox label="Avg Hold" value={`${result.avgHoldBars.toFixed(0)} bars`} />
        </div>

        <div className="text-[9px] text-[var(--text-dim)] pt-1 border-t border-[var(--border)]">
          Filter: {result.filterDescription} ({result.totalDays} days)
        </div>

        {/* Equity Curve */}
        {result.trades.length >= 2 && <EquityCurve trades={result.trades} />}

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
                {result.trades.map((t, i) => (
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
  );
}

// ── Equity Curve (cumulative P&L in points) ──
function EquityCurve({ trades }: { trades: TradeResult[] }) {
  const W = 280;
  const H = 80;
  const PAD_X = 32;
  const PAD_Y = 8;
  const plotW = W - PAD_X - 4;
  const plotH = H - PAD_Y * 2;

  // Build cumulative series
  const cumulative: number[] = [0];
  let running = 0;
  for (const t of trades) {
    running += t.pnlPoints;
    cumulative.push(running);
  }

  const minVal = Math.min(...cumulative);
  const maxVal = Math.max(...cumulative);
  const range = maxVal - minVal || 1;

  const toX = (i: number) => PAD_X + (i / (cumulative.length - 1)) * plotW;
  const toY = (v: number) => PAD_Y + plotH - ((v - minVal) / range) * plotH;

  // Build the line path
  const linePath = cumulative.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  // Fill area under the curve (gradient from line to bottom)
  const fillPath = linePath
    + ` L${toX(cumulative.length - 1).toFixed(1)},${toY(0).toFixed(1)}`
    + ` L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`;

  const finalVal = cumulative[cumulative.length - 1];
  const isPositive = finalVal >= 0;
  const lineColor = isPositive ? "var(--green)" : "var(--red)";

  // Axis labels
  const zeroY = toY(0);
  const showZeroLine = minVal < 0 && maxVal > 0;

  return (
    <div className="border-t border-[var(--border)] pt-1 mt-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[8px] text-[var(--text-dim)] uppercase tracking-wide">Equity Curve (pts)</span>
        <span className={`text-[9px] font-mono font-semibold ${isPositive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {isPositive ? "+" : ""}{finalVal.toFixed(1)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero line */}
        {showZeroLine && (
          <line
            x1={PAD_X} y1={zeroY} x2={W - 4} y2={zeroY}
            stroke="var(--text-dim)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"
          />
        )}

        {/* Fill under curve */}
        <path d={fillPath} fill="url(#eqFillGrad)" />

        {/* Equity line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* End dot */}
        <circle cx={toX(cumulative.length - 1)} cy={toY(finalVal)} r="2.5" fill={lineColor} />

        {/* Y-axis labels */}
        <text x={PAD_X - 2} y={PAD_Y + 3} textAnchor="end" fontSize="7" fill="var(--text-dim)" fontFamily="monospace">
          {maxVal >= 0 ? "+" : ""}{maxVal.toFixed(0)}
        </text>
        <text x={PAD_X - 2} y={H - PAD_Y + 1} textAnchor="end" fontSize="7" fill="var(--text-dim)" fontFamily="monospace">
          {minVal >= 0 ? "+" : ""}{minVal.toFixed(0)}
        </text>
        {showZeroLine && (
          <text x={PAD_X - 2} y={zeroY + 2} textAnchor="end" fontSize="7" fill="var(--text-dim)" fontFamily="monospace" opacity="0.6">
            0
          </text>
        )}
      </svg>
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
