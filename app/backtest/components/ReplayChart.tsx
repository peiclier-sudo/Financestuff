"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
} from "lightweight-charts";
import { Bar } from "@/lib/types";
import { Order, Position, ClosedTrade } from "@/lib/backtestTypes";

interface DragLine {
  id: string;
  type: "sl" | "tp" | "entry" | "entry-drag";
  positionId?: string;
  orderId?: string;
  price: number;
  direction?: "long" | "short"; // for entry-drag: position direction
  entryPrice?: number; // for entry-drag: original entry price
}

interface TradeLabel {
  id: string;
  time: number;
  price: number;
  text: string;
  detail: string; // hover tooltip: breakdown of individual trades
  color: string;
  bgColor: string;
  above: boolean;
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
  onUpdateAllSL: (sl: number | null) => void;
  onUpdateAllTP: (tp: number | null) => void;
  onUpdateOrderPrice: (id: string, price: number) => void;
  onUpdateOrderSL: (id: string, sl: number | null) => void;
  onUpdateOrderTP: (id: string, tp: number | null) => void;
  prevDayATR: number | null;
  tradingSize: number;
  onTradingSizeChange: (size: number) => void;
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
  onUpdateAllSL,
  onUpdateAllTP,
  onUpdateOrderPrice,
  onUpdateOrderSL,
  onUpdateOrderTP,
  prevDayATR,
  tradingSize,
  onTradingSizeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const [dragging, setDragging] = useState<DragLine | null>(null);
  const [tradeLabels, setTradeLabels] = useState<TradeLabel[]>([]);
  const [labelPositions, setLabelPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const lastCrosshairPrice = useRef<number>(0);
  const timeRangeSetRef = useRef(false);
  const prevFirstBarTime = useRef<number>(0);
  const savedLogicalRange = useRef<{ from: number; to: number } | null>(null);

  const revealedBars = bars.slice(0, revealedCount);
  const currentPrice = revealedBars.length > 0 ? revealedBars[revealedBars.length - 1].close : 0;

  // Compute unified SL/TP: if all positions share the same SL or TP, show as unified
  const unifiedSL = positions.length > 0 && positions.every((p) => p.stopLoss != null && p.stopLoss === positions[0].stopLoss)
    ? positions[0].stopLoss
    : null;
  const unifiedTP = positions.length > 0 && positions.every((p) => p.takeProfit != null && p.takeProfit === positions[0].takeProfit)
    ? positions[0].takeProfit
    : null;

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
        vertLine: { color: "#7d859080", width: 1, style: 2, labelBackgroundColor: "#2a2f3a" },
        horzLine: { color: "#7d859080", width: 1, style: 2, labelBackgroundColor: "#2a2f3a" },
      },
      handleScroll: true,
      handleScale: true,
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
        color: "#7d8590",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev Close",
        axisLabelColor: "#7d8590",
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
      const entryPl = series.createPriceLine({
        price: o.price,
        color: "#ffffff80",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${o.direction === "long" ? "BUY" : "SELL"} ${o.type.toUpperCase()}`,
        axisLabelColor: "#ffffff80",
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

    // Position lines — unified SL/TP when multiple positions share the same value
    const slValues = new Set(positions.filter((p) => p.stopLoss != null).map((p) => p.stopLoss));
    const tpValues = new Set(positions.filter((p) => p.takeProfit != null).map((p) => p.takeProfit));
    const hasUnifiedSL = slValues.size === 1 && positions.length > 1 && positions.every((p) => p.stopLoss != null);
    const hasUnifiedTP = tpValues.size === 1 && positions.length > 1 && positions.every((p) => p.takeProfit != null);

    positions.forEach((p) => {
      // Entry — show direction + unrealized P&L (colored by profit/loss)
      const mult = p.direction === "long" ? 1 : -1;
      const pnl = (currentPrice - p.entryPrice) * mult;
      const pnlColor = pnl >= 0 ? "#3fb950" : "#f85149";
      const pnlStr = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(1)}`;
      const entryPl = series.createPriceLine({
        price: p.entryPrice,
        color: pnlColor,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `${p.direction === "long" ? "L" : "S"} ${pnlStr}`,
        axisLabelColor: pnlColor,
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set(`pos-entry-${p.id}`, entryPl);

      // Only show individual SL/TP if not unified
      if (p.stopLoss != null && !hasUnifiedSL) {
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

      if (p.takeProfit != null && !hasUnifiedTP) {
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

    // Unified SL/TP lines (single line for all positions)
    if (hasUnifiedSL && unifiedSL != null) {
      const slPl = series.createPriceLine({
        price: unifiedSL,
        color: "#f85149",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `SL (${positions.length})`,
        axisLabelColor: "#f85149",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("unified-sl", slPl);
    }
    if (hasUnifiedTP && unifiedTP != null) {
      const tpPl = series.createPriceLine({
        price: unifiedTP,
        color: "#3fb950",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `TP (${positions.length})`,
        axisLabelColor: "#3fb950",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("unified-tp", tpPl);
    }

    // Compute trade labels — only PnL, merge exits on the same bar
    const labels: TradeLabel[] = [];
    if (closedTrades.length > 0 && revealedBars.length > 0) {
      const dayStart = bars[0].time;
      const dayEnd = bars[bars.length - 1].time;

      // Group exits by bar index to merge same-bar exits
      const exitGroups = new Map<number, { trades: ClosedTrade[]; bar: Bar }>();
      for (const t of closedTrades) {
        if (t.entryTime < dayStart || t.entryTime > dayEnd) continue;
        const exitIdx = findClosestBarIndex(revealedBars, t.exitTime);
        if (exitIdx >= 0 && exitIdx < revealedBars.length) {
          const group = exitGroups.get(exitIdx) || { trades: [], bar: revealedBars[exitIdx] };
          group.trades.push(t);
          exitGroups.set(exitIdx, group);
        }
      }

      // Create one label per exit group (merged)
      for (const [, group] of exitGroups) {
        const totalPnl = group.trades.reduce((s, t) => s + t.pnlPoints, 0);
        const color = totalPnl >= 0 ? "#3fb950" : "#f85149";
        // Detail for hover: show each trade's PnL
        const detail = group.trades.length > 1
          ? group.trades.map((t) => `${t.pnlPoints >= 0 ? "+" : ""}$${t.pnlPoints.toFixed(1)}`).join(" + ") + ` = ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(1)}`
          : "";
        labels.push({
          id: `exit-${group.trades.map((t) => t.id).join("-")}`,
          time: group.bar.time,
          price: totalPnl >= 0 ? group.bar.high : group.bar.low,
          text: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(1)}`,
          detail,
          color,
          bgColor: totalPnl >= 0 ? "rgba(63, 185, 80, 0.1)" : "rgba(248, 81, 73, 0.1)",
          above: totalPnl >= 0,
        });
      }
    }
    setTradeLabels(labels);

    // Update label pixel positions
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const label of labels) {
      const x = chart.timeScale().timeToCoordinate(label.time as UTCTimestamp);
      const y = series.priceToCoordinate(label.price);
      if (x !== null && y !== null) {
        newPositions.set(label.id, { x: x as number, y: y as number });
      }
    }
    setLabelPositions(newPositions);

    // Set fixed time range for the entire day — only on new day load
    const firstBarTime = bars.length > 0 ? bars[0].time : 0;
    const isDayChange = firstBarTime !== prevFirstBarTime.current;
    if (isDayChange || !timeRangeSetRef.current) {
      if (bars.length >= 2) {
        // Place the first candle at ~35% of chart width (not far left)
        const totalBars = bars.length;
        const leftPad = Math.round(totalBars * 0.35 / 0.65);
        chart.timeScale().setVisibleLogicalRange({ from: -leftPad, to: totalBars });

        // Set a reasonable initial price range so the first candle isn't full-height.
        // Use the full day's high/low with margin to set the price scale.
        const allHighs = bars.map((b) => b.high);
        const allLows = bars.map((b) => b.low);
        const dayHigh = Math.max(...allHighs);
        const dayLow = Math.min(...allLows);
        const margin = (dayHigh - dayLow) * 0.05;
        chart.priceScale("right").applyOptions({
          autoScale: false,
        });
        // Use a helper series approach: set autoscale off and manually set range
        // lightweight-charts doesn't have setVisiblePriceRange on priceScale directly,
        // so we use invisible price lines at top/bottom to anchor the scale
        const topAnchor = series.createPriceLine({
          price: dayHigh + margin,
          color: "#00000000",
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false,
          title: "",
        });
        const bottomAnchor = series.createPriceLine({
          price: dayLow - margin,
          color: "#00000000",
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false,
          title: "",
        });
        priceLinesRef.current.set("_anchor_top", topAnchor);
        priceLinesRef.current.set("_anchor_bottom", bottomAnchor);

        // Re-enable autoscale after anchors are set — it will now include them
        chart.priceScale("right").applyOptions({
          autoScale: true,
        });

        timeRangeSetRef.current = true;
        prevFirstBarTime.current = firstBarTime;
        savedLogicalRange.current = null;
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, [revealedBars, prevClose, orders, positions, closedTrades, bars, unifiedSL, unifiedTP]);

  // Re-position HTML labels when chart scrolls/zooms
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || tradeLabels.length === 0) return;

    const updatePositions = () => {
      const newPos = new Map<string, { x: number; y: number }>();
      for (const label of tradeLabels) {
        const x = chart.timeScale().timeToCoordinate(label.time as UTCTimestamp);
        const y = series.priceToCoordinate(label.price);
        if (x !== null && y !== null) {
          newPos.set(label.id, { x: x as number, y: y as number });
        }
      }
      setLabelPositions(newPos);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePositions);

    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePositions); } catch {}
    };
  }, [tradeLabels]);

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

    const threshold = currentPrice * 0.001;

    // Check unified SL/TP first
    if (unifiedSL != null && Math.abs((clickPrice as number) - unifiedSL) < threshold) {
      // Save current view range before disabling interaction
      const lr = chart.timeScale().getVisibleLogicalRange();
      if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      setDragging({ id: "unified", type: "sl", price: unifiedSL });
      e.preventDefault();
      return;
    }
    if (unifiedTP != null && Math.abs((clickPrice as number) - unifiedTP) < threshold) {
      const lr = chart.timeScale().getVisibleLogicalRange();
      if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      setDragging({ id: "unified", type: "tp", price: unifiedTP });
      e.preventDefault();
      return;
    }

    // Check position SL/TP lines
    for (const p of positions) {
      if (p.stopLoss != null && Math.abs((clickPrice as number) - p.stopLoss) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({ id: p.id, type: "sl", positionId: p.id, price: p.stopLoss });
        e.preventDefault();
        return;
      }
      if (p.takeProfit != null && Math.abs((clickPrice as number) - p.takeProfit) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({ id: p.id, type: "tp", positionId: p.id, price: p.takeProfit });
        e.preventDefault();
        return;
      }
    }

    // Check position entry lines — drag to create SL/TP
    for (const p of positions) {
      if (Math.abs((clickPrice as number) - p.entryPrice) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({
          id: p.id,
          type: "entry-drag",
          positionId: p.id,
          price: p.entryPrice,
          direction: p.direction,
          entryPrice: p.entryPrice,
        });
        e.preventDefault();
        return;
      }
    }

    // Check order lines
    for (const o of orders.filter((o) => o.status === "pending")) {
      if (o.stopLoss != null && Math.abs((clickPrice as number) - o.stopLoss) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({ id: o.id, type: "sl", orderId: o.id, price: o.stopLoss });
        e.preventDefault();
        return;
      }
      if (o.takeProfit != null && Math.abs((clickPrice as number) - o.takeProfit) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({ id: o.id, type: "tp", orderId: o.id, price: o.takeProfit });
        e.preventDefault();
        return;
      }
      if (Math.abs((clickPrice as number) - o.price) < threshold) {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr) savedLogicalRange.current = { from: lr.from, to: lr.to };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        setDragging({ id: o.id, type: "entry", orderId: o.id, price: o.price });
        e.preventDefault();
        return;
      }
    }
  }, [positions, orders, currentPrice, unifiedSL, unifiedTP]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const series = seriesRef.current;
    if (!series || !containerRef.current) return;

    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price === null) return;

    const newPrice = Math.round((price as number) * 10) / 10;

    // Unified drag — update all positions at once
    if (dragging.id === "unified") {
      if (dragging.type === "sl") onUpdateAllSL(newPrice);
      else if (dragging.type === "tp") onUpdateAllTP(newPrice);
    } else if (dragging.type === "entry-drag" && dragging.positionId && dragging.entryPrice != null && dragging.direction) {
      // Drag from entry line: direction determines SL vs TP
      const isLong = dragging.direction === "long";
      const draggedBelow = newPrice < dragging.entryPrice;
      // Use unified updates when multiple positions exist, individual otherwise
      const useUnified = positions.length > 1;
      const updateSL = useUnified ? onUpdateAllSL : (price: number | null) => onUpdatePositionSL(dragging.positionId!, price);
      const updateTP = useUnified ? onUpdateAllTP : (price: number | null) => onUpdatePositionTP(dragging.positionId!, price);
      if (isLong) {
        // Long: drag down = SL, drag up = TP
        if (draggedBelow) {
          updateSL(newPrice);
          updateTP(null);
        } else {
          updateTP(newPrice);
          updateSL(null);
        }
      } else {
        // Short: drag up = SL, drag down = TP
        if (draggedBelow) {
          updateTP(newPrice);
          updateSL(null);
        } else {
          updateSL(newPrice);
          updateTP(null);
        }
      }
    } else if (dragging.positionId) {
      if (dragging.type === "sl") onUpdatePositionSL(dragging.positionId, newPrice);
      else if (dragging.type === "tp") onUpdatePositionTP(dragging.positionId, newPrice);
    } else if (dragging.orderId) {
      if (dragging.type === "sl") onUpdateOrderSL(dragging.orderId, newPrice);
      else if (dragging.type === "tp") onUpdateOrderTP(dragging.orderId, newPrice);
      else if (dragging.type === "entry") onUpdateOrderPrice(dragging.orderId, newPrice);
    }
  }, [dragging, positions, onUpdatePositionSL, onUpdatePositionTP, onUpdateAllSL, onUpdateAllTP, onUpdateOrderSL, onUpdateOrderTP, onUpdateOrderPrice]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      const chart = chartRef.current;
      if (chart) {
        chart.applyOptions({ handleScroll: true, handleScale: true });
        // Restore the view range that was saved before dragging
        if (savedLogicalRange.current) {
          chart.timeScale().setVisibleLogicalRange(savedLogicalRange.current);
          savedLogicalRange.current = null;
        }
      }
    }
    setDragging(null);
  }, [dragging]);

  // Order placement from context menu
  const placeFromMenu = useCallback((direction: "long" | "short", type: "limit" | "stop") => {
    if (contextMenu) {
      onPlaceOrder(Math.round(contextMenu.price * 10) / 10, direction, type);
      setContextMenu(null);
    }
  }, [contextMenu, onPlaceOrder]);

  const SIZES = [1, 2, 5, 10];

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

      {/* Trade labels — discreet positioned HTML bubbles */}
      {tradeLabels.map((label) => {
        const pos = labelPositions.get(label.id);
        if (!pos) return null;
        const offsetY = label.above ? -22 : 6;
        return (
          <div
            key={label.id}
            className="absolute z-30 group/label"
            style={{
              left: pos.x,
              top: pos.y + offsetY,
              transform: "translateX(-50%)",
              pointerEvents: label.detail ? "auto" : "none",
            }}
          >
            <div
              className="px-1.5 py-[1px] rounded-[4px] text-[8px] font-mono leading-tight whitespace-nowrap"
              style={{
                color: label.color,
                background: label.bgColor,
                border: `1px solid ${label.color}18`,
                backdropFilter: "blur(4px)",
              }}
            >
              {label.text}
            </div>
            {/* Hover detail for merged exits */}
            {label.detail && (
              <div
                className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover/label:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap"
                style={{
                  [label.above ? "bottom" : "top"]: "100%",
                  marginBottom: label.above ? "4px" : undefined,
                  marginTop: label.above ? undefined : "4px",
                }}
              >
                <div className="px-2 py-1 rounded text-[7px] font-mono"
                  style={{ background: "rgba(12, 15, 21, 0.9)", border: "1px solid rgba(255,255,255,0.08)", color: "#8b949e", backdropFilter: "blur(8px)" }}>
                  {label.detail}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Top-right overlay: Trading Size + ATR */}
      <div className="absolute top-2 right-16 z-40 flex items-center gap-2">
        {prevDayATR != null && (
          <div className="text-[9px] font-mono px-2 py-1 rounded"
            style={{ background: "rgba(12, 15, 21, 0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", color: "#7d8590" }}>
            ATR <span className="text-[var(--text)]">{prevDayATR.toFixed(1)}</span>
          </div>
        )}
        <div className="flex items-center gap-0.5 px-1 py-0.5 rounded"
          style={{ background: "rgba(12, 15, 21, 0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-[8px] text-[#7d8590] mr-1">Size</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => onTradingSizeChange(s)}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: tradingSize === s ? "rgba(255, 255, 255, 0.85)" : "transparent",
                color: tradingSize === s ? "#0d1117" : "#7d8590",
              }}
            >{s}</button>
          ))}
        </div>
      </div>

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
            background: dragging.type === "sl" ? "var(--red-dim)" : dragging.type === "tp" ? "var(--green-dim)" : dragging.type === "entry-drag" ? (dragging.direction === "long" ? "var(--green-dim)" : "var(--red-dim)") : "var(--surface-2)",
            color: dragging.type === "sl" ? "var(--red)" : dragging.type === "tp" ? "var(--green)" : dragging.type === "entry-drag" ? "var(--text)" : "var(--text-secondary)",
            border: `1px solid ${dragging.type === "sl" ? "var(--red)" : dragging.type === "tp" ? "var(--green)" : "rgba(255,255,255,0.15)"}`,
          }}>
          {dragging.type === "entry-drag" ? "Drag to set SL/TP" : `Dragging ${dragging.type.toUpperCase()}`}{dragging.id === "unified" ? " (all)" : ""}
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
