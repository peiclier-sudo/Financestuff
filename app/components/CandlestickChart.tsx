"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import { Bar } from "@/lib/types";

interface Props {
  bars: Bar[];
  title?: string;
  height?: number;
}

export default function CandlestickChart({ bars, title, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0d1117" },
        textColor: "#7d8590",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      width: containerRef.current.clientWidth,
      height,
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
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [bars, height]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <h3 className="text-xs font-medium text-[var(--text-muted)]">{title}</h3>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
