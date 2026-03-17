"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { Bar } from "@/lib/types";

export interface TradeHighlight {
  direction: "long" | "short";
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  stopPrice: number | null;
  targetPrice: number | null;
  pnlPoints: number;
  hitTarget: boolean;
  hitStop: boolean;
}

interface RangeData {
  high: number;
  low: number;
  label: string; // e.g. "3 days"
}

interface Props {
  bars: Bar[];
  title?: string;
  prevClose?: number | null;
  range?: RangeData | null;
  trade?: TradeHighlight | null;
}

export default function CandlestickChart({ bars, title, prevClose, range, trade }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPrevClose, setShowPrevClose] = useState(true);
  const [showRange, setShowRange] = useState(true);
  const [showTrade, setShowTrade] = useState(true);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb95080",
      wickDownColor: "#f8514980",
    });

    type TS = import("lightweight-charts").UTCTimestamp;
    const data = bars.map((b) => ({
      time: b.time as TS,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.setData(data);

    const t0 = bars[0].time as TS;
    const tN = bars[bars.length - 1].time as TS;

    // Previous close horizontal line
    if (showPrevClose && prevClose != null && bars.length >= 2) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#f0883e",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData([
        { time: t0, value: prevClose },
        { time: tN, value: prevClose },
      ]);
      lineSeries.createPriceLine({
        price: prevClose,
        color: "#f0883e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Prev Close",
        axisLabelColor: "#f0883e",
        axisLabelTextColor: "#0d1117",
      });
    }

    // Range band: high/low horizontal lines across entire chart
    if (showRange && range) {
      // High line
      const highLine = chart.addSeries(LineSeries, {
        color: "#8b5cf680",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      highLine.setData([
        { time: t0, value: range.high },
        { time: tN, value: range.high },
      ]);
      highLine.createPriceLine({
        price: range.high,
        color: "#8b5cf6",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Rng H`,
        axisLabelColor: "#8b5cf6",
        axisLabelTextColor: "#0d1117",
      });

      // Low line
      const lowLine = chart.addSeries(LineSeries, {
        color: "#8b5cf680",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      lowLine.setData([
        { time: t0, value: range.low },
        { time: tN, value: range.low },
      ]);
      lowLine.createPriceLine({
        price: range.low,
        color: "#8b5cf6",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Rng L`,
        axisLabelColor: "#8b5cf6",
        axisLabelTextColor: "#0d1117",
      });
    }

    // Trade highlight: entry/exit markers + horizontal lines
    if (showTrade && trade) {
      const isWin = trade.pnlPoints >= 0;
      const tradeColor = isWin ? "#3fb950" : "#f85149";

      // Entry line
      const entryLine = chart.addSeries(LineSeries, {
        color: "#58a6ff80",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      entryLine.setData([
        { time: t0, value: trade.entryPrice },
        { time: tN, value: trade.entryPrice },
      ]);
      entryLine.createPriceLine({
        price: trade.entryPrice,
        color: "#58a6ff",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Entry`,
        axisLabelColor: "#58a6ff",
        axisLabelTextColor: "#0d1117",
      });

      // Exit line
      const exitLine = chart.addSeries(LineSeries, {
        color: tradeColor + "80",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      exitLine.setData([
        { time: t0, value: trade.exitPrice },
        { time: tN, value: trade.exitPrice },
      ]);
      exitLine.createPriceLine({
        price: trade.exitPrice,
        color: tradeColor,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Exit ${trade.pnlPoints >= 0 ? "+" : ""}${trade.pnlPoints.toFixed(1)}`,
        axisLabelColor: tradeColor,
        axisLabelTextColor: "#0d1117",
      });

      // Stop loss line
      if (trade.stopPrice != null) {
        const slLine = chart.addSeries(LineSeries, {
          color: "#f8514960",
          lineWidth: 1,
          lineStyle: 3, // dotted
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
        });
        slLine.setData([
          { time: t0, value: trade.stopPrice },
          { time: tN, value: trade.stopPrice },
        ]);
        slLine.createPriceLine({
          price: trade.stopPrice,
          color: "#f85149",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "SL",
          axisLabelColor: "#f85149",
          axisLabelTextColor: "#0d1117",
        });
      }

      // Target price line
      if (trade.targetPrice != null) {
        const tpLine = chart.addSeries(LineSeries, {
          color: "#3fb95060",
          lineWidth: 1,
          lineStyle: 3, // dotted
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
        });
        tpLine.setData([
          { time: t0, value: trade.targetPrice },
          { time: tN, value: trade.targetPrice },
        ]);
        tpLine.createPriceLine({
          price: trade.targetPrice,
          color: "#3fb950",
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: "TP",
          axisLabelColor: "#3fb950",
          axisLabelTextColor: "#0d1117",
        });
      }

      // Markers for entry/exit on the candlestick series
      // Find closest bar indices for entry/exit times
      const entryIdx = findClosestBarIndex(bars, trade.entryTime);
      const exitIdx = findClosestBarIndex(bars, trade.exitTime);

      if (entryIdx >= 0 && exitIdx >= 0) {
        const markers: import("lightweight-charts").SeriesMarker<TS>[] = [
          {
            time: bars[entryIdx].time as TS,
            position: trade.direction === "long" ? "belowBar" : "aboveBar",
            color: "#58a6ff",
            shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
            text: `${trade.direction === "long" ? "BUY" : "SELL"} ${trade.entryPrice.toFixed(1)}`,
          },
          {
            time: bars[exitIdx].time as TS,
            position: trade.direction === "long" ? "aboveBar" : "belowBar",
            color: tradeColor,
            shape: trade.hitTarget ? "circle" : trade.hitStop ? "square" : "circle",
            text: `${trade.hitTarget ? "TP" : trade.hitStop ? "SL" : "EOD"} ${trade.exitPrice.toFixed(1)}`,
          },
        ];
        // Sort markers by time (required by lightweight-charts)
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        createSeriesMarkers(series, markers);
      }
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    // Also observe container itself for panel resize
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      chart.remove();
    };
  }, [bars, prevClose, showPrevClose, range, showRange, trade, showTrade]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {title && (
        <div className="px-3 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between flex-shrink-0">
          <h3 className="text-[10px] font-medium text-[var(--text-muted)]">{title}</h3>
          <div className="flex items-center gap-3">
            {range && (
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRange}
                  onChange={(e) => setShowRange(e.target.checked)}
                  className="w-3 h-3 accent-[#8b5cf6]"
                />
                <span style={{ color: "#8b5cf6" }}>Range ({range.label})</span>
              </label>
            )}
            {trade && (
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTrade}
                  onChange={(e) => setShowTrade(e.target.checked)}
                  className="w-3 h-3 accent-[#58a6ff]"
                />
                <span style={{ color: "#58a6ff" }}>Trade</span>
              </label>
            )}
            {prevClose != null && (
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPrevClose}
                  onChange={(e) => setShowPrevClose(e.target.checked)}
                  className="w-3 h-3 accent-[#f0883e]"
                />
                <span style={{ color: "#f0883e" }}>Prev Close</span>
              </label>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

function findClosestBarIndex(bars: Bar[], targetTime: number): number {
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
