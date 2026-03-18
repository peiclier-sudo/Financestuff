import Link from "next/link";

export default function HomePage() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-center space-y-8 fade-in">
        <div>
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-ping opacity-30" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-[var(--text)] to-[var(--text-secondary)] bg-clip-text text-transparent">
              NDX Day Filter
            </h1>
          </div>
          <p className="text-[var(--text-muted)] text-sm">NASDAQ-100 intraday analysis & practice platform</p>
        </div>

        <div className="flex gap-5">
          {/* Dashboard Card */}
          <Link href="/dashboard" className="group block">
            <div
              className="glass-panel p-6 w-64 transition-all duration-300 cursor-pointer hover:scale-[1.02]"
              style={{ borderColor: "var(--glass-border)" }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(96,165,250,0.15)]"
                style={{ background: "rgba(96, 165, 250, 0.08)", border: "1px solid rgba(96, 165, 250, 0.12)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1.5 group-hover:text-[var(--accent)] transition-colors">Dashboard</h2>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Filter & analyze NDX trading days with strategy backtesting</p>
              {/* Glass shimmer on hover */}
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none glass-shimmer" />
            </div>
          </Link>

          {/* Manual Backtest Card */}
          <Link href="/backtest" className="group block">
            <div
              className="glass-panel p-6 w-64 transition-all duration-300 cursor-pointer hover:scale-[1.02]"
              style={{ borderColor: "var(--glass-border)" }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(0,230,118,0.15)]"
                style={{ background: "rgba(0, 230, 118, 0.08)", border: "1px solid rgba(0, 230, 118, 0.12)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1.5 group-hover:text-[var(--green)] transition-colors">Manual Backtest</h2>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Practice trading bar-by-bar on random historical days</p>
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none glass-shimmer" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
