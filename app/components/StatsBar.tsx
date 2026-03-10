"use client";

interface Stats {
  count: number;
  bullishCount: number;
  bearishCount: number;
  bullishPct: number;
  avgChange: number;
  medianChange: number;
  avgGap: number | null;
  avgRange: number;
  medianRange: number;
  avgCloseLocation: number;
  maxGain: number;
  maxLoss: number;
}

interface Props {
  stats: Stats | null;
}

export default function StatsBar({ stats }: Props) {
  if (!stats) return null;

  return (
    <div className="glass-panel-sm px-3 py-2">
      <div className="flex items-center gap-4 flex-wrap text-[11px]">
        <Stat label="Bull/Bear" value={`${stats.bullishCount}/${stats.bearishCount}`}>
          <span className={stats.bullishPct > 50 ? "text-[var(--green)]" : "text-[var(--red)]"}>
            {stats.bullishPct.toFixed(0)}% bull
          </span>
        </Stat>
        <Sep />
        <Stat label="Avg Chg">
          <span className={stats.avgChange > 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
            {stats.avgChange > 0 ? "+" : ""}{stats.avgChange.toFixed(3)}%
          </span>
        </Stat>
        <Stat label="Med Chg">
          <span className={stats.medianChange > 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
            {stats.medianChange > 0 ? "+" : ""}{stats.medianChange.toFixed(3)}%
          </span>
        </Stat>
        <Sep />
        {stats.avgGap !== null && (
          <>
            <Stat label="Avg Gap">
              <span className={stats.avgGap > 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
                {stats.avgGap > 0 ? "+" : ""}{stats.avgGap.toFixed(3)}%
              </span>
            </Stat>
            <Sep />
          </>
        )}
        <Stat label="Avg Rng" value={`${stats.avgRange.toFixed(2)}%`} />
        <Stat label="Med Rng" value={`${stats.medianRange.toFixed(2)}%`} />
        <Sep />
        <Stat label="Close Loc" value={`${(stats.avgCloseLocation * 100).toFixed(0)}%`} />
        <Sep />
        <Stat label="Max+">
          <span className="text-[var(--green)]">+{stats.maxGain.toFixed(2)}%</span>
        </Stat>
        <Stat label="Max−">
          <span className="text-[var(--red)]">{stats.maxLoss.toFixed(2)}%</span>
        </Stat>
      </div>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--text-dim)] text-[10px] uppercase tracking-wide">{label}</span>
      <span className="font-[JetBrains_Mono,monospace] font-medium text-[11px]">{children ?? value}</span>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-3 bg-[var(--border)]" />;
}
