import React from "react";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import type { Umbrella } from "lib/umbrellaDataService";
import gtaIcon from "img/ic_gtaVI_24.svg";
import { triggerFireworksForElement } from "./Fireworks";

export default function ResolvedPositionsTable({
  umbrellaBalances,
  toCentsString,
  softLoading = false,
}: {
  umbrellaBalances: Array<{
    umbrella: Umbrella;
    markets: Array<{ market: PredictionMarket; yes: string; no: string }>;
  }>;
  toCentsString: (n?: number | null) => string;
  softLoading?: boolean;
}) {
  const formatCurrency = (value?: number | null): string => {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    const isInt = Math.abs(value % 1) < 1e-9;
    return `$${isInt ? value.toFixed(0) : value.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <div
        className="positions-header grid items-center px-12 py-10"
        style={{
          gridTemplateColumns: "minmax(200px, 2fr) repeat(3, 1fr) 1fr",
          borderBottom: "1px solid #333333",
          color: "#888",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        <div>Market</div>
        <div style={{ textAlign: "center" }}>Shares</div>
        <div style={{ textAlign: "center" }}>Settlement Payout</div>
        <div style={{ textAlign: "center" }}>Total Payout</div>
        <div style={{ textAlign: "center" }}></div>
      </div>

      <div className="flex flex-col">
        {umbrellaBalances.map(({ umbrella, markets }) => (
          <div key={umbrella._id} className="umbrella-block">
            <div
              className="grid px-12 py-10"
              style={{
                gridTemplateColumns: "minmax(200px, 2fr) repeat(4, 1fr)",
                background: "#000000",
                borderBottom: "1px solid #1f1f1f",
                paddingTop: 16,
                paddingBottom: 16,
              }}
            >
              <div style={{ gridColumn: "1 / -1", fontWeight: 700, color: "#dedede", fontSize: 20, display: "flex", alignItems: "center", gap: "12px" }}>
                <img src={gtaIcon} alt="umbrella" width={48} height={48} style={{ display: "block" }} />
                {umbrella.displayName}
              </div>
            </div>

            {softLoading && markets.length === 0 && (
              <div className="grid items-center px-12 py-12 position-row" style={{ gridTemplateColumns: "minmax(200px, 2fr) repeat(3, 1fr) 1fr", borderBottom: "1px solid #1f1f1f", fontSize: 16 }}>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} style={{ textAlign: idx === 0 ? undefined : "center", color: "#fff" }}>
                    <span className="skeleton-box" style={{ display: 'inline-block', width: idx === 0 ? 220 : 80, height: 16, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            )}

            {markets.map(({ market, yes, no }) => {
              const title = (market?.displayName || (market as any)?.question || '').trim();
              const winningShares = (() => {
                const resolvedOutcome = String((market as any).resolvedOutcome || '').toLowerCase();
                if (resolvedOutcome === 'yes') return Number(yes);
                if (resolvedOutcome === 'no') return Number(no);
                return 0;
              })();
              const settlementPayout = 1; // $1 fixed per winning share
              const totalPayout = winningShares * settlementPayout;

              // Derive display name to mirror Positions table logic
              const resolvedOutcome = String((market as any).resolvedOutcome || '').toLowerCase();
              const winningSideLabel: 'Yes' | 'No' = resolvedOutcome === 'yes' ? 'Yes' : 'No';
              const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
              const isVs = parts.length === 2;
              const yesColor = '#16a34a';
              const noColor = '#ef4444';

              return (
                <div key={(market._id || market.questionId || market.marketId) as string} className="grid items-center px-12 py-12 position-row" style={{ gridTemplateColumns: "minmax(200px, 2fr) repeat(3, 1fr) 1fr", borderBottom: "1px solid #1f1f1f", fontSize: 16 }}>
                  <div style={{ color: "#fff", fontWeight: 600 }}>
                    {isVs ? (
                      <span>{winningSideLabel === 'Yes' ? parts[0] : parts[1]}</span>
                    ) : (
                      <>
                        <span>{title} </span>
                        <span style={{ color: winningSideLabel === 'Yes' ? yesColor : noColor }}>{winningSideLabel}</span>
                      </>
                    )}
                  </div>
                  <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{winningShares}</span>
                    </div>
                  <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>$1</span>
                    </div>
                  <div style={{ textAlign: "center", color: "#16a34a", fontWeight: 700, fontSize: 20 }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{formatCurrency(totalPayout)}</span>
                    </div>
                  <div style={{ textAlign: "center" }}>
                    <ClaimButton />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimButton() {
  const [claiming, setClaiming] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);

  const handleClick = () => {
    if (claiming) return;
    setClaiming(true);
    if (btnRef.current) {
      triggerFireworksForElement(btnRef.current);
    }
    setTimeout(() => setClaiming(false), 3000);
  };

  return (
    <button
      ref={btnRef}
      className="side-btn"
      style={{
        background: claiming ? "#6d28d9" : "#7c3aed",
        color: "#fff",
        border: "none",
        padding: "10px 16px",
        borderRadius: 6,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease",
        boxShadow: claiming ? "0 0 0 0 rgba(0,0,0,0)" : "0 4px 10px rgba(124, 58, 237, 0.35)",
      }}
      onMouseEnter={(e) => {
        if (!claiming) (e.currentTarget as HTMLButtonElement).style.background = "#8b5cf6";
      }}
      onMouseLeave={(e) => {
        if (!claiming) (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed";
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
      onClick={handleClick}
    >
      {claiming ? "Claiming..." : "Claim Winnings"}
    </button>
  );
}



