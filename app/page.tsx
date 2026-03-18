import Link from "next/link";

export default function HomePage() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-center space-y-10 fade-in">
        {/* Hero */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-[var(--accent)] animate-ping opacity-20" />
            </div>
            <p className="text-label" style={{ color: "var(--accent)", letterSpacing: "0.2em" }}>Trading Intelligence</p>
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
        <div className="flex gap-5">
          {/* Dashboard Card */}
          <Link href="/dashboard" className="group block">
            <div className="glass-panel p-6 w-64 transition-all duration-300 cursor-pointer hover:scale-[1.02] relative overflow-hidden">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(96,165,250,0.2)]"
                style={{ background: "rgba(96, 165, 250, 0.06)", border: "1px solid rgba(96, 165, 250, 0.1)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <h2 className="font-display text-sm font-semibold text-[var(--text)] mb-1 group-hover:text-[var(--accent)] transition-colors tracking-tight">Dashboard</h2>
              <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">Filter & analyze NDX trading days with strategy backtesting</p>
              {/* Hover accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-0 group-hover:opacity-40 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none glass-shimmer" />
            </div>
          </Link>

          {/* Manual Backtest Card */}
          <Link href="/backtest" className="group block">
            <div className="glass-panel p-6 w-64 transition-all duration-300 cursor-pointer hover:scale-[1.02] relative overflow-hidden">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,230,118,0.2)]"
                style={{ background: "rgba(0, 230, 118, 0.06)", border: "1px solid rgba(0, 230, 118, 0.1)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h2 className="font-display text-sm font-semibold text-[var(--text)] mb-1 group-hover:text-[var(--green)] transition-colors tracking-tight">Manual Backtest</h2>
              <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">Practice trading bar-by-bar on random historical days</p>
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--green)] to-transparent opacity-0 group-hover:opacity-40 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none glass-shimmer" />
            </div>
          </Link>
        </div>

        {/* Footer accent */}
        <p className="text-[8px] text-[var(--text-dim)] tracking-[0.3em] uppercase font-display">Spatial Analytics Engine</p>
      </div>
    </div>
  );
}
