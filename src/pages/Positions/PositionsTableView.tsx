import { useNavigate } from "react-router-dom";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import type { Umbrella } from "lib/umbrellaDataService";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";
import gtaIcon from "img/ic_gtaVI_24.svg";

export default function PositionsTableView({
  umbrellaBalances,
  aggregates,
  spentByQid,
  returnsByQid,
  getCurrentPriceForSide,
  toCentsString,
  softLoading = false,
}: {
  umbrellaBalances: any[];
  aggregates: Record<string, any>;
  spentByQid: Record<string, { Yes: number; No: number }>;
  returnsByQid: Record<string, { Yes: number; No: number }>;
  getCurrentPriceForSide: (market: PredictionMarket, side: "Yes" | "No") => number | null;
  toCentsString: (n?: number | null) => string;
  softLoading?: boolean;
}) {
  const navigate = useNavigate();

  // Navigation function to go to trading page with specific market and position
  const navigateToTradingPage = (umbrella: Umbrella, market: PredictionMarket, position: 'yes' | 'no') => {
    // Store the umbrella and market data
    localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
    localStorage.setItem("currentPredictionMarket", JSON.stringify(market));
    localStorage.setItem("activePosition", position);
    
    // Store the selected market ID so it becomes the active market on the trading page
    const marketId = market._id || market.questionId || market.marketId;
    if (marketId) {
      localStorage.setItem("selectedMarketId", marketId);
    }
    
    // Navigate to the trading page
    navigate(`/predictions/umbrella/${umbrella._id}`);
  };
  const formatCurrency = (value?: number | null): string => {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    const isInt = Math.abs(value % 1) < 1e-9;
    return `$${isInt ? value.toFixed(0) : value.toFixed(2)}`;
  };
  return (
    <div className="flex flex-col gap-8">
      <style>{`
        .custom-tooltip {
          background-color: black !important;
          color: white !important;
          border: 1px solid #d1d5db !important; /* light grey */
          text-transform: none !important; /* ensure normal case */
          font-weight: normal !important;
        }
      `}</style>
      <ScrollableTable minWidth="800px">
        <div
          className="positions-header grid items-center px-12 py-10"
          style={{
            gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr)",
            borderBottom: "1px solid #333333",
            color: "#888",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
        <div>Market</div>
        <div style={{ textAlign: "center" }}>Current Price</div>
        <div style={{ textAlign: "center" }}>Shares</div>
        <div style={{ textAlign: "center" }}>Avg Price</div>
        <div style={{ textAlign: "center" }}>Cost</div>
        <div style={{ textAlign: "center" }}>Payout if correct</div>
        <div style={{ textAlign: "center" }}>Market Value</div>
        <div style={{ textAlign: "center" }}>
          <Tooltip
            content="Total return includes market value of current positions and any past past you have bought or sold."
            position="top"
            tooltipClassName="custom-tooltip"
          >
            Total Return
          </Tooltip>
        </div>
        </div>

        <div className="flex flex-col">
        {umbrellaBalances.map(({ umbrella, markets }: any) => (
          <div key={umbrella._id} className="umbrella-block">
            <div
              className="grid px-12 py-10"
              style={{
                gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr)",
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
              <div className="grid items-center px-12 py-12 position-row" style={{ gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr)", borderBottom: "1px solid #1f1f1f", fontSize: 16 }}>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} style={{ textAlign: idx === 0 ? undefined : "center", color: "#fff" }}>
                    <span className="skeleton-box" style={{ display: 'inline-block', width: idx === 0 ? 220 : 80, height: 16, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            )}

            {markets.map(({ market, yes, no }: any) => {
              const yesNum = Number(yes);
              const noNum = Number(no);
              const rows: { side: "Yes" | "No"; amount: string }[] = [];
              if (yesNum > 0) rows.push({ side: "Yes", amount: yes });
              if (noNum > 0) rows.push({ side: "No", amount: no });

              return rows.map(({ side, amount }) => {
                const currentPrice = getCurrentPriceForSide(market, side);
                const sharesNum = Number(amount);
                const marketValue = currentPrice === null ? null : currentPrice * sharesNum;
                const payoutIfCorrect = isNaN(sharesNum) ? null : sharesNum; // $1 per share
                const qid = market._id || market.questionId || market.marketId;
                const sideAgg = aggregates[qid] ? (aggregates[qid] as any)[side] as { avgPrice: number | null; cost: number | null } : undefined;

                const effectiveAvgPrice = (sideAgg && sideAgg.avgPrice !== null)
                  ? sideAgg.avgPrice
                  : null;
                const fallbackSpent = spentByQid[qid]?.[side as "Yes" | "No"];
                const effectiveCost = (sideAgg && sideAgg.cost !== null && sideAgg.cost !== undefined)
                  ? (sideAgg.cost as number)
                  : (typeof fallbackSpent === "number" ? fallbackSpent : null);

                // Preserve existing calculation, then add realized PnL for this leg if present
                const baseReturn = (marketValue === null || effectiveCost === null) ? null : (marketValue - effectiveCost);
                const realizedLegPnl = (() => {
                  if (!qid) return 0;
                  const legPnls = returnsByQid[qid];
                  if (!legPnls) return 0;
                  return side === "Yes" ? (legPnls.Yes || 0) : (legPnls.No || 0);
                })();
                const totalReturn = baseReturn === null ? null : (baseReturn + realizedLegPnl);
                const totalReturnPct = (totalReturn !== null && effectiveCost && effectiveCost > 0)
                  ? (totalReturn / effectiveCost) * 100
                  : null;
                const totalReturnColor = totalReturn === null
                  ? "#fff"
                  : (totalReturn >= 0 ? "#16a34a" : "#ef4444");
                const totalReturnText = (() => {
                  if (totalReturn === null || !isFinite(totalReturn)) return "—";
                  const signUsd = totalReturn >= 0 ? "+" : "-";
                  const usdPart = formatCurrency(Math.abs(totalReturn));
                  if (totalReturnPct === null || !isFinite(totalReturnPct)) {
                    return `${signUsd}${usdPart}`;
                  }
                  const signPct = totalReturnPct >= 0 ? "+" : "-";
                  const pctPart = `${Math.round(Math.abs(totalReturnPct))}%`;
                  return `${signUsd}${usdPart} (${signPct}${pctPart})`;
                })();

                // Derive team labels for single-market VS titles
                const title = (market?.displayName || (market as any)?.question || '').trim();
                const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
                const isVs = parts.length === 2;
                const primaryLabel = isVs ? parts[0] : (market.displayName || (market as any).question);
                const secondaryLabel = isVs ? parts[1] : '';

                return (
                  <div
                    key={`${market._id}-${side.toLowerCase()}`}
                    className="grid items-center px-12 py-12 position-row"
                    style={{
                      gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr)",
                      borderBottom: "1px solid #1f1f1f",
                      fontSize: 16,
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#2a2a2a";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onClick={() => navigateToTradingPage(umbrella, market, side.toLowerCase() as 'yes' | 'no')}
                  >
                    <div style={{ color: "#fff", fontWeight: 600 }}>
                      {isVs ? (
                        <span>{side === "Yes" ? primaryLabel : secondaryLabel}</span>
                      ) : (
                        <>
                          <span>{market.displayName || market.question} </span>
                          <span style={{ color: side === "Yes" ? "#16a34a" : "#ef4444" }}>{side}</span>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{toCentsString(currentPrice)}</span>
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{amount}</span>
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{effectiveAvgPrice === null ? "—" : toCentsString(effectiveAvgPrice)}</span>
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{effectiveCost === null || effectiveCost === undefined ? "—" : formatCurrency(effectiveCost)}</span>
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{payoutIfCorrect === null || payoutIfCorrect === undefined ? "—" : formatCurrency(payoutIfCorrect)}</span>
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{marketValue === null || marketValue === undefined || isNaN(marketValue) ? "—" : formatCurrency(marketValue)}</span>
                    </div>
                    <div style={{ textAlign: "center", color: totalReturnColor, fontWeight: "bold" }}>
                      <span className={softLoading ? "soft-blur" : undefined}>{totalReturnText}</span>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        ))}
        </div>
      </ScrollableTable>
    </div>
  );
}


