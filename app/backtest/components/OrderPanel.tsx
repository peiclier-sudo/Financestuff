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
}: Props) {
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const currentPrice = currentBar?.close ?? 0;

  // Session summary (all trades across all days)
  const totalPnl = sessionTrades.reduce((sum, t) => sum + t.pnlPoints, 0);
  const winners = sessionTrades.filter((t) => t.pnlPoints > 0).length;
  const winRate = sessionTrades.length > 0 ? (winners / sessionTrades.length) * 100 : 0;

  // Unrealized P&L
  const unrealizedPnl = positions.reduce((sum, p) => {
    const mult = p.direction === "long" ? 1 : -1;
    return sum + (currentPrice - p.entryPrice) * mult;
  }, 0);

  return (
    <div className="space-y-3 text-[11px]">
      {/* Session Summary */}
      <div className="flex gap-3">
        <div className="flex-1 text-center p-1.5 rounded-lg" style={{ background: "var(--surface)" }}>
          <div className="text-[9px] text-[var(--text-dim)]">Trades</div>
          <div className="font-semibold text-[var(--text)]">{sessionTrades.length}</div>
        </div>
        <div className="flex-1 text-center p-1.5 rounded-lg" style={{ background: "var(--surface)" }}>
          <div className="text-[9px] text-[var(--text-dim)]">Win Rate</div>
          <div className="font-semibold" style={{ color: winRate >= 50 ? "var(--green)" : "var(--red)" }}>
            {closedTrades.length > 0 ? `${winRate.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="flex-1 text-center p-1.5 rounded-lg" style={{ background: "var(--surface)" }}>
          <div className="text-[9px] text-[var(--text-dim)]">P&L</div>
          <div className="font-mono font-semibold" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
            {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <div>
          <h3 className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1.5">Open Positions</h3>
          <div className="space-y-1">
            {positions.map((p) => {
              const mult = p.direction === "long" ? 1 : -1;
              const pnl = (currentPrice - p.entryPrice) * mult;
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-[10px] font-bold" style={{ color: p.direction === "long" ? "var(--green)" : "var(--red)" }}>
                    {p.direction === "long" ? "LONG" : "SHORT"}
                  </span>
                  <span className="font-mono text-[var(--text-secondary)]">{p.entryPrice.toFixed(1)}</span>
                  <span className="font-mono font-semibold" style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() => {
                        const val = prompt("Stop Loss price:", p.stopLoss?.toFixed(1) ?? "");
                        if (val !== null) onUpdatePositionSL(p.id, val ? parseFloat(val) : null);
                      }}
                      className="text-[8px] px-1.5 py-0.5 rounded text-[var(--red)] hover:bg-[var(--red-dim)]"
                      title="Edit SL"
                    >SL</button>
                    <button
                      onClick={() => {
                        const val = prompt("Take Profit price:", p.takeProfit?.toFixed(1) ?? "");
                        if (val !== null) onUpdatePositionTP(p.id, val ? parseFloat(val) : null);
                      }}
                      className="text-[8px] px-1.5 py-0.5 rounded text-[var(--green)] hover:bg-[var(--green-dim)]"
                      title="Edit TP"
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
                {unrealizedPnl >= 0 ? "+" : ""}{unrealizedPnl.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <div>
          <h3 className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1.5">Pending Orders</h3>
          <div className="space-y-1">
            {pendingOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span className="text-[9px] font-semibold text-[var(--accent)] uppercase">{o.type}</span>
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
          <h3 className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1.5">Trade Log</h3>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {[...sessionTrades].reverse().map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-0.5 text-[10px]">
                <span className="font-bold" style={{ color: t.direction === "long" ? "var(--green)" : "var(--red)" }}>
                  {t.direction === "long" ? "L" : "S"}
                </span>
                <span className="text-[var(--text-dim)]">{t.entryPrice.toFixed(0)}-{t.exitPrice.toFixed(0)}</span>
                <span className="font-mono font-semibold" style={{ color: t.pnlPoints >= 0 ? "var(--green)" : "var(--red)" }}>
                  {t.pnlPoints >= 0 ? "+" : ""}{t.pnlPoints.toFixed(1)}
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
