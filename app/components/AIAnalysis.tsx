"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TradingDay, FilterCriteria } from "@/lib/types";
import { buildFilterDescription } from "@/lib/filterDescription";

interface Stats {
  count: number;
  bullishPct: number;
  avgChange: number;
  medianChange: number;
  avgGap: number | null;
  avgRange: number;
  avgCloseLocation: number;
  maxGain: number;
  maxLoss: number;
}

interface Props {
  days: TradingDay[];
  stats: Stats | null;
  criteria: FilterCriteria;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SavedContext {
  filterDescription: string;
  analysis: string;
  timestamp: number;
}

const CONTEXT_STORAGE_KEY = "deepseek_analysis_history";
const MAX_SAVED_CONTEXTS = 10;

function loadSavedContexts(): SavedContext[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveContext(filterDescription: string, analysis: string) {
  const contexts = loadSavedContexts();
  contexts.unshift({ filterDescription, analysis, timestamp: Date.now() });
  // Keep only the latest N
  const trimmed = contexts.slice(0, MAX_SAVED_CONTEXTS);
  localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(trimmed));
}

function buildChatContext(stats: Stats | null, criteria: FilterCriteria, dayCount: number): string {
  if (!stats) return "No data loaded.";

  // Include saved previous analysis contexts for long-term memory
  const saved = loadSavedContexts();
  let priorContext = "";
  if (saved.length > 0) {
    const recent = saved.slice(0, 5); // Last 5 analyses
    priorContext = "\n\n--- PRIOR ANALYSIS MEMORY (most recent first) ---\n" +
      recent.map((s, i) => `[${i + 1}] Filter: ${s.filterDescription}\nKey findings: ${s.analysis.slice(0, 500)}...`).join("\n\n");
  }

  return `CURRENT SESSION:
Filter: ${buildFilterDescription(criteria)}
Matching days: ${stats.count}
Bullish: ${stats.bullishPct.toFixed(1)}% | Avg change: ${stats.avgChange.toFixed(3)}% | Median: ${stats.medianChange.toFixed(3)}%
Avg gap: ${stats.avgGap !== null ? stats.avgGap.toFixed(3) + "%" : "N/A"} | Avg range: ${stats.avgRange.toFixed(3)}%
Close location: ${stats.avgCloseLocation.toFixed(2)} | Max gain: +${stats.maxGain.toFixed(2)}% | Max loss: ${stats.maxLoss.toFixed(2)}%
Total filtered days available: ${dayCount}${priorContext}`;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

export default function AIAnalysis({ days, stats, criteria }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, analysis]);

