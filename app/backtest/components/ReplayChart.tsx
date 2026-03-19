"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
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
  direction: "long" | "short" | "mixed"; // dominant direction
  trades: { pnl: number; text: string; direction: "long" | "short"; entryTime: number; entryPrice: number; exitPrice: number }[];
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
  const [posLabels, setPosLabels] = useState<{ id: string; price: number; text: string; direction: string; pnl: number }[]>([]);
  const [posLabelPositions, setPosLabelPositions] = useState<Map<string, number>>(new Map()); // id -> y coordinate
  const lastCrosshairPrice = useRef<number>(0);
  const timeRangeSetRef = useRef(false);
  const prevFirstBarTime = useRef<number>(0);
  const savedLogicalRange = useRef<{ from: number; to: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<any> | null>(null);

  // Pattern Library state
  const [patternMenuOpen, setPatternMenuOpen] = useState(false);
  const [activePatterns, setActivePatterns] = useState<Set<string>>(new Set());

  const togglePattern = useCallback((pattern: string) => {
    setActivePatterns((prev) => {
      const next = new Set(prev);
      if (next.has(pattern)) next.delete(pattern);
      else next.add(pattern);
      return next;
    });
  }, []);

  const revealedBars = bars.slice(0, revealedCount);
  const currentPrice = revealedBars.length > 0 ? revealedBars[revealedBars.length - 1].close : 0;

  // Pattern detection
  const patternMarkers = useMemo(() => {
    if (activePatterns.size === 0 || revealedBars.length < 2) return [];
    const markers: { time: number; position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown"; color: string; text: string; size: number }[] = [];

    for (let i = 1; i < revealedBars.length; i++) {
      const curr = revealedBars[i];
      const prev = revealedBars[i - 1];
      const currBody = Math.abs(curr.close - curr.open);
      const currRange = curr.high - curr.low;
      const prevBody = Math.abs(prev.close - prev.open);
      const currBodyTop = Math.max(curr.open, curr.close);
      const currBodyBot = Math.min(curr.open, curr.close);
      const prevBodyTop = Math.max(prev.open, prev.close);
      const prevBodyBot = Math.min(prev.open, prev.close);

      // Inside Bar: current bar's high/low is within previous bar's range
      if (activePatterns.has("insideBar")) {
        if (curr.high <= prev.high && curr.low >= prev.low) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#58a6ff", text: "IB", size: 0.5 });
        }
      }

      // Outside Bar: current bar engulfs previous bar
      if (activePatterns.has("outsideBar")) {
        if (curr.high > prev.high && curr.low < prev.low) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#d2a8ff", text: "OB", size: 0.5 });
        }
      }

      // Pin Bar: huge tail, small body. Tail is >= 2x body size
      if (activePatterns.has("pinBar") && currRange > 0) {
        const upperTail = curr.high - currBodyTop;
        const lowerTail = currBodyBot - curr.low;
        const bodyRatio = currBody / currRange;
        // Bull pin bar: long lower tail, body in upper third
        if (bodyRatio <= 0.33 && lowerTail >= 2 * currBody && lowerTail > upperTail) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#3fb950", text: "PIN", size: 0.5 });
        }
        // Bear pin bar: long upper tail, body in lower third
        else if (bodyRatio <= 0.33 && upperTail >= 2 * currBody && upperTail > lowerTail) {
          markers.push({ time: curr.time, position: "aboveBar", shape: "arrowDown", color: "#f85149", text: "PIN", size: 0.5 });
        }
      }

      // Umbrella: current bar's body is contained within previous bar's tail range
      // i.e. the body of current candle sits within the wick of the previous candle
      if (activePatterns.has("umbrella")) {
        const prevUpperTail = prev.high - prevBodyTop;
        const prevLowerTail = prevBodyBot - prev.low;
        // Body fits in previous upper tail
        if (prevUpperTail > 0 && currBodyBot >= prevBodyTop && currBodyTop <= prev.high) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#e3b341", text: "UMB", size: 0.5 });
        }
        // Body fits in previous lower tail
        else if (prevLowerTail > 0 && currBodyTop <= prevBodyBot && currBodyBot >= prev.low) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#e3b341", text: "UMB", size: 0.5 });
        }
      }

      // BOC (Bullish Outside Candle): closes in top 90% of range, larger body than prev, closes above prev high
      if (activePatterns.has("boc") && currRange > 0) {
        const closePosition = (curr.close - curr.low) / currRange; // 1.0 = top, 0.0 = bottom
        if (closePosition >= 0.9 && currBody > prevBody && curr.close > prev.high) {
          markers.push({ time: curr.time, position: "belowBar", shape: "arrowUp", color: "#3fb950", text: "BOC", size: 0.5 });
        }
      }

      // SOC (Bearish Outside Candle): closes in bottom 10% of range, larger body than prev, closes below prev low
      if (activePatterns.has("soc") && currRange > 0) {
        const closePosition = (curr.close - curr.low) / currRange;
        if (closePosition <= 0.1 && currBody > prevBody && curr.close < prev.low) {
          markers.push({ time: curr.time, position: "aboveBar", shape: "arrowDown", color: "#f85149", text: "SOC", size: 0.5 });
        }
      }
    }

    // Opening Range Breakout: mark bar that breaks the high/low of the first 3 bars
    if (activePatterns.has("orbBreakout") && revealedBars.length >= 3) {
      const orbHigh = Math.max(revealedBars[0].high, revealedBars[1].high, revealedBars[2].high);
      const orbLow = Math.min(revealedBars[0].low, revealedBars[1].low, revealedBars[2].low);
      let breakoutFound = false;
      for (let i = 3; i < revealedBars.length && !breakoutFound; i++) {
        if (revealedBars[i].close > orbHigh) {
          markers.push({ time: revealedBars[i].time, position: "belowBar", shape: "arrowUp", color: "#3fb950", text: "ORB", size: 0.5 });
          breakoutFound = true;
        } else if (revealedBars[i].close < orbLow) {
          markers.push({ time: revealedBars[i].time, position: "aboveBar", shape: "arrowDown", color: "#f85149", text: "ORB", size: 0.5 });
          breakoutFound = true;
        }
      }
    }

    // Sort by time (required by lightweight-charts)
    markers.sort((a, b) => a.time - b.time);
    return markers;
  }, [revealedBars, activePatterns]);

  // Apply pattern markers to chart
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin) return;
    plugin.setMarkers(
      patternMarkers.map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: m.color,
        text: m.text,
        size: m.size,
      }))
    );
  }, [patternMarkers]);

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
    markersPluginRef.current = createSeriesMarkers(series, []);

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
      markersPluginRef.current = null;
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

    // Position entry lines — clean, no title (PnL shown via HTML overlay)
    const newPosLabels: typeof posLabels = [];
    positions.forEach((p) => {
      const mult = p.direction === "long" ? 1 : -1;
      const pnlPts = (currentPrice - p.entryPrice) * mult;
      const pnl = pnlPts * tradingSize;
      const pnlColor = pnlPts >= 0 ? "#3fb95040" : "#f8514940";
      const entryPl = series.createPriceLine({
        price: p.entryPrice,
        color: pnlColor,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
        axisLabelColor: pnlPts >= 0 ? "#3fb950" : "#f85149",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set(`pos-entry-${p.id}`, entryPl);

      newPosLabels.push({
        id: p.id,
        price: p.entryPrice,
        text: `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(1)}`,
        direction: p.direction,
        pnl,
      });

      // SL/TP: smooth dashed lines (lineStyle 2), slightly transparent
      if (p.stopLoss != null && !hasUnifiedSL) {
        const slPl = series.createPriceLine({
          price: p.stopLoss,
          color: "#f85149cc",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
          axisLabelColor: "#f85149",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`pos-sl-${p.id}`, slPl);
      }

      if (p.takeProfit != null && !hasUnifiedTP) {
        const tpPl = series.createPriceLine({
          price: p.takeProfit,
          color: "#3fb95060",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
          axisLabelColor: "#3fb950",
          axisLabelTextColor: "#0d1117",
        });
        priceLinesRef.current.set(`pos-tp-${p.id}`, tpPl);
      }
    });
    setPosLabels(newPosLabels);

    // Unified SL/TP lines — smooth dashed, slightly bolder
    if (hasUnifiedSL && unifiedSL != null) {
      const slPl = series.createPriceLine({
        price: unifiedSL,
        color: "#f85149dd",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
        axisLabelColor: "#f85149",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("unified-sl", slPl);
    }
    if (hasUnifiedTP && unifiedTP != null) {
      const tpPl = series.createPriceLine({
        price: unifiedTP,
        color: "#3fb95080",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
        axisLabelColor: "#3fb950",
        axisLabelTextColor: "#0d1117",
      });
      priceLinesRef.current.set("unified-tp", tpPl);
    }

    // Compute position label Y coordinates
    const newPosLabelPos = new Map<string, number>();
    for (const pl of newPosLabels) {
      const y = series.priceToCoordinate(pl.price);
      if (y !== null) newPosLabelPos.set(pl.id, y as number);
    }
    setPosLabelPositions(newPosLabelPos);

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
      for (const [exitIdx, group] of exitGroups) {
        const totalPnl = group.trades.reduce((s, t) => s + t.pnlPoints, 0);
        const color = totalPnl >= 0 ? "#3fb950" : "#f85149";
        const isAbove = totalPnl >= 0;

        // Smart Y positioning: use a price offset away from candles
        // Look at neighboring bars to find clear space
        const bar = group.bar;
        const neighborRange = 2; // check bars around
        let maxHigh = bar.high;
        let minLow = bar.low;
        for (let ni = Math.max(0, exitIdx - neighborRange); ni <= Math.min(revealedBars.length - 1, exitIdx + neighborRange); ni++) {
          maxHigh = Math.max(maxHigh, revealedBars[ni].high);
          minLow = Math.min(minLow, revealedBars[ni].low);
        }
        const barRange = maxHigh - minLow;
        const smartPrice = isAbove
          ? maxHigh + barRange * 0.15
          : minLow - barRange * 0.15;

        // Determine dominant direction
        const longs = group.trades.filter((t) => t.direction === "long").length;
        const shorts = group.trades.length - longs;
        const direction: "long" | "short" | "mixed" = group.trades.length === 1
          ? group.trades[0].direction
          : longs === group.trades.length ? "long" : shorts === group.trades.length ? "short" : "mixed";

        labels.push({
          id: `exit-${group.trades.map((t) => t.id).join("-")}`,
          time: group.bar.time,
          price: smartPrice,
          text: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(1)}`,
          direction,
          trades: group.trades.map((t) => ({
            pnl: t.pnlPoints,
            text: `${t.pnlPoints >= 0 ? "+" : ""}$${t.pnlPoints.toFixed(1)}`,
            direction: t.direction,
            entryTime: t.entryTime,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
          })),
          color,
          bgColor: totalPnl >= 0 ? "rgba(63, 185, 80, 0.08)" : "rgba(248, 81, 73, 0.08)",
          above: isAbove,
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
    if (!chart || !series) return;
    if (tradeLabels.length === 0 && posLabels.length === 0) return;

    const updatePositions = () => {
      // Trade exit labels
      const newPos = new Map<string, { x: number; y: number }>();
      for (const label of tradeLabels) {
        const x = chart.timeScale().timeToCoordinate(label.time as UTCTimestamp);
        const y = series.priceToCoordinate(label.price);
        if (x !== null && y !== null) {
          newPos.set(label.id, { x: x as number, y: y as number });
        }
      }
      setLabelPositions(newPos);

      // Position PnL labels (only need Y coordinate)
      const newPosPos = new Map<string, number>();
      for (const pl of posLabels) {
        const y = series.priceToCoordinate(pl.price);
        if (y !== null) newPosPos.set(pl.id, y as number);
      }
      setPosLabelPositions(newPosPos);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePositions);

    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePositions); } catch {}
    };
  }, [tradeLabels, posLabels]);

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
    setPatternMenuOpen(false);

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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickPrice = series.coordinateToPrice(y);
    if (clickPrice === null) return;

    // Ignore clicks on the price scale (Y axis) area to prevent accidental drags
    const chartWidth = chart.timeScale().width();
    if (x > chartWidth) return;

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

      {/* Pattern Library — top-left dropdown */}
      <div className="absolute top-2 left-2 z-40">
        <button
          onClick={() => setPatternMenuOpen((v) => !v)}
          className="text-[9px] font-mono px-2 py-1 rounded transition-colors"
          style={{
            background: activePatterns.size > 0 ? "rgba(88, 166, 255, 0.12)" : "rgba(12, 15, 21, 0.7)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${activePatterns.size > 0 ? "rgba(88, 166, 255, 0.3)" : "rgba(255,255,255,0.06)"}`,
            color: activePatterns.size > 0 ? "#58a6ff" : "#7d8590",
          }}
        >
          Patterns{activePatterns.size > 0 ? ` (${activePatterns.size})` : ""}
        </button>
        {patternMenuOpen && (
          <div
            className="absolute top-full left-0 mt-1 rounded-md py-1 min-w-[180px]"
            style={{
              background: "rgba(12, 15, 21, 0.94)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}
          >
            {([
              { id: "insideBar", label: "Inside Bar", color: "#58a6ff" },
              { id: "outsideBar", label: "Outside Bar", color: "#d2a8ff" },
              { id: "pinBar", label: "Pin Bar", color: "#79c0ff" },
              { id: "umbrella", label: "Umbrella", color: "#e3b341" },
              { id: "boc", label: "BOC (Buy On Close)", color: "#3fb950" },
              { id: "soc", label: "SOC (Sell On Close)", color: "#f85149" },
              { id: "orbBreakout", label: "ORB (First 3 Bars)", color: "#3fb950" },
            ] as const).map((p) => (
              <button
                key={p.id}
                onClick={() => togglePattern(p.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] font-mono transition-colors hover:bg-white/5"
                style={{ color: activePatterns.has(p.id) ? p.color : "#7d8590" }}
              >
                <span
                  className="w-3 h-3 rounded-[3px] border flex items-center justify-center text-[8px]"
                  style={{
                    borderColor: activePatterns.has(p.id) ? p.color : "rgba(255,255,255,0.15)",
                    background: activePatterns.has(p.id) ? `${p.color}20` : "transparent",
                  }}
                >
                  {activePatterns.has(p.id) ? "✓" : ""}
                </span>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Position PnL labels — large, aesthetic blocks pinned to left edge */}
      {posLabels.map((pl) => {
        const y = posLabelPositions.get(pl.id);
        if (y == null) return null;
        const isProfit = pl.pnl >= 0;
        const color = isProfit ? "#3fb950" : "#f85149";
        const bgColor = isProfit ? "rgba(63, 185, 80, 0.08)" : "rgba(248, 81, 73, 0.08)";
        const borderColor = isProfit ? "rgba(63, 185, 80, 0.2)" : "rgba(248, 81, 73, 0.2)";
        return (
          <div
            key={`pos-label-${pl.id}`}
            className="absolute z-30 pointer-events-none"
            style={{ left: 12, top: y, transform: "translateY(-50%)" }}
          >
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                backdropFilter: "blur(8px)",
                boxShadow: `0 0 12px ${isProfit ? "rgba(63, 185, 80, 0.06)" : "rgba(248, 81, 73, 0.06)"}`,
              }}
            >
              <span className="text-[9px] font-semibold uppercase opacity-50" style={{ color }}>
                {pl.direction === "long" ? "L" : "S"}
              </span>
              <span className="text-[13px] font-mono font-bold tracking-tight" style={{ color, textShadow: `0 0 8px ${color}40` }}>
                {pl.text}
              </span>
            </div>
          </div>
        );
      })}

      {/* Trade PnL labels — positioned away from candles */}
      {tradeLabels.map((label) => {
        const pos = labelPositions.get(label.id);
        if (!pos) return null;
        const dirLetter = label.direction === "long" ? "L" : label.direction === "short" ? "S" : "M";
        const dirColor = label.direction === "long" ? "#3fb950" : label.direction === "short" ? "#f85149" : "#7d8590";
        return (
          <div
            key={label.id}
            data-label-id={label.id}
            className="absolute z-30 group/label"
            style={{
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
          >
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] font-mono font-bold leading-tight whitespace-nowrap"
              style={{
                fontSize: "11px",
                color: label.color,
                background: label.bgColor,
                border: `1px solid ${label.color}20`,
                backdropFilter: "blur(8px)",
                boxShadow: `0 0 10px ${label.color}10`,
                textShadow: `0 0 6px ${label.color}30`,
              }}
            >
              <span className="text-[9px] font-bold opacity-60" style={{ color: dirColor }}>{dirLetter}</span>
              <span>{label.text}</span>
            </div>
            {/* Hover detail — entry→exit connectors + breakdown */}
            <div
              className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover/label:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap"
              style={{
                [label.above ? "bottom" : "top"]: "100%",
                marginBottom: label.above ? "6px" : undefined,
                marginTop: label.above ? undefined : "6px",
              }}
            >
              <div className="px-2.5 py-1.5 rounded-md text-[10px] font-mono font-semibold space-y-1"
                style={{ background: "rgba(12, 15, 21, 0.94)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
                {label.trades.map((t, i) => {
                  const tColor = t.pnl >= 0 ? "#3fb950" : "#f85149";
                  const tDir = t.direction === "long" ? "L" : "S";
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[8px] font-bold w-2" style={{ color: t.direction === "long" ? "#3fb950" : "#f85149" }}>{tDir}</span>
                      <span className="text-[var(--text-dim)] text-[9px]">{t.entryPrice.toFixed(0)}</span>
                      <span className="text-[var(--text-dim)] text-[7px]">&rarr;</span>
                      <span className="text-[var(--text-dim)] text-[9px]">{t.exitPrice.toFixed(0)}</span>
                      <span style={{ color: tColor }}>{t.text}</span>
                    </div>
                  );
                })}
                {label.trades.length > 1 && (
                  <div className="flex items-center gap-1.5 pt-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="text-[var(--text-dim)] text-[8px]">Total</span>
                    <span className="ml-auto text-[11px]" style={{ color: label.color, textShadow: `0 0 6px ${label.color}40` }}>{label.text}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Hover connectors — SVG lines from entry bar to exit bar (rendered at chart level) */}
      {tradeLabels.map((label) => (
        <TradeConnectors key={`conn-${label.id}`} label={label} revealedBars={revealedBars} chartRef={chartRef} seriesRef={seriesRef} containerRef={containerRef} labelId={label.id} />
      ))}

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

function TradeConnectors({ label, revealedBars, chartRef, seriesRef, containerRef, labelId }: {
  label: TradeLabel;
  revealedBars: Bar[];
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  labelId: string;
}) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const compute = () => {
      const newLines: typeof lines = [];
      for (const t of label.trades) {
        const entryIdx = findClosestBarIndex(revealedBars, t.entryTime);
        if (entryIdx < 0) continue;
        const entryBar = revealedBars[entryIdx];
        if (!entryBar) continue;

        const x1 = chart.timeScale().timeToCoordinate(entryBar.time as UTCTimestamp);
        const y1 = series.priceToCoordinate(t.entryPrice);
        const x2 = chart.timeScale().timeToCoordinate(label.time as UTCTimestamp);
        const y2 = series.priceToCoordinate(t.exitPrice);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          newLines.push({
            x1: x1 as number,
            y1: y1 as number,
            x2: x2 as number,
            y2: y2 as number,
            color: t.pnl >= 0 ? "#3fb950" : "#f85149",
          });
        }
      }
      setLines(newLines);
    };

    compute();
    chart.timeScale().subscribeVisibleLogicalRangeChange(compute);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(compute); } catch {}
    };
  }, [label, revealedBars, chartRef, seriesRef]);

  // Listen for hover on the corresponding label element
  useEffect(() => {
    const labelEl = document.querySelector(`[data-label-id="${labelId}"]`);
    if (!labelEl) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    labelEl.addEventListener("mouseenter", enter);
    labelEl.addEventListener("mouseleave", leave);
    return () => {
      labelEl.removeEventListener("mouseenter", enter);
      labelEl.removeEventListener("mouseleave", leave);
    };
  }, [labelId]);

  if (lines.length === 0 || !hovered) return null;

  const el = containerRef.current;
  if (!el) return null;
  const w = el.clientWidth;
  const h = el.clientHeight;

  return (
    <svg
      className="absolute pointer-events-none z-20 transition-opacity"
      style={{ left: 0, top: 0, width: w, height: h, opacity: 1 }}
    >
      {lines.map((l, i) => (
        <g key={i}>
          {/* Soft glow line */}
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth="4" opacity="0.08" strokeLinecap="round" />
          {/* Main dashed line */}
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.5" strokeLinecap="round" />
          {/* Entry dot */}
          <circle cx={l.x1} cy={l.y1} r="3.5" fill="none" stroke={l.color} strokeWidth="1.5" opacity="0.6" />
          <circle cx={l.x1} cy={l.y1} r="1.5" fill={l.color} opacity="0.8" />
          {/* Exit dot */}
          <circle cx={l.x2} cy={l.y2} r="3.5" fill="none" stroke={l.color} strokeWidth="1.5" opacity="0.6" />
          <circle cx={l.x2} cy={l.y2} r="1.5" fill={l.color} opacity="0.8" />
        </g>
      ))}
    </svg>
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
