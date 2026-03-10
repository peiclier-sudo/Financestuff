"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries } from "lightweight-charts";
import { Bar } from "@/lib/types";

interface Props {
  bars: Bar[];
  title?: string;
  prevClose?: number | null;
}

export default function CandlestickChart({ bars, title, prevClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPrevClose, setShowPrevClose] = useState(true);

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

    const data = bars.map((b) => ({
      time: b.time as import("lightweight-charts").UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    series.setData(data);

    // Previous close horizontal line
    if (showPrevClose && prevClose != null && bars.length >= 2) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#f0883e",
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      // Draw a flat line across the entire time range
      lineSeries.setData([
        { time: bars[0].time as import("lightweight-charts").UTCTimestamp, value: prevClose },
        { time: bars[bars.length - 1].time as import("lightweight-charts").UTCTimestamp, value: prevClose },
      ]);
      // Add price line label on the right axis
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

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [bars, prevClose, showPrevClose]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {title && (
        <div className="px-3 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between flex-shrink-0">
          <h3 className="text-[10px] font-medium text-[var(--text-muted)]">{title}</h3>
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
      )}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