  const analyze = useCallback(async () => {
    if (!stats || days.length === 0) {
      setError("No days to analyze");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setChatMessages([]);

    try {
      // Downsample bars to 30-min buckets to keep payload manageable
      const downsample30min = (bars: { time: number; open: number; high: number; low: number; close: number }[]) => {
        if (bars.length === 0) return [];
        const buckets: { time: number; open: number; high: number; low: number; close: number }[] = [];
        const bucketSize = 6; // 6 × 5-min = 30 min
        for (let i = 0; i < bars.length; i += bucketSize) {
          const chunk = bars.slice(i, i + bucketSize);
          buckets.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(b => b.high)),
            low: Math.min(...chunk.map(b => b.low)),
            close: chunk[chunk.length - 1].close,
          });
        }
        return buckets;
      };

      const daySummaries = days.map(d => ({
        date: d.date,
        dayName: d.dayName,
        open: d.open,
        close: d.close,
        high: d.high,
        low: d.low,
        changePercent: d.changePercent,
        gapPercent: d.gapPercent,
        rangePercent: d.rangePercent,
        prevClose: d.prevClose,
        prevDayDirection: d.prevDayDirection,
        prevDayChangePercent: d.prevDayChangePercent,
        prevDayRangePercent: d.prevDayRangePercent,
        prevDayGapPercent: d.prevDayGapPercent,
        closeLocation: d.closeLocation,
        bodyPercent: d.bodyPercent,
        upperWickPercent: d.upperWickPercent,
        lowerWickPercent: d.lowerWickPercent,
        bars: downsample30min(d.bars),
      }));

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: daySummaries,
          stats,
          filterDescription: buildFilterDescription(criteria),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else {
        setAnalysis(data.analysis);
        // Save to localStorage for long-term context
        saveContext(buildFilterDescription(criteria), data.analysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [days, stats, criteria]);

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    setError(null);

    // Include the analysis as the first assistant message in history if it exists
    const history: ChatMessage[] = [];
    if (analysis) {
      history.push({ role: "assistant", content: analysis });
    }
    history.push(...chatMessages);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context: buildChatContext(stats, criteria, days.length),
          history,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Chat failed");
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatLoading, analysis, stats, criteria, days.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const savedCount = typeof window !== "undefined" ? loadSavedContexts().length : 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[var(--purple)] text-xs">&#9672;</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            AI Deep Analysis
          </h3>
          <span className="text-[10px] text-[var(--text-dim)]">DeepSeek</span>
          {savedCount > 0 && (
            <span className="text-[9px] text-[var(--purple)]/60 bg-[var(--purple)]/10 px-1.5 py-0.5 rounded-full">
              {savedCount} prior {savedCount === 1 ? "analysis" : "analyses"} in memory
            </span>
          )}
        </div>
        <button
          onClick={analyze}
          disabled={loading || days.length === 0}
          className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
            loading
              ? "bg-[var(--border)] text-[var(--text-dim)]"
              : "bg-[var(--accent-dim)] text-white hover:bg-[var(--accent)] active:scale-95"
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
              Deep analyzing...
            </span>
          ) : (
            `Analyze ${days.length} days`
          )}
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {error && (
          <div className="text-[11px] text-[var(--red)] bg-[var(--red)]/10 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        {loading && !analysis && (
          <div className="flex flex-col items-center gap-2 text-[11px] text-[var(--text-muted)] py-6">
            <span className="pulse-glow text-[var(--purple)]">&#9672;</span>
            <span>Running deep analysis on {days.length} trading days...</span>
            <span className="text-[10px] text-[var(--text-dim)]">
              Computing gap fills, correlations, sequential patterns, candle structure...
            </span>
          </div>
        )}

        {analysis && (
          <div
            className="ai-content text-[11px] text-[var(--text-muted)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }}
          />
        )}

        {/* Chat messages */}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`text-[11px] leading-relaxed ${
            msg.role === "user"
              ? "bg-[var(--accent-dim)]/15 rounded-lg px-2.5 py-1.5 text-[var(--text)] ml-6"
              : "ai-content text-[var(--text-muted)]"
          }`}>
            {msg.role === "user" ? (
              msg.content
            ) : (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            )}
          </div>
        ))}

        {chatLoading && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
            <span className="pulse-glow text-[var(--purple)]">&#9672;</span>
            Thinking...
          </div>
        )}

        {!analysis && !loading && !error && chatMessages.length === 0 && (
          <p className="text-[11px] text-[var(--text-dim)] text-center py-4">
            Click &quot;Analyze&quot; for a deep pattern report with gap fills, correlations, sequential patterns &amp; trading thesis — or type a question below.
          </p>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Chat input */}
      <div className="flex-shrink-0 border-t border-[var(--border)] p-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask DeepSeek about these patterns..."
            className="flex-1 text-[11px]"
            disabled={chatLoading}
          />
          <button
            onClick={sendChat}
            disabled={chatLoading || !chatInput.trim()}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
              chatLoading || !chatInput.trim()
                ? "bg-[var(--border)] text-[var(--text-dim)]"
                : "bg-[var(--purple)]/20 text-[var(--purple)] hover:bg-[var(--purple)]/30 active:scale-95"
            }`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
