import Link from "next/link";

export default function HomePage() {
  return (
    <div className="h-screen flex items-center justify-center dot-grid">
      <div className="text-center space-y-10 fade-in">
        {/* Hero */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full glow-dot" style={{ background: "rgba(255,255,255,0.6)", color: "rgba(255,255,255,0.6)" }} />
            <p className="text-label" style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>Trading Intelligence</p>
          </div>
          <h1 className="text-display text-4xl text-gradient-accent">
            NDX Day Filter
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] max-w-xs mx-auto leading-relaxed" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            NASDAQ-100 intraday analysis & discretionary practice platform
          </p>
        </div>

        {/* Decorative line */}
        <div className="separator-accent max-w-32 mx-auto" />

        {/* Cards */}
        <div className="flex gap-6">
          {/* Dashboard Card */}
          <Link href="/dashboard" className="group block">
            <div className="glass-panel corner-accent p-7 w-72 transition-all duration-300 cursor-pointer hover:scale-[1.03] relative overflow-hidden">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)] mb-1.5 group-hover:text-white transition-colors tracking-tight">Dashboard</h2>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Filter & analyze NDX trading days with strategy backtesting</p>
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none glass-shimmer" />
            </div>
          </Link>

          {/* Manual Backtest Card */}
          <Link href="/backtest" className="group block">
            <div className="glass-panel corner-accent p-7 w-72 transition-all duration-300 cursor-pointer hover:scale-[1.03] relative overflow-hidden">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)] mb-1.5 group-hover:text-white transition-colors tracking-tight">Manual Backtest</h2>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Practice trading bar-by-bar on random historical days</p>
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none glass-shimmer" />
            </div>
          </Link>
        </div>

        {/* Footer accent */}
        <div className="space-y-2">
          <p className="text-[8px] text-[var(--text-dim)] tracking-[0.3em] uppercase font-display">Spatial Analytics Engine</p>
          <div className="flex items-center justify-center gap-4">
            <div className="w-6 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1))" }} />
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full" style={{ background: "rgba(255, 255, 255, 0.15)" }} />
              <div className="w-1 h-1 rounded-full" style={{ background: "rgba(255, 255, 255, 0.25)" }} />
              <div className="w-1 h-1 rounded-full" style={{ background: "rgba(255, 255, 255, 0.15)" }} />
            </div>
            <div className="w-6 h-[1px]" style={{ background: "linear-gradient(90deg, rgba(255, 255, 255, 0.1), transparent)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
