"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesMarker,
  type IPriceLine,
} from "lightweight-charts";
import { Bar } from "@/lib/types";
import { Order, Position, ClosedTrade } from "@/lib/backtestTypes";

interface DragLine {
  id: string;
  type: "sl" | "tp" | "entry";
  positionId?: string;
  orderId?: string;
  price: number;
}

interface Props {
  bars: Bar[];
  revealedCount: number;
  prevClose: number | null;
  orders: Order[];
  positions: Position[];
  closedTrades: ClosedTrade[];
  onPlaceOrder: (price: number, direction: "long" | "short", type: "limit" | "stop" | "market") => void;
  onUpdatePositionSL: (id: string, sl: number | null) => void;
  onUpdatePositionTP: (id: string, tp: number | null) => void;
  onUpdateOrderPrice: (id: string, price: number) => void;
  onUpdateOrderSL: (id: string, sl: number | null) => void;
  onUpdateOrderTP: (id: string, tp: number | null) => void;
}

export default function ReplayChart({
  bars,
  revealedCount,
  prevClose,
  orders,
  positions,
  closedTrades,
  onPlaceOrder,
  onUpdatePositionSL,
  onUpdatePositionTP,
  onUpdateOrderPrice,
  onUpdateOrderSL,
  onUpdateOrderTP,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const [dragging, setDragging] = useState<DragLine | null>(null);
  const lastCrosshairPrice = useRef<number>(0);
  const timeRangeSetRef = useRef(false);
  const prevFirstBarTime = useRef<number>(0);

  const revealedBars = bars.slice(0, revealedCount);
  const currentPrice = revealedBars.length > 0 ? revealedBars[revealedBars.length - 1].close : 0;

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background: { color: "#0d1117" },
        textColor: "#7d8590",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      width: el.clientWidth,
      height: el.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#21262d",
      },
      rightPriceScale: {
        borderColor: "#21262d",
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#58a6ff", width: 1, style: 2, labelBackgroundColor: "#1f6feb" },
        horzLine: { color: "#58a6ff", width: 1, style: 2, labelBackgroundColor: "#1f6feb" },
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb95080",
      wickDownColor: "#f8514980",
    });
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    // Track crosshair price for order placement
    chart.subscribeCrosshairMove((param) => {
      if (param.point && param.seriesData) {
        const priceData = param.seriesData.get(series);
        if (priceData && "close" in priceData) {
          lastCrosshairPrice.current = (priceData as { close: number }).close;
        }
      }
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      timeRangeSetRef.current = false;
    };
  }, []);

  // Update data when revealed bars change
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const data = revealedBars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.setData(data);

    // Remove and re-add price lines
    priceLinesRef.current.forEach((pl) => {
      try { series.removePriceLine(pl); } catch {}
    });
    priceLinesRef.current.clear();

    // Prev close line
    if (prevClose != null && revealedBars.length > 0) {
      const pl = series.createPriceLine({
        price: prevClose,
        color: "#f0883e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev Close",
        axisLabelColor: "#f0883e",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("prevClose", pl);
    }

    // Day open line
    if (revealedBars.length > 0) {
      const pl = series.createPriceLine({
        price: bars[0].open,
        color: "#ffffff60",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Open",
        axisLabelColor: "#ffffff40",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("dayOpen", pl);
    }

    // Order lines
    orders.filter((o) => o.status === "pending").forEach((o) => {
      // Entry
      const entryPl = series.createPriceLine({
        price: o.price,
        color: "#58a6ff",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${o.direction === "long" ? "BUY" : "SELL"} ${o.type.toUpperCase()}`,
        axisLabelColor: "#58a6ff",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set(`order-entry-${o.id}`, entryPl);

      if (o.stopLoss != null) {
        const slPl = series.createPriceLine({
          price: o.stopLoss,
          color: "#f85149",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "SL",
          axisLabelColor: "#f85149",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`order-sl-${o.id}`, slPl);
      }

      if (o.takeProfit != null) {
        const tpPl = series.createPriceLine({
          price: o.takeProfit,
          color: "#3fb950",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "TP",
          axisLabelColor: "#3fb950",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`order-tp-${o.id}`, tpPl);
      }
    });

    // Position lines
    positions.forEach((p) => {
      // Entry
      const entryPl = series.createPriceLine({
        price: p.entryPrice,
        color: p.direction === "long" ? "#3fb950" : "#f85149",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: p.direction === "long" ? "L" : "S",
        axisLabelColor: p.direction === "long" ? "#3fb950" : "#f85149",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set(`pos-entry-${p.id}`, entryPl);

      if (p.stopLoss != null) {
        const slPl = series.createPriceLine({
          price: p.stopLoss,
          color: "#f85149",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "SL",
          axisLabelColor: "#f85149",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`pos-sl-${p.id}`, slPl);
      }

      if (p.takeProfit != null) {
        const tpPl = series.createPriceLine({
          price: p.takeProfit,
          color: "#3fb950",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "TP",
          axisLabelColor: "#3fb950",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`pos-tp-${p.id}`, tpPl);
      }
    });

    // Closed trade markers — only show trades whose times fall within current day's bar range
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    if (closedTrades.length > 0 && revealedBars.length > 0) {
      const dayStart = bars[0].time;
      const dayEnd = bars[bars.length - 1].time;
      for (const t of closedTrades) {
        // Skip trades from other days
        if (t.entryTime < dayStart || t.entryTime > dayEnd) continue;
        const entryIdx = findClosestBarIndex(revealedBars, t.entryTime);
        const exitIdx = findClosestBarIndex(revealedBars, t.exitTime);
        if (entryIdx >= 0 && exitIdx >= 0 && exitIdx < revealedBars.length) {
          markers.push({
            time: revealedBars[entryIdx].time as UTCTimestamp,
            position: t.direction === "long" ? "belowBar" : "aboveBar",
            color: "#58a6ff",
            shape: t.direction === "long" ? "arrowUp" : "arrowDown",
            text: `${t.direction === "long" ? "B" : "S"} ${t.entryPrice.toFixed(0)}`,
          });
          const exitColor = t.pnlPoints >= 0 ? "#3fb950" : "#f85149";
          markers.push({
            time: revealedBars[exitIdx].time as UTCTimestamp,
            position: t.direction === "long" ? "aboveBar" : "belowBar",
            color: exitColor,
            shape: "circle",
            text: `${t.pnlPoints >= 0 ? "+" : ""}${t.pnlPoints.toFixed(1)}`,
          });
        }
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    }
    // Update markers (setMarkers replaces all existing markers)
    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    }

    // Set fixed time range for the entire day — only on new day load
    const firstBarTime = bars.length > 0 ? bars[0].time : 0;
    const isDayChange = firstBarTime !== prevFirstBarTime.current;
    if (isDayChange || !timeRangeSetRef.current) {
      if (bars.length >= 2) {
        chart.timeScale().setVisibleLogicalRange({ from: -1, to: bars.length });
        timeRangeSetRef.current = true;
        prevFirstBarTime.current = firstBarTime;
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, [revealedBars, prevClose, orders, positions, closedTrades, bars]);

  // Handle right-click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price === null) return;

    setContextMenu({ x: e.clientX - rect.left, y, price: price as number });
  }, []);

  // Handle shift+click for quick order
  const handleClick = useCallback((e: React.MouseEvent) => {
    setContextMenu(null);

    if (!e.shiftKey) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price === null) return;

    setContextMenu({ x: e.clientX - rect.left, y, price: price as number });
  }, []);

  // Drag handling for SL/TP lines
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickPrice = series.coordinateToPrice(y);
    if (clickPrice === null) return;

    // Check if click is near any SL/TP line (within 0.05% of asset value)
    const threshold = currentPrice * 0.001;

    // Check position SL/TP lines
    for (const p of positions) {
      if (p.stopLoss != null && Math.abs((clickPrice as number) - p.stopLoss) < threshold) {
        setDragging({ id: p.id, type: "sl", positionId: p.id, price: p.stopLoss });
        e.preventDefault();
        return;
      }
      if (p.takeProfit != null && Math.abs((clickPrice as number) - p.takeProfit) < threshold) {
        setDragging({ id: p.id, type: "tp", positionId: p.id, price: p.takeProfit });
        e.preventDefault();
        return;
      }
    }

    // Check order lines
    for (const o of orders.filter((o) => o.status === "pending")) {
      if (o.stopLoss != null && Math.abs((clickPrice as number) - o.stopLoss) < threshold) {
        setDragging({ id: o.id, type: "sl", orderId: o.id, price: o.stopLoss });
        e.preventDefault();
        return;
      }
      if (o.takeProfit != null && Math.abs((clickPrice as number) - o.takeProfit) < threshold) {
        setDragging({ id: o.id, type: "tp", orderId: o.id, price: o.takeProfit });
        e.preventDefault();
        return;
      }
      if (Math.abs((clickPrice as number) - o.price) < threshold) {
        setDragging({ id: o.id, type: "entry", orderId: o.id, price: o.price });
        e.preventDefault();
        return;
      }
    }
  }, [positions, orders, currentPrice]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const series = seriesRef.current;
    if (!series || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price === null) return;

    const newPrice = Math.round((price as number) * 10) / 10;

    if (dragging.positionId) {
      if (dragging.type === "sl") onUpdatePositionSL(dragging.positionId, newPrice);
      else if (dragging.type === "tp") onUpdatePositionTP(dragging.positionId, newPrice);
    } else if (dragging.orderId) {
      if (dragging.type === "sl") onUpdateOrderSL(dragging.orderId, newPrice);
      else if (dragging.type === "tp") onUpdateOrderTP(dragging.orderId, newPrice);
      else if (dragging.type === "entry") onUpdateOrderPrice(dragging.orderId, newPrice);
    }
  }, [dragging, onUpdatePositionSL, onUpdatePositionTP, onUpdateOrderSL, onUpdateOrderTP, onUpdateOrderPrice]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Order placement from context menu
  const placeFromMenu = useCallback((direction: "long" | "short", type: "limit" | "stop") => {
    if (contextMenu) {
      onPlaceOrder(Math.round(contextMenu.price * 10) / 10, direction, type);
      setContextMenu(null);
    }
  }, [contextMenu, onPlaceOrder]);

  return (
    <div className="relative h-full w-full flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging ? "ns-resize" : "crosshair" }}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-50 glass-panel-sm p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="text-[9px] text-[var(--text-dim)] px-2 py-0.5 font-mono">
            @ {contextMenu.price.toFixed(1)}
          </div>
          <div className="border-t border-[var(--border)] mt-0.5 pt-0.5">
            {contextMenu.price < currentPrice ? (
              <>
                <MenuBtn label="Buy Limit" color="var(--green)" onClick={() => placeFromMenu("long", "limit")} />
                <MenuBtn label="Sell Stop" color="var(--red)" onClick={() => placeFromMenu("short", "stop")} />
              </>
            ) : (
              <>
                <MenuBtn label="Buy Stop" color="var(--green)" onClick={() => placeFromMenu("long", "stop")} />
                <MenuBtn label="Sell Limit" color="var(--red)" onClick={() => placeFromMenu("short", "limit")} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Drag indicator */}
      {dragging && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 text-[9px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: dragging.type === "sl" ? "var(--red-dim)" : dragging.type === "tp" ? "var(--green-dim)" : "var(--accent-dim)",
            color: dragging.type === "sl" ? "var(--red)" : dragging.type === "tp" ? "var(--green)" : "var(--accent)",
            border: `1px solid ${dragging.type === "sl" ? "var(--red)" : dragging.type === "tp" ? "var(--green)" : "var(--accent)"}40`,
          }}>
          Dragging {dragging.type.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function MenuBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left text-[10px] font-semibold px-2 py-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
      style={{ color }}
    >
      {label}
    </button>
  );
}

function findClosestBarIndex(bars: Bar[], targetTime: number): number {
  if (bars.length === 0) return -1;
  let closest = 0;
  let minDiff = Math.abs(bars[0].time - targetTime);
  for (let i = 1; i < bars.length; i++) {
    const diff = Math.abs(bars[i].time - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}
