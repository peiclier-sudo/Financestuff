"use client";

import { Order, Position, ClosedTrade } from "@/lib/backtestTypes";
import { Bar } from "@/lib/types";

interface Props {
  orders: Order[];
  positions: Position[];
  closedTrades: ClosedTrade[];
  sessionTrades: ClosedTrade[];
  currentBar: Bar | null;
  onCancelOrder: (id: string) => void;
  onClosePosition: (id: string) => void;
  onUpdatePositionSL: (id: string, sl: number | null) => void;
  onUpdatePositionTP: (id: string, tp: number | null) => void;
  onUpdateAllSL: (sl: number | null) => void;
  onUpdateAllTP: (tp: number | null) => void;
  onExpandResults: () => void;
  prevDayATR?: number | null;
  tradingSize: number;
}

export default function OrderPanel({
  orders,
  positions,
  closedTrades,
  sessionTrades,
  currentBar,
  onCancelOrder,
  onClosePosition,
  onUpdatePositionSL,
  onUpdatePositionTP,
  onUpdateAllSL,
  onUpdateAllTP,
  onExpandResults,
  prevDayATR,
  tradingSize,
}: Props) {
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const currentPrice = currentBar?.close ?? 0;

  // SL distance = half the previous day's ATR (fallback to 20 if ATR unavailable)
  const slDistance = prevDayATR != null ? Math.round((prevDayATR / 2) * 100) / 100 : 20;

  // Session summary (all trades across all days)
  const totalPnl = sessionTrades.reduce((sum, t) => sum + t.pnlPoints, 0);
  const winners = sessionTrades.filter((t) => t.pnlPoints > 0).length;
  const losers = sessionTrades.filter((t) => t.pnlPoints < 0).length;
  const winRate = sessionTrades.length > 0 ? (winners / sessionTrades.length) * 100 : 0;

  // Avg win / avg loss
  const avgWin = winners > 0
    ? sessionTrades.filter((t) => t.pnlPoints > 0).reduce((s, t) => s + t.pnlPoints, 0) / winners
    : 0;
  const avgLoss = losers > 0
    ? sessionTrades.filter((t) => t.pnlPoints < 0).reduce((s, t) => s + t.pnlPoints, 0) / losers
    : 0;

  // Unrealized P&L (factored by trading size)
  const unrealizedPnl = positions.reduce((sum, p) => {
    const mult = p.direction === "long" ? 1 : -1;
    return sum + (currentPrice - p.entryPrice) * mult * tradingSize;
  }, 0);

  // Equity curve data points (cumulative PnL after each trade)
  const equityCurve: number[] = [];
  let cumPnl = 0;
  for (const t of sessionTrades) {
    cumPnl += t.pnlPoints;
    equityCurve.push(cumPnl);
  }

  // Check if all positions have same SL/TP (for unified button state)
  const allHaveSL = positions.length > 0 && positions.every((p) => p.stopLoss != null);
  const allHaveTP = positions.length > 0 && positions.every((p) => p.takeProfit != null);

  return (
    <div className="space-y-3 text-[11px]">
      {/* Session Summary — clickable to expand */}
      <div className="relative">
        <div className="grid grid-cols-3 gap-2 cursor-pointer group" onClick={onExpandResults}>
          <div className="text-center p-2 rounded-lg transition-colors group-hover:brightness-125" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-label" style={{ fontSize: "8px" }}>Trades</div>
            <div className="text-value font-bold text-[13px] text-[var(--text)]">{sessionTrades.length}</div>
          </div>
          <div className="text-center p-2 rounded-lg transition-colors group-hover:brightness-125" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-label" style={{ fontSize: "8px" }}>Win Rate</div>
            <div className="text-value font-bold text-[13px]" style={{ color: winRate >= 50 ? "var(--green)" : "var(--red)" }}>
              {sessionTrades.length > 0 ? `${winRate.toFixed(0)}%` : "—"}
            </div>
          </div>
          <div className="text-center p-2 rounded-lg transition-colors group-hover:brightness-125" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-label" style={{ fontSize: "8px" }}>P&L</div>
            <div className="text-value font-bold text-[13px] metric-glow" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}
            </div>
          </div>
        </div>
        {/* Expand hint */}
        <button
          onClick={onExpandResults}
          className="absolute -top-1 -right-1 w-5 h-5 rounded flex items-center justify-center text-[9px] transition-all hover:scale-110"
          style={{ background: "rgba(255, 255, 255, 0.08)", color: "rgba(255, 255, 255, 0.6)", border: "1px solid rgba(255, 255, 255, 0.12)" }}
          title="Expand performance dashboard"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 9L9 1M9 1H4M9 1V6" />
          </svg>
        </button>
      </div>

      {/* Avg Win / Avg Loss */}
      {sessionTrades.length > 0 && (
        <div className="flex gap-3">
          <div className="flex-1 text-center p-1 rounded-lg" style={{ background: "var(--surface)" }}>
            <div className="text-[8px] text-[var(--text-dim)]">Avg Win</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--green)" }}>
              {winners > 0 ? `+$${avgWin.toFixed(1)}` : "—"}
            </div>
          </div>
          <div className="flex-1 text-center p-1 rounded-lg" style={{ background: "var(--surface)" }}>
            <div className="text-[8px] text-[var(--text-dim)]">Avg Loss</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--red)" }}>
              {losers > 0 ? `$${avgLoss.toFixed(1)}` : "—"}
            </div>
          </div>
          <div className="flex-1 text-center p-1 rounded-lg" style={{ background: "var(--surface)" }}>
            <div className="text-[8px] text-[var(--text-dim)]">R:R</div>
            <div className="text-[10px] font-mono text-[var(--text)]">
              {winners > 0 && losers > 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Equity Curve */}
      {equityCurve.length >= 2 && (
        <div>
          <h3 className="text-label mb-1">Equity Curve</h3>
          <EquityCurve data={equityCurve} />
        </div>
      )}

      {/* Open Positions */}
      {positions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-label">Open Positions</h3>
            {positions.length > 1 && (
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (allHaveSL) {
                      onUpdateAllSL(null);
                    } else {
                      const avgEntry = positions.reduce((s, p) => s + p.entryPrice, 0) / positions.length;
                      const isLong = positions[0].direction === "long";
                      onUpdateAllSL(Math.round((isLong ? avgEntry - slDistance : avgEntry + slDistance) * 100) / 100);
                    }
                  }}
                  className="text-[7px] px-1 py-0.5 rounded transition-colors"
                  style={{
                    color: allHaveSL ? "#0d1117" : "var(--red)",
                    background: allHaveSL ? "var(--red)" : "transparent",
                    border: "1px solid var(--red)",
                  }}
                >ALL SL</button>
                <button
                  onClick={() => {
                    if (allHaveTP) {
                      onUpdateAllTP(null);
                    } else {
                      const avgEntry = positions.reduce((s, p) => s + p.entryPrice, 0) / positions.length;
                      const isLong = positions[0].direction === "long";
                      onUpdateAllTP(Math.round((isLong ? avgEntry + slDistance : avgEntry - slDistance) * 100) / 100);
                    }
                  }}
                  className="text-[7px] px-1 py-0.5 rounded transition-colors"
                  style={{
                    color: allHaveTP ? "#0d1117" : "var(--green)",
                    background: allHaveTP ? "var(--green)" : "transparent",
                    border: "1px solid var(--green)",
                  }}
                >ALL TP</button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            {positions.map((p) => {
              const mult = p.direction === "long" ? 1 : -1;
              const pnl = (currentPrice - p.entryPrice) * mult * tradingSize;
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-[10px] font-bold" style={{ color: p.direction === "long" ? "var(--green)" : "var(--red)" }}>
                    {p.direction === "long" ? "LONG" : "SHORT"}
                  </span>
                  <span className="font-mono text-[var(--text-secondary)]">{p.entryPrice.toFixed(1)}</span>
                  <span className="font-mono font-semibold" style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() => {
                        if (p.stopLoss != null) {
                          onUpdatePositionSL(p.id, null);
                        } else {
                          const sl = p.direction === "long"
                            ? p.entryPrice - slDistance
                            : p.entryPrice + slDistance;
                          onUpdatePositionSL(p.id, Math.round(sl * 100) / 100);
                        }
                      }}
                      className="text-[8px] px-1.5 py-0.5 rounded transition-colors"
                      style={{
                        color: p.stopLoss != null ? "#0d1117" : "var(--red)",
                        background: p.stopLoss != null ? "var(--red)" : "transparent",
                      }}
                      title={p.stopLoss != null ? `SL @ ${p.stopLoss.toFixed(2)} (click to remove)` : `Add SL (${slDistance.toFixed(1)}pts = ½ ATR, drag to adjust)`}
                    >SL</button>
                    <button
                      onClick={() => {
                        if (p.takeProfit != null) {
                          onUpdatePositionTP(p.id, null);
                        } else {
                          const tp = p.direction === "long"
                            ? p.entryPrice + slDistance
                            : p.entryPrice - slDistance;
                          onUpdatePositionTP(p.id, Math.round(tp * 100) / 100);
                        }
                      }}
                      className="text-[8px] px-1.5 py-0.5 rounded transition-colors"
                      style={{
                        color: p.takeProfit != null ? "#0d1117" : "var(--green)",
                        background: p.takeProfit != null ? "var(--green)" : "transparent",
                      }}
                      title={p.takeProfit != null ? `TP @ ${p.takeProfit.toFixed(2)} (click to remove)` : `Add TP (${slDistance.toFixed(1)}pts = ½ ATR, drag to adjust)`}
                    >TP</button>
                    <button
                      onClick={() => onClosePosition(p.id)}
                      className="text-[8px] px-1.5 py-0.5 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    >Close</button>
                  </div>
                </div>
              );
            })}
            <div className="text-[10px] text-[var(--text-dim)]">
              Unrealized: <span className="font-mono" style={{ color: unrealizedPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <div>
          <h3 className="text-label mb-1.5">Pending Orders</h3>
          <div className="space-y-1">
            {pendingOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase">{o.type}</span>
                <span className="text-[10px] font-bold" style={{ color: o.direction === "long" ? "var(--green)" : "var(--red)" }}>
                  {o.direction === "long" ? "BUY" : "SELL"}
                </span>
                <span className="font-mono text-[var(--text-secondary)]">@{o.price.toFixed(1)}</span>
                {o.stopLoss && <span className="text-[9px] text-[var(--red)]">SL:{o.stopLoss.toFixed(0)}</span>}
                {o.takeProfit && <span className="text-[9px] text-[var(--green)]">TP:{o.takeProfit.toFixed(0)}</span>}
                <button
                  onClick={() => onCancelOrder(o.id)}
                  className="ml-auto text-[10px] text-[var(--text-dim)] hover:text-[var(--red)]"
                >x</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trade Log */}
      {sessionTrades.length > 0 && (
        <div>
          <h3 className="text-label mb-1.5">Trade Log</h3>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {[...sessionTrades].reverse().map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-0.5 text-[10px]">
                <span className="font-bold" style={{ color: t.direction === "long" ? "var(--green)" : "var(--red)" }}>
                  {t.direction === "long" ? "L" : "S"}
                </span>
                <span className="text-[var(--text-dim)]">{t.entryPrice.toFixed(0)}-{t.exitPrice.toFixed(0)}</span>
                <span className="font-mono font-semibold" style={{ color: t.pnlPoints >= 0 ? "var(--green)" : "var(--red)" }}>
                  {t.pnlPoints >= 0 ? "+" : ""}${t.pnlPoints.toFixed(1)}
                </span>
                <span className="text-[var(--text-dim)] text-[9px] uppercase">{t.exitReason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessionTrades.length === 0 && positions.length === 0 && pendingOrders.length === 0 && (
        <div className="text-center text-[var(--text-dim)] text-[10px] py-4">
          <p>No trades yet</p>
          <p className="mt-1">Click on chart to place orders</p>
          <p className="mt-0.5">M = Market Buy, N = Market Sell</p>
        </div>
      )}
    </div>
  );
}

function EquityCurve({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const w = 260;
  const h = 50;
  const pad = 2;

  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  // Zero line y position
  const zeroY = pad + (1 - (0 - min) / range) * (h - 2 * pad);

  const lastValue = data[data.length - 1];
  const color = lastValue >= 0 ? "#3fb950" : "#f85149";

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {/* Zero line */}
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#21262d" strokeWidth="1" strokeDasharray="3,3" />
      {/* Equity line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Fill below line */}
      <polyline
        points={`${pad},${zeroY} ${points} ${pad + ((data.length - 1) / (data.length - 1)) * (w - 2 * pad)},${zeroY}`}
        fill={`${color}15`}
        stroke="none"
      />
    </svg>
  );
}
