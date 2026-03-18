"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TradingDay } from "@/lib/types";
import { StrategyResult, TradeResult } from "@/lib/strategies";
import {
  BlockStrategy, EntryBlock, ExitBlock, TakeProfitBlock, ManagementBlock,
  EntryType, ExitType, TakeProfitType, ManagementType,
  BETriggerType, TrailTriggerType, TrailMethodType,
  DEFAULT_ENTRY, DEFAULT_EXIT, DEFAULT_TP, DEFAULT_MGMT,
  ENTRY_LABELS, EXIT_LABELS, TP_LABELS, MGMT_LABELS,
  runBlockStrategy, buildBlockResult,
  loadBlockStrategies, saveBlockStrategy, deleteBlockStrategy,
} from "@/lib/blockStrategy";

interface Props {
  days: TradingDay[];
  filterDescription: string;
  onResult?: (result: StrategyResult | null) => void;
}

// ══════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════

export default function BlockWorkflow({ days, filterDescription, onResult }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [entry, setEntry] = useState<EntryBlock>({ ...DEFAULT_ENTRY });
  const [exit, setExit] = useState<ExitBlock>({ ...DEFAULT_EXIT });
  const [tp, setTp] = useState<TakeProfitBlock>({ ...DEFAULT_TP });
  const [mgmt, setMgmt] = useState<ManagementBlock>({ ...DEFAULT_MGMT });
  const [confirmed, setConfirmed] = useState([false, false, false, false]);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [running, setRunning] = useState(false);
  const [savedStrategies, setSavedStrategies] = useState<BlockStrategy[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

  // AI assist state per block
  const [aiText, setAiText] = useState(["", "", "", ""]);
  const [aiLoading, setAiLoading] = useState([false, false, false, false]);

  useEffect(() => {
    setSavedStrategies(loadBlockStrategies());
  }, []);

  useEffect(() => {
    onResult?.(result);
  }, [result, onResult]);

  const confirmStep = (step: number) => {
    const next = [...confirmed];
    next[step] = true;
    setConfirmed(next);
    if (step < 3) setActiveStep(step + 1);
  };

  const editStep = (step: number) => {
    setActiveStep(step);
    const next = [...confirmed];
    for (let i = step; i < 4; i++) next[i] = false;
    setConfirmed(next);
    setResult(null);
  };

  const allConfirmed = confirmed.every(Boolean);

  const handleRun = useCallback(() => {
    if (!allConfirmed || days.length === 0) return;
    setRunning(true);
    setTimeout(() => {
      const strategy: BlockStrategy = {
        id: `block_${Date.now()}`,
        name: "Block Strategy",
        description: "",
        entry, exit, takeProfit: tp, management: mgmt,
        timestamp: Date.now(),
      };
      const trades = runBlockStrategy(strategy, days);
      const res = buildBlockResult(trades, strategy, filterDescription, days.length);
      setResult(res);
      setRunning(false);
    }, 10);
  }, [allConfirmed, days, entry, exit, tp, mgmt, filterDescription]);

  const handleSave = useCallback(() => {
    const strategy: BlockStrategy = {
      id: `block_${Date.now()}`,
      name: "Block Strategy",
      description: `${ENTRY_LABELS[entry.type]} + ${EXIT_LABELS[exit.type]} + ${TP_LABELS[tp.type]}`,
      entry, exit, takeProfit: tp, management: mgmt,
      timestamp: Date.now(),
    };
    setSavedStrategies(saveBlockStrategy(strategy));
  }, [entry, exit, tp, mgmt]);

  const handleLoadSaved = useCallback((strat: BlockStrategy) => {
    setEntry(strat.entry);
    setExit(strat.exit);
    setTp(strat.takeProfit);
    setMgmt(strat.management);
    setConfirmed([true, true, true, true]);
    setActiveStep(3);
    // Run immediately
    setRunning(true);
    setTimeout(() => {
      const trades = runBlockStrategy(strat, days);
      const res = buildBlockResult(trades, strat, filterDescription, days.length);
      setResult(res);
      setRunning(false);
    }, 10);
  }, [days, filterDescription]);

  const handleDeleteSaved = useCallback((id: string) => {
    setSavedStrategies(deleteBlockStrategy(id));
  }, []);

  // AI assist per block
  const handleAiAssist = useCallback(async (step: number) => {
    const text = aiText[step];
    if (!text.trim()) return;
    const blockNames = ["entry", "exit", "takeProfit", "management"];
    const newLoading = [...aiLoading];
    newLoading[step] = true;
    setAiLoading(newLoading);

    try {
      const res = await fetch("/api/parse-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block: blockNames[step], text }),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        if (step === 0) setEntry(data.config as EntryBlock);
        else if (step === 1) setExit(data.config as ExitBlock);
        else if (step === 2) setTp(data.config as TakeProfitBlock);
        else if (step === 3) setMgmt(data.config as ManagementBlock);
      }
    } catch { /* ignore */ }
    finally {
      const nl = [...aiLoading];
      nl[step] = false;
      setAiLoading(nl);
    }
  }, [aiText, aiLoading]);

  const stepLabels = ["Entry Signal", "Stop Loss / Exit", "Take Profit", "Management"];
  const stepColors = ["var(--accent)", "var(--red)", "var(--green)", "var(--purple)"];

  // Block order (drag to reorder)
  const [blockOrder, setBlockOrder] = useState([0, 1, 2, 3]);
  // Expanded state per block
  const [expanded, setExpanded] = useState([true, false, false, false]);
  // Block heights (null = auto)
  const [blockHeights, setBlockHeights] = useState<(number | null)[]>([null, null, null, null]);

  // Drag reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Resize state
  const resizeRef = useRef<{ blockOrderPos: number; startY: number; startH: number } | null>(null);
  const blockContentRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  const toggleExpanded = (blockId: number) => {
    setExpanded(prev => { const n = [...prev]; n[blockId] = !n[blockId]; return n; });
  };

  // Drag handlers
  const handleDragStart = (orderPos: number) => { setDragIdx(orderPos); };
  const handleDragOver = (e: React.DragEvent, orderPos: number) => { e.preventDefault(); setDragOverIdx(orderPos); };
  const handleDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setBlockOrder(prev => {
        const next = [...prev];
        const [item] = next.splice(dragIdx, 1);
        next.splice(dragOverIdx, 0, item);
        return next;
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { blockOrderPos, startY, startH } = resizeRef.current;
      const blockId = blockOrder[blockOrderPos];
      const delta = e.clientY - startY;
      const newH = Math.max(40, startH + delta);
      setBlockHeights(prev => { const n = [...prev]; n[blockId] = newH; return n; });
    };
    const handleMouseUp = () => { resizeRef.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [blockOrder]);

  const startResize = (orderPos: number, e: React.MouseEvent) => {
    e.preventDefault();
    const blockId = blockOrder[orderPos];
    const el = blockContentRefs.current[blockId];
    const currentH = blockHeights[blockId] ?? el?.offsetHeight ?? 100;
    resizeRef.current = { blockOrderPos: orderPos, startY: e.clientY, startH: currentH };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  // Summaries for collapsed view
  const blockSummary = (blockId: number): string => {
    switch (blockId) {
      case 0: return `${ENTRY_LABELS[entry.type]} (${entry.direction})`;
      case 1: return EXIT_LABELS[exit.type] + (exit.type === "fixed_points" ? ` ${exit.points}pts` : "");
      case 2: return TP_LABELS[tp.type] + (tp.type === "risk_multiple" ? ` ${tp.riskMultiple}R` : tp.type === "fixed_points" ? ` ${tp.points}pts` : "");
      case 3: return MGMT_LABELS[mgmt.type];
      default: return "";
    }
  };

  const renderBlockContent = (blockId: number) => {
    switch (blockId) {
      case 0: return <EntryForm entry={entry} setEntry={setEntry} />;
      case 1: return <ExitForm exit={exit} setExit={setExit} />;
      case 2: return <TakeProfitForm tp={tp} setTp={setTp} hasStop={exit.type !== "none"} />;
      case 3: return <ManagementForm mgmt={mgmt} setMgmt={setMgmt} />;
    }
  };

  return (
    <div className="glass-panel overflow-hidden flex flex-col h-full min-w-0 rounded-t-none border-t-0">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-1.5 text-[10px] overflow-y-auto gap-1">
        {/* Blocks */}
        {blockOrder.map((blockId, orderPos) => {
          const isExpanded = expanded[blockId];
          const isDragging = dragIdx === orderPos;
          const isDragOver = dragOverIdx === orderPos && dragIdx !== null && dragIdx !== orderPos;
          const color = stepColors[blockId];
          const isConfirmed = confirmed[blockId];

          return (
            <div
              key={blockId}
              className={`rounded border transition-all flex flex-col ${
                isDragging ? "opacity-40 scale-[0.97]" : ""
              } ${isDragOver ? "border-[var(--accent)] shadow-[0_0_8px_var(--accent)]/20" : "border-[var(--border)]"} ${
                isConfirmed ? "bg-[var(--surface)]/60" : "bg-[var(--bg)]"
              }`}
              draggable
              onDragStart={() => handleDragStart(orderPos)}
              onDragOver={e => handleDragOver(e, orderPos)}
              onDragEnd={handleDragEnd}
            >
              {/* Block header — drag handle + title + controls */}
              <div
                className="flex items-center gap-1.5 px-1.5 py-1 cursor-grab active:cursor-grabbing select-none"
                onClick={() => toggleExpanded(blockId)}
              >
                {/* Drag grip — 3 horizontal lines */}
                <span className="flex-shrink-0 flex flex-col gap-[2px] opacity-30 hover:opacity-70 transition-opacity" style={{ width: 10 }}>
                  <span className="block h-[1px] rounded-full bg-[var(--text-muted)]" />
                  <span className="block h-[1px] rounded-full bg-[var(--text-muted)]" />
                  <span className="block h-[1px] rounded-full bg-[var(--text-muted)]" />
                </span>
                {/* Step badge */}
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 text-white"
                  style={{
                    backgroundColor: isConfirmed ? "var(--green)" : color,
                    boxShadow: `0 0 8px ${isConfirmed ? "rgba(0,230,118,0.25)" : "transparent"}`,
                  }}
                >
                  {isConfirmed ? "\u2713" : blockId + 1}
                </span>
                {/* Label */}
                <span className="text-[9px] font-semibold flex-1 truncate" style={{ color: isExpanded ? color : "var(--text-muted)" }}>
                  {stepLabels[blockId]}
                </span>
                {/* Collapsed summary */}
                {!isExpanded && (
                  <span className="text-[8px] text-[var(--text-dim)] truncate min-w-0 flex-shrink">{blockSummary(blockId)}</span>
                )}
                {/* Confirm button (inline) */}
                {isExpanded && !isConfirmed && (
                  <button
                    onClick={e => { e.stopPropagation(); confirmStep(blockId); }}
                    className="px-1.5 py-0.5 text-[8px] font-semibold rounded text-white flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    OK
                  </button>
                )}
                {/* Confirmed indicator that allows re-edit */}
                {isConfirmed && (
                  <button
                    onClick={e => { e.stopPropagation(); editStep(blockId); setExpanded(prev => { const n = [...prev]; n[blockId] = true; return n; }); }}
                    className="text-[8px] text-[var(--green)] hover:underline flex-shrink-0"
                  >
                    edit
                  </button>
                )}
                {/* Expand chevron */}
                <span className={`text-[8px] text-[var(--text-dim)] transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
              </div>

              {/* Block content */}
              {isExpanded && (
                <div
                  ref={el => { blockContentRefs.current[blockId] = el; }}
                  className="px-1.5 pb-1.5 overflow-y-auto space-y-1.5"
                  style={blockHeights[blockId] != null ? { height: blockHeights[blockId]! } : undefined}
                >
                  {/* AI assist */}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={aiText[blockId]}
                      onChange={e => { const n = [...aiText]; n[blockId] = e.target.value; setAiText(n); }}
                      placeholder={`Describe ${stepLabels[blockId].toLowerCase()}...`}
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text)]"
                      onKeyDown={e => { if (e.key === "Enter") handleAiAssist(blockId); }}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); handleAiAssist(blockId); }}
                      disabled={aiLoading[blockId] || !aiText[blockId].trim()}
                      className="px-1.5 py-0.5 text-[8px] font-semibold rounded border border-[var(--purple)]/40 text-[var(--purple)] hover:bg-[var(--purple)]/10 disabled:opacity-40"
                    >
                      {aiLoading[blockId] ? "..." : "AI"}
                    </button>
                  </div>

                  {/* Block form */}
                  {renderBlockContent(blockId)}

                  {/* Warnings */}
                  {blockId === 1 && exit.type === "none" && (
                    <div className="text-[9px] text-[var(--yellow,orange)] bg-[var(--yellow,orange)]/10 rounded px-2 py-1 border border-[var(--yellow,orange)]/20">
                      No stop — R:R unavailable.
                    </div>
                  )}
                  {blockId === 2 && tp.type === "risk_multiple" && exit.type === "none" && (
                    <div className="text-[9px] text-[var(--red)] bg-[var(--red)]/10 rounded px-2 py-1 border border-[var(--red)]/20">
                      Risk multiple needs a stop loss.
                    </div>
                  )}
                </div>
              )}

              {/* Resize handle */}
              {isExpanded && (
                <div
                  className="h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-[var(--accent)]/10 transition-colors rounded-b"
                  onMouseDown={e => startResize(orderPos, e)}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="w-8 h-[2px] rounded-full bg-[var(--border-bright)] opacity-40 hover:opacity-100" />
                </div>
              )}
            </div>
          );
        })}

        {/* Run section */}
        {allConfirmed && (
          <div className="flex-shrink-0 space-y-1">
            <div className="flex gap-1">
              <button onClick={handleRun} disabled={running || days.length === 0} className="flex-1 btn-primary py-1.5">
                {running ? "Running..." : `Run (${days.length} days)`}
              </button>
              {result && (
                <button onClick={handleSave} className="px-2 py-1.5 text-[9px] border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)]/10">Save</button>
              )}
            </div>
          </div>
        )}

        {/* Saved strategies */}
        {savedStrategies.length > 0 && (
          <div className="flex-shrink-0 border border-[var(--border)] rounded bg-[var(--bg)] overflow-hidden">
            <div className="px-2 py-0.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
              <span className="font-semibold text-[var(--text-dim)] text-[8px] uppercase tracking-wide">Saved ({savedStrategies.length})</span>
            </div>
            <div className="max-h-16 overflow-y-auto">
              {savedStrategies.map(s => (
                <div key={s.id} className="px-2 py-0.5 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] flex items-center justify-between text-[9px]" onClick={() => handleLoadSaved(s)}>
                  <span className="text-[var(--text-muted)] truncate flex-1">{s.description || s.name}</span>
                  <button onClick={e => { e.stopPropagation(); handleDeleteSaved(s.id); }} className="text-[var(--red)] opacity-40 hover:opacity-100 ml-1">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="flex-shrink-0">
            <ResultsPanel result={result} showTrades={showTrades} onToggleTrades={() => setShowTrades(t => !t)} onExpand={() => setShowModal(true)} />
          </div>
        )}
      </div>

      {/* Modal overlay */}
      {showModal && result && <ResultsModal result={result} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Block Forms
// ══════════════════════════════════════════════════════════

function EntryForm({ entry, setEntry }: { entry: EntryBlock; setEntry: (e: EntryBlock) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
        <div>
          <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Entry Type</label>
          <select
            value={entry.type}
            onChange={e => setEntry({ ...DEFAULT_ENTRY, type: e.target.value as EntryType, direction: entry.direction })}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]"
          >
            {Object.entries(ENTRY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Direction</label>
          <select
            value={entry.direction}
            onChange={e => setEntry({ ...entry, direction: e.target.value as "long" | "short" | "auto" })}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]"
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      </div>

      {entry.type === "candle_breakout" && (
        <div className="grid grid-cols-3 gap-1">
          <NumField label="Start bar" value={entry.candleStart ?? 0} onChange={v => setEntry({ ...entry, candleStart: v })} min={0} max={77} />
          <NumField label="End bar" value={entry.candleEnd ?? 4} onChange={v => setEntry({ ...entry, candleEnd: v })} min={0} max={77} />
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Break side</label>
            <select value={entry.breakSide ?? "high"} onChange={e => setEntry({ ...entry, breakSide: e.target.value as "high" | "low" })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      )}

      {entry.type === "level_breakout" && (
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Level</label>
            <select value={entry.level ?? "day_open"} onChange={e => setEntry({ ...entry, level: e.target.value as EntryBlock["level"] })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="day_open">Day Open</option>
              <option value="prev_close">Prev Close</option>
              <option value="prev_day_high">Prev Day High</option>
              <option value="prev_day_low">Prev Day Low</option>
              <option value="opening_range_high">OR High</option>
              <option value="opening_range_low">OR Low</option>
            </select>
          </div>
          {(entry.level === "opening_range_high" || entry.level === "opening_range_low") && (
            <NumField label="OR bars" value={entry.orBars ?? 6} onChange={v => setEntry({ ...entry, orBars: v })} min={1} max={24} />
          )}
        </div>
      )}

      {entry.type === "candle_close" && (
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <NumField label="Close bar #" value={entry.closeBar ?? 0} onChange={v => setEntry({ ...entry, closeBar: v })} min={0} max={77} />
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Close dir</label>
            <select value={entry.closeDirection ?? "any"} onChange={e => setEntry({ ...entry, closeDirection: e.target.value as "bullish" | "bearish" | "any" })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="any">Any</option>
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
            </select>
          </div>
        </div>
      )}

      {entry.type === "time_entry" && (
        <NumField label="Entry bar # (0=9:30)" value={entry.entryBar ?? 0} onChange={v => setEntry({ ...entry, entryBar: v })} min={0} max={77} />
      )}

      {entry.type === "pattern_entry" && (
        <div className="space-y-1">
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Pattern</label>
            <select value={entry.pattern ?? "inside_bar"} onChange={e => setEntry({ ...entry, pattern: e.target.value })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="inside_bar">Inside Bar</option>
              <option value="outside_bar">Outside Bar</option>
              <option value="engulfing_bullish">Engulfing Bullish</option>
              <option value="engulfing_bearish">Engulfing Bearish</option>
              <option value="doji">Doji</option>
              <option value="hammer">Hammer</option>
              <option value="shooting_star">Shooting Star</option>
              <option value="bullish">Bullish Candle</option>
              <option value="bearish">Bearish Candle</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <NumField label="From bar" value={entry.searchFrom ?? 0} onChange={v => setEntry({ ...entry, searchFrom: v })} min={0} max={77} />
            <NumField label="To bar" value={entry.searchTo ?? 77} onChange={v => setEntry({ ...entry, searchTo: v })} min={0} max={77} />
            <NumField label="Occurrence" value={entry.occurrence ?? 1} onChange={v => setEntry({ ...entry, occurrence: v })} min={1} max={10} />
          </div>
          <NumField label="Entry offset (bars after pattern)" value={entry.entryOffset ?? 1} onChange={v => setEntry({ ...entry, entryOffset: v })} min={0} max={20} />
        </div>
      )}

      {entry.type === "atr_breakout" && (
        <div className="grid grid-cols-3 gap-1">
          <NumField label="ATR ×" value={entry.atrMultiplier ?? 1.5} onChange={v => setEntry({ ...entry, atrMultiplier: v })} min={0.1} max={10} step={0.1} />
          <NumField label="ATR length" value={entry.atrLength ?? 14} onChange={v => setEntry({ ...entry, atrLength: v })} min={1} max={50} />
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Side</label>
            <select value={entry.atrSide ?? "above"} onChange={e => setEntry({ ...entry, atrSide: e.target.value as "above" | "below" })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function ExitForm({ exit, setExit }: { exit: ExitBlock; setExit: (e: ExitBlock) => void }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Stop Loss Type</label>
        <select
          value={exit.type}
          onChange={e => setExit({ ...DEFAULT_EXIT, type: e.target.value as ExitType })}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]"
        >
          {Object.entries(EXIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {exit.type === "fixed_points" && (
        <NumField label="Stop points" value={exit.points ?? 30} onChange={v => setExit({ ...exit, points: v })} min={1} max={500} step={5} />
      )}

      {exit.type === "candle_extremity" && (
        <div className="space-y-1">
          <div>
            <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Reference</label>
            <select value={exit.candleRef ?? "prev"} onChange={e => setExit({ ...exit, candleRef: e.target.value as "entry" | "prev" | "group" })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
              <option value="entry">Entry candle</option>
              <option value="prev">Previous candle (N-1)</option>
              <option value="group">Group of candles</option>
            </select>
          </div>
          {exit.candleRef === "group" && (
            <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <NumField label="Group start" value={exit.groupStart ?? 0} onChange={v => setExit({ ...exit, groupStart: v })} min={0} max={77} />
              <NumField label="Group end" value={exit.groupEnd ?? 4} onChange={v => setExit({ ...exit, groupEnd: v })} min={0} max={77} />
            </div>
          )}
          <NumField label="Padding (pts)" value={exit.padding ?? 0} onChange={v => setExit({ ...exit, padding: v })} min={0} max={50} step={1} />
        </div>
      )}

      {exit.type === "atr" && (
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <NumField label="ATR ×" value={exit.atrMultiplier ?? 1.5} onChange={v => setExit({ ...exit, atrMultiplier: v })} min={0.1} max={10} step={0.1} />
          <NumField label="ATR length" value={exit.atrLength ?? 14} onChange={v => setExit({ ...exit, atrLength: v })} min={1} max={50} />
        </div>
      )}

      {exit.type === "level" && (
        <div>
          <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Level</label>
          <select value={exit.levelType ?? "prev_close"} onChange={e => setExit({ ...exit, levelType: e.target.value as ExitBlock["levelType"] })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
            <option value="prev_close">Prev Close</option>
            <option value="prev_day_high">Prev Day High</option>
            <option value="prev_day_low">Prev Day Low</option>
            <option value="day_open">Day Open</option>
          </select>
        </div>
      )}

      {exit.type === "prev_day_range" && (
        <NumField label="Range ×" value={exit.rangeMultiplier ?? 0.5} onChange={v => setExit({ ...exit, rangeMultiplier: v })} min={0.1} max={5} step={0.1} />
      )}
    </div>
  );
}

function TakeProfitForm({ tp, setTp, hasStop }: { tp: TakeProfitBlock; setTp: (t: TakeProfitBlock) => void; hasStop: boolean }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Target Type</label>
        <select
          value={tp.type}
          onChange={e => setTp({ ...DEFAULT_TP, type: e.target.value as TakeProfitType })}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]"
        >
          {Object.entries(TP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {tp.type === "fixed_points" && (
        <NumField label="Target points" value={tp.points ?? 50} onChange={v => setTp({ ...tp, points: v })} min={1} max={1000} step={5} />
      )}

      {tp.type === "risk_multiple" && (
        <NumField label="Risk multiple" value={tp.riskMultiple ?? 2} onChange={v => setTp({ ...tp, riskMultiple: v })} min={0.5} max={20} step={0.5} />
      )}

      {tp.type === "prev_day_level" && (
        <div>
          <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Level</label>
          <select value={tp.levelType ?? "prev_day_high"} onChange={e => setTp({ ...tp, levelType: e.target.value as TakeProfitBlock["levelType"] })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
            <option value="prev_day_high">Prev Day High</option>
            <option value="prev_day_low">Prev Day Low</option>
            <option value="prev_close">Prev Close</option>
            <option value="day_open">Day Open</option>
            <option value="prev_day_gap">Gap Fill (Prev Close)</option>
          </select>
        </div>
      )}

      {tp.type === "atr" && (
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <NumField label="ATR ×" value={tp.atrMultiplier ?? 2} onChange={v => setTp({ ...tp, atrMultiplier: v })} min={0.1} max={10} step={0.1} />
          <NumField label="ATR length" value={tp.atrLength ?? 14} onChange={v => setTp({ ...tp, atrLength: v })} min={1} max={50} />
        </div>
      )}

      {tp.type === "hold_bars" && (
        <NumField label="Hold N bars" value={tp.holdBars ?? 12} onChange={v => setTp({ ...tp, holdBars: v })} min={1} max={78} />
      )}
    </div>
  );
}

function ManagementForm({ mgmt, setMgmt }: { mgmt: ManagementBlock; setMgmt: (m: ManagementBlock) => void }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Management Type</label>
        <select
          value={mgmt.type}
          onChange={e => setMgmt({ ...DEFAULT_MGMT, type: e.target.value as ManagementType })}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]"
        >
          {Object.entries(MGMT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {(mgmt.type === "be" || mgmt.type === "be_and_trail") && (
        <div className="border border-[var(--border)] rounded bg-[var(--bg)] p-1.5 space-y-1">
          <span className="text-[8px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Break-Even</span>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <div>
              <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Trigger</label>
              <select value={mgmt.beTrigger ?? "points"} onChange={e => setMgmt({ ...mgmt, beTrigger: e.target.value as BETriggerType })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
                <option value="points">Points</option>
                <option value="risk_multiple">R Multiple</option>
                <option value="level">Level</option>
                <option value="day_open">Day Open</option>
              </select>
            </div>
            {(mgmt.beTrigger === "points" || mgmt.beTrigger === "risk_multiple" || !mgmt.beTrigger) && (
              <NumField
                label={mgmt.beTrigger === "risk_multiple" ? "R ×" : "Points"}
                value={mgmt.beValue ?? 20}
                onChange={v => setMgmt({ ...mgmt, beValue: v })}
                min={0} max={mgmt.beTrigger === "risk_multiple" ? 10 : 500}
                step={mgmt.beTrigger === "risk_multiple" ? 0.5 : 5}
              />
            )}
            {mgmt.beTrigger === "level" && (
              <div>
                <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Level</label>
                <select value={mgmt.beLevel ?? "prev_day_high"} onChange={e => setMgmt({ ...mgmt, beLevel: e.target.value as ManagementBlock["beLevel"] })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
                  <option value="prev_day_high">Prev Day High</option>
                  <option value="prev_day_low">Prev Day Low</option>
                  <option value="prev_close">Prev Close</option>
                  <option value="day_open">Day Open</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {(mgmt.type === "trail" || mgmt.type === "be_and_trail") && (
        <div className="border border-[var(--border)] rounded bg-[var(--bg)] p-1.5 space-y-1">
          <span className="text-[8px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Trail Stop</span>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <div>
              <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Trigger</label>
              <select value={mgmt.trailTrigger ?? "points"} onChange={e => setMgmt({ ...mgmt, trailTrigger: e.target.value as TrailTriggerType })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
                <option value="points">Points</option>
                <option value="risk_multiple">R Multiple</option>
                <option value="level">Level</option>
              </select>
            </div>
            {mgmt.trailTrigger !== "level" && (
              <NumField
                label={mgmt.trailTrigger === "risk_multiple" ? "R ×" : "Points"}
                value={mgmt.trailTriggerValue ?? 20}
                onChange={v => setMgmt({ ...mgmt, trailTriggerValue: v })}
                min={0} max={mgmt.trailTrigger === "risk_multiple" ? 10 : 500}
                step={mgmt.trailTrigger === "risk_multiple" ? 0.5 : 5}
              />
            )}
            {mgmt.trailTrigger === "level" && (
              <div>
                <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Level</label>
                <select value={mgmt.trailTriggerLevel ?? "prev_day_high"} onChange={e => setMgmt({ ...mgmt, trailTriggerLevel: e.target.value as ManagementBlock["trailTriggerLevel"] })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
                  <option value="prev_day_high">Prev Day High</option>
                  <option value="prev_day_low">Prev Day Low</option>
                  <option value="prev_close">Prev Close</option>
                  <option value="day_open">Day Open</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <div>
              <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">Method</label>
              <select value={mgmt.trailMethod ?? "candle_hl"} onChange={e => setMgmt({ ...mgmt, trailMethod: e.target.value as TrailMethodType })} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)]">
                <option value="candle_hl">Candle H/L</option>
                <option value="atr">ATR Trail</option>
                <option value="fixed_distance">Fixed Distance</option>
              </select>
            </div>
            <NumField
              label={mgmt.trailMethod === "candle_hl" ? "Lookback bars" : mgmt.trailMethod === "atr" ? "ATR ×" : "Distance (pts)"}
              value={mgmt.trailMethodValue ?? 3}
              onChange={v => setMgmt({ ...mgmt, trailMethodValue: v })}
              min={mgmt.trailMethod === "atr" ? 0.1 : 1}
              max={mgmt.trailMethod === "fixed_distance" ? 500 : mgmt.trailMethod === "atr" ? 10 : 20}
              step={mgmt.trailMethod === "atr" ? 0.1 : 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Shared small components
// ══════════════════════════════════════════════════════════

function NumField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="text-[var(--text-dim)] block text-[9px] mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        min={min} max={max} step={step ?? 1}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] text-[var(--text)] font-mono"
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Results Panel (compact)
// ══════════════════════════════════════════════════════════

function hasRisk(trades: TradeResult[]): boolean {
  return trades.some(t => t.riskPoints && t.riskPoints > 0);
}

function toRR(pnl: number, risk: number): number {
  return risk > 0 ? pnl / risk : 0;
}

function computeRRStats(trades: TradeResult[]) {
  const rr = trades.filter(t => t.riskPoints && t.riskPoints > 0).map(t => toRR(t.pnlPoints, t.riskPoints!));
  if (rr.length === 0) return null;
  const wins = rr.filter(v => v > 0);
  const losses = rr.filter(v => v <= 0);
  const sorted = [...rr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    avg: rr.reduce((a, b) => a + b, 0) / rr.length,
    total: rr.reduce((a, b) => a + b, 0),
    median,
    avgWin: wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
    avgLoss: losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0,
    maxWin: rr.length > 0 ? Math.max(...rr) : 0,
    maxLoss: rr.length > 0 ? Math.min(...rr) : 0,
  };
}

function ResultsPanel({ result, showTrades, onToggleTrades, onExpand }: {
  result: StrategyResult; showTrades: boolean; onToggleTrades: () => void; onExpand: () => void;
}) {
  const [displayMode, setDisplayMode] = useState<"pts" | "rr">("pts");
  const canShowRR = hasRisk(result.trades);
  const rrStats = displayMode === "rr" ? computeRRStats(result.trades) : null;
  const fmt = (v: number, prefix = true) => `${prefix && v >= 0 ? "+" : ""}${v.toFixed(displayMode === "rr" ? 2 : 1)}${displayMode === "rr" ? "R" : ""}`;

  return (
    <div className="glass-panel-sm flex flex-col fade-in">
      <div className="px-2.5 py-1.5 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0" style={{ background: "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]" />
          <span className="font-semibold text-[var(--accent)] text-[10px] tracking-wide">Results</span>
        </div>
        <div className="flex gap-1 items-center">
          {canShowRR && (
            <button
              onClick={() => setDisplayMode(m => m === "pts" ? "rr" : "pts")}
              className={`text-[8px] px-1.5 py-0.5 rounded border transition-all ${
                displayMode === "rr"
                  ? "border-[var(--cyan,var(--accent))] text-[var(--cyan,var(--accent))] bg-[var(--cyan,var(--accent))]/10"
                  : "border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text-muted)]"
              }`}
            >
              R:R
            </button>
          )}
          <button onClick={onToggleTrades} className="text-[var(--text-dim)] hover:underline text-[9px]">
            {showTrades ? "Hide" : "Trades"}
          </button>
          <button onClick={onExpand} className="text-[var(--accent)] hover:underline text-[9px] font-semibold">
            Expand
          </button>
        </div>
      </div>

      <div className="p-2 space-y-1 flex flex-col">
        <div className="space-y-1">
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))" }}>
            <StatBox label="Trades" value={String(result.totalTrades)} />
            <StatBox label="Win Rate" value={`${result.winRate.toFixed(1)}%`} color={result.winRate >= 50 ? "g" : "r"} />
            <StatBox label={displayMode === "rr" ? "Avg R:R" : "Avg P&L"}
              value={displayMode === "rr" && rrStats ? fmt(rrStats.avg) : fmt(result.avgPnlPoints) + (displayMode === "pts" ? " pts" : "")}
              color={(displayMode === "rr" && rrStats ? rrStats.avg : result.avgPnlPoints) >= 0 ? "g" : "r"} />
            <StatBox label={displayMode === "rr" ? "Total R" : "Total P&L"}
              value={displayMode === "rr" && rrStats ? fmt(rrStats.total) : fmt(result.totalPnlPoints)}
              color={(displayMode === "rr" && rrStats ? rrStats.total : result.totalPnlPoints) >= 0 ? "g" : "r"} />
            <StatBox label="PF" value={result.profitFactor === Infinity ? "\u221e" : result.profitFactor.toFixed(2)} color={result.profitFactor >= 1 ? "g" : "r"} />
            <StatBox label="Median"
              value={displayMode === "rr" && rrStats ? fmt(rrStats.median) : fmt(result.medianPnlPoints)}
              color={(displayMode === "rr" && rrStats ? rrStats.median : result.medianPnlPoints) >= 0 ? "g" : "r"} />
          </div>
        </div>

        {result.trades.length >= 2 && <EquityCurve trades={result.trades} displayMode={displayMode} />}

        {showTrades && (
          <div className="max-h-32 overflow-y-auto border-t border-[var(--border)] mt-1 flex-shrink-0">
            <TradesTable trades={result.trades} displayMode={displayMode} />
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Results Modal (expanded window-in-window)
// ══════════════════════════════════════════════════════════

function ResultsModal({ result, onClose }: { result: StrategyResult; onClose: () => void }) {
  const [displayMode, setDisplayMode] = useState<"pts" | "rr">("pts");
  const canShowRR = hasRisk(result.trades);
  const rrStats = displayMode === "rr" ? computeRRStats(result.trades) : null;
  const fmt = (v: number, prefix = true) => `${prefix && v >= 0 ? "+" : ""}${v.toFixed(displayMode === "rr" ? 2 : 1)}${displayMode === "rr" ? "R" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-[var(--bg)] border border-[var(--border-bright)] rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[var(--text)] text-sm">{result.strategyLabel}</span>
            {canShowRR && (
              <div className="flex rounded overflow-hidden border border-[var(--border)]">
                {(["pts", "rr"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setDisplayMode(m)}
                    className={`px-2 py-0.5 text-[10px] font-semibold transition-all ${
                      displayMode === m
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
                    }`}
                  >
                    {m === "pts" ? "pts" : "R"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text)] text-lg font-bold px-2">✕</button>
        </div>

        {/* Stats grid */}
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" }}>
            <StatBoxLg label="Trades" value={String(result.totalTrades)} />
            <StatBoxLg label="Win Rate" value={`${result.winRate.toFixed(1)}%`} color={result.winRate >= 50 ? "g" : "r"} />
            <StatBoxLg label={displayMode === "rr" ? "Avg R:R" : "Avg P&L"}
              value={displayMode === "rr" && rrStats ? fmt(rrStats.avg) : fmt(result.avgPnlPoints) + (displayMode === "pts" ? " pts" : "")}
              color={(displayMode === "rr" && rrStats ? rrStats.avg : result.avgPnlPoints) >= 0 ? "g" : "r"} />
            <StatBoxLg label={displayMode === "rr" ? "Total R" : "Total P&L"}
              value={displayMode === "rr" && rrStats ? fmt(rrStats.total) : fmt(result.totalPnlPoints)}
              color={(displayMode === "rr" && rrStats ? rrStats.total : result.totalPnlPoints) >= 0 ? "g" : "r"} />
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
            <StatBoxLg label="Profit Factor" value={result.profitFactor === Infinity ? "\u221e" : result.profitFactor.toFixed(2)} color={result.profitFactor >= 1 ? "g" : "r"} />
            <StatBoxLg label="Median" value={displayMode === "rr" && rrStats ? fmt(rrStats.median) : fmt(result.medianPnlPoints)} color={(displayMode === "rr" && rrStats ? rrStats.median : result.medianPnlPoints) >= 0 ? "g" : "r"} />
            <StatBoxLg label="Avg Win" value={displayMode === "rr" && rrStats ? `+${rrStats.avgWin.toFixed(2)}R` : `+${result.avgWin.toFixed(1)}`} color="g" />
            <StatBoxLg label="Avg Loss" value={displayMode === "rr" && rrStats ? `-${rrStats.avgLoss.toFixed(2)}R` : `-${result.avgLoss.toFixed(1)}`} color="r" />
            <StatBoxLg label="Avg Hold" value={`${result.avgHoldBars.toFixed(0)} bars`} />
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" }}>
            <StatBoxLg label="Winners" value={String(result.winners)} color="g" />
            <StatBoxLg label="Losers" value={String(result.losers)} color="r" />
            <StatBoxLg label="Max Win" value={displayMode === "rr" && rrStats ? `+${rrStats.maxWin.toFixed(2)}R` : `+${result.maxWin.toFixed(1)}`} color="g" />
            <StatBoxLg label="Max Loss" value={displayMode === "rr" && rrStats ? `${rrStats.maxLoss.toFixed(2)}R` : result.maxLoss.toFixed(1)} color="r" />
          </div>

          <div className="text-[10px] text-[var(--text-dim)] border-t border-[var(--border)] pt-2">
            Filter: {result.filterDescription} ({result.totalDays} days)
          </div>

          {/* Large equity curve */}
          {result.trades.length >= 2 && (
            <div className="h-64">
              <EquityCurveLg trades={result.trades} displayMode={displayMode} />
            </div>
          )}

          {/* Full trades table */}
          <div className="border border-[var(--border)] rounded overflow-hidden">
            <div className="px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
              <span className="font-semibold text-[var(--text-dim)] text-[10px] uppercase tracking-wide">All Trades ({result.trades.length})</span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              <TradesTable trades={result.trades} displayMode={displayMode} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Equity Curve
// ══════════════════════════════════════════════════════════

function EquityCurve({ trades, displayMode = "pts" }: { trades: TradeResult[]; displayMode?: "pts" | "rr" }) {
  const canShowR = hasRisk(trades);
  const [localMode, setLocalMode] = useState<"pts" | "rr">(displayMode);

  const W = 320, H = 180, PAD_X = 36, PAD_Y = 10, PAD_BOTTOM = 16;
  const plotW = W - PAD_X - 8, plotH = H - PAD_Y - PAD_BOTTOM;

  const cumulative: number[] = [0];
  let running = 0;
  for (const t of trades) {
    const val = localMode === "rr" && t.riskPoints && t.riskPoints > 0 ? toRR(t.pnlPoints, t.riskPoints) : t.pnlPoints;
    running += val;
    cumulative.push(running);
  }
  const decimals = localMode === "rr" ? 2 : 0;
  const unit = localMode === "rr" ? "R" : "pts";
  const minVal = Math.min(...cumulative), maxVal = Math.max(...cumulative);
  const range = maxVal - minVal || 1;
  const toX = (i: number) => PAD_X + (i / (cumulative.length - 1)) * plotW;
  const toY = (v: number) => PAD_Y + plotH - ((v - minVal) / range) * plotH;
  const linePath = cumulative.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const zeroClampY = Math.min(toY(0), PAD_Y + plotH);
  const fillPath = linePath + ` L${toX(cumulative.length - 1).toFixed(1)},${zeroClampY.toFixed(1)} L${toX(0).toFixed(1)},${zeroClampY.toFixed(1)} Z`;
  const finalVal = cumulative[cumulative.length - 1];
  const isPositive = finalVal >= 0;
  const lineColor = isPositive ? "var(--green)" : "var(--red)";
  const showZeroLine = minVal < 0 && maxVal > 0;
  const gradId = `eqFill_${isPositive ? "g" : "r"}`;

  let peak = 0, maxDd = 0;
  for (const v of cumulative) { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDd) maxDd = dd; }

  // Grid lines
  const midVal = (maxVal + minVal) / 2;
  const gridLines = [
    { y: toY(maxVal), label: `${maxVal >= 0 ? "+" : ""}${maxVal.toFixed(decimals)}` },
    { y: toY(midVal), label: `${midVal >= 0 ? "+" : ""}${midVal.toFixed(decimals)}` },
    { y: toY(minVal), label: `${minVal >= 0 ? "+" : ""}${minVal.toFixed(decimals)}` },
  ];

  return (
    <div className="border-t border-[var(--border)] pt-1 mt-1 flex flex-col slide-in" style={{ minHeight: 150 }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[var(--text-dim)] uppercase tracking-widest font-semibold">Equity</span>
          {canShowR && (
            <div className="flex rounded overflow-hidden border border-[var(--border)]">
              {(["pts", "rr"] as const).map(m => (
                <button key={m} onClick={() => setLocalMode(m)} className={`px-1 py-0 text-[7px] font-semibold ${localMode === m ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-dim)]"}`}>{m === "pts" ? "pts" : "R"}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[var(--text-dim)]">DD <span className="font-mono text-[var(--red)]">-{maxDd.toFixed(decimals)}</span></span>
          <span className={`text-[9px] font-mono font-bold ${isPositive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
            {isPositive ? "+" : ""}{finalVal.toFixed(localMode === "rr" ? 2 : 1)} {unit}
          </span>
        </div>
      </div>
      <div style={{ height: 120 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line x1={PAD_X} y1={gl.y} x2={W - 8} y2={gl.y} stroke="var(--border)" strokeWidth="0.5" opacity="0.4" />
              <text x={PAD_X - 3} y={gl.y + 3} textAnchor="end" fontSize="7" fill="var(--text-dim)" fontFamily="JetBrains Mono, monospace" opacity="0.6">{gl.label}</text>
            </g>
          ))}
          {/* Zero line */}
          {showZeroLine && <line x1={PAD_X} y1={toY(0)} x2={W - 8} y2={toY(0)} stroke="var(--text-dim)" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.4" />}
          {/* Fill */}
          <path d={fillPath} fill={`url(#${gradId})`} />
          {/* Line */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* Start dot */}
          <circle cx={toX(0)} cy={toY(0)} r="2" fill="var(--text-dim)" opacity="0.5" />
          {/* End dot */}
          <circle cx={toX(cumulative.length - 1)} cy={toY(finalVal)} r="3.5" fill={lineColor} />
          <circle cx={toX(cumulative.length - 1)} cy={toY(finalVal)} r="1.5" fill="white" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

// Large equity curve for modal
function EquityCurveLg({ trades, displayMode = "pts" }: { trades: TradeResult[]; displayMode?: "pts" | "rr" }) {
  const canShowR = hasRisk(trades);
  const [localMode, setLocalMode] = useState<"pts" | "rr">(displayMode);

  const W = 700, H = 250, PAD_X = 50, PAD_Y = 15, PAD_BOTTOM = 25;
  const plotW = W - PAD_X - 15, plotH = H - PAD_Y - PAD_BOTTOM;

  const cumulative: number[] = [0];
  let running = 0;
  for (const t of trades) {
    const val = localMode === "rr" && t.riskPoints && t.riskPoints > 0 ? toRR(t.pnlPoints, t.riskPoints) : t.pnlPoints;
    running += val;
    cumulative.push(running);
  }
  const decimals = localMode === "rr" ? 2 : 0;
  const unit = localMode === "rr" ? "R" : "pts";
  const minVal = Math.min(...cumulative), maxVal = Math.max(...cumulative);
  const range = maxVal - minVal || 1;
  const toX = (i: number) => PAD_X + (i / (cumulative.length - 1)) * plotW;
  const toY = (v: number) => PAD_Y + plotH - ((v - minVal) / range) * plotH;
  const linePath = cumulative.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const zeroClampY = Math.min(toY(0), PAD_Y + plotH);
  const fillPath = linePath + ` L${toX(cumulative.length - 1).toFixed(1)},${zeroClampY.toFixed(1)} L${toX(0).toFixed(1)},${zeroClampY.toFixed(1)} Z`;
  const finalVal = cumulative[cumulative.length - 1];
  const isPositive = finalVal >= 0;
  const lineColor = isPositive ? "var(--green)" : "var(--red)";
  const showZeroLine = minVal < 0 && maxVal > 0;
  const zeroY = toY(0);

  const midVal = (maxVal + minVal) / 2;
  const gridLines = [
    { y: toY(maxVal), label: `${maxVal >= 0 ? "+" : ""}${maxVal.toFixed(decimals)}` },
    { y: toY(midVal), label: `${midVal >= 0 ? "+" : ""}${midVal.toFixed(decimals)}` },
    { y: toY(minVal), label: `${minVal >= 0 ? "+" : ""}${minVal.toFixed(decimals)}` },
  ];

  let peak = 0, maxDd = 0;
  for (const v of cumulative) { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDd) maxDd = dd; }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-widest font-semibold">Equity Curve</span>
          {canShowR && (
            <div className="flex rounded overflow-hidden border border-[var(--border)]">
              {(["pts", "rr"] as const).map(m => (
                <button key={m} onClick={() => setLocalMode(m)} className={`px-2 py-0.5 text-[9px] font-semibold ${localMode === m ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-dim)]"}`}>{m === "pts" ? "pts" : "R"}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[var(--text-dim)]">MaxDD <span className="font-mono text-[var(--red)]">-{maxDd.toFixed(decimals)}</span></span>
          <span className={`text-xs font-mono font-bold ${isPositive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
            {isPositive ? "+" : ""}{finalVal.toFixed(localMode === "rr" ? 2 : 1)} {unit}
          </span>
        </div>
      </div>
      <div className="flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="eqFillModal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line x1={PAD_X} y1={gl.y} x2={W - 15} y2={gl.y} stroke="var(--border)" strokeWidth="0.5" opacity="0.5" />
              <text x={PAD_X - 4} y={gl.y + 3.5} textAnchor="end" fontSize="9" fill="var(--text-dim)" fontFamily="JetBrains Mono, monospace" opacity="0.7">{gl.label}</text>
            </g>
          ))}
          {showZeroLine && <line x1={PAD_X} y1={zeroY} x2={W - 15} y2={zeroY} stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="4,3" opacity="0.5" />}
          <path d={fillPath} fill="url(#eqFillModal)" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={toX(0)} cy={toY(0)} r="2.5" fill="var(--text-dim)" />
          <circle cx={toX(cumulative.length - 1)} cy={toY(finalVal)} r="4" fill={lineColor} />
          <circle cx={toX(cumulative.length - 1)} cy={toY(finalVal)} r="2" fill="white" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Trades Table
// ══════════════════════════════════════════════════════════

function TradesTable({ trades, displayMode }: { trades: TradeResult[]; displayMode: "pts" | "rr" }) {
  return (
    <table className="w-full text-[9px]">
      <thead className="sticky top-0 bg-[var(--surface-2)]">
        <tr>
          <th className="text-left px-1 py-0.5 text-[var(--text-dim)]">Date</th>
          <th className="text-center px-1 py-0.5 text-[var(--text-dim)]">Dir</th>
          <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">Entry</th>
          <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">Exit</th>
          <th className="text-right px-1 py-0.5 text-[var(--text-dim)]">{displayMode === "rr" ? "R:R" : "P&L"}</th>
          <th className="text-center px-1 py-0.5 text-[var(--text-dim)]">Out</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => {
          const pnlDisplay = displayMode === "rr" && t.riskPoints && t.riskPoints > 0 ? toRR(t.pnlPoints, t.riskPoints) : t.pnlPoints;
          const suffix = displayMode === "rr" && t.riskPoints && t.riskPoints > 0 ? "R" : "";
          return (
            <tr key={i} className="border-b border-[var(--border)]">
              <td className="px-1 py-0.5 font-mono text-[var(--text-muted)]">{t.date.slice(5)}</td>
              <td className={`px-1 py-0.5 text-center ${t.direction === "long" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{t.direction === "long" ? "L" : "S"}</td>
              <td className="px-1 py-0.5 text-right font-mono">{t.entryPrice.toFixed(1)}</td>
              <td className="px-1 py-0.5 text-right font-mono">{t.exitPrice.toFixed(1)}</td>
              <td className={`px-1 py-0.5 text-right font-mono font-medium ${pnlDisplay >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                {pnlDisplay >= 0 ? "+" : ""}{pnlDisplay.toFixed(displayMode === "rr" ? 2 : 1)}{suffix}
              </td>
              <td className="px-1 py-0.5 text-center text-[var(--text-dim)]">{t.hitTarget ? "T" : t.hitStop ? "S" : "C"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ══════════════════════════════════════════════════════════
// Stat Boxes
// ══════════════════════════════════════════════════════════

function StatBox({ label, value, color }: { label: string; value: string; color?: "g" | "r" }) {
  const bg = color === "g" ? "rgba(0, 230, 118, 0.04)" : color === "r" ? "rgba(255, 82, 82, 0.04)" : "var(--bg-subtle,var(--bg))";
  const borderC = color === "g" ? "rgba(0, 230, 118, 0.12)" : color === "r" ? "rgba(255, 82, 82, 0.12)" : "var(--border)";
  return (
    <div className="rounded px-1 py-0.5 text-center" style={{ background: bg, border: `1px solid ${borderC}` }}>
      <div className="text-[7px] text-[var(--text-dim)] uppercase tracking-widest font-semibold">{label}</div>
      <div className={`font-mono font-bold text-[9px] ${color === "g" ? "text-[var(--green)]" : color === "r" ? "text-[var(--red)]" : "text-[var(--text)]"}`}>{value}</div>
    </div>
  );
}

function StatBoxLg({ label, value, color }: { label: string; value: string; color?: "g" | "r" }) {
  const bg = color === "g" ? "rgba(0, 230, 118, 0.04)" : color === "r" ? "rgba(255, 82, 82, 0.04)" : "var(--bg-subtle,var(--bg))";
  const borderC = color === "g" ? "rgba(0, 230, 118, 0.12)" : color === "r" ? "rgba(255, 82, 82, 0.12)" : "var(--border)";
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: bg, border: `1px solid ${borderC}` }}>
      <div className="text-[8px] text-[var(--text-dim)] uppercase tracking-widest font-semibold mb-0.5">{label}</div>
      <div className={`font-mono font-bold text-sm ${color === "g" ? "text-[var(--green)]" : color === "r" ? "text-[var(--red)]" : "text-[var(--text)]"}`}>{value}</div>
    </div>
  );
}
