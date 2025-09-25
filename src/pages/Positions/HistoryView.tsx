import React from "react";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import { getFinalAmount } from "lib/simplifiedOrderService";
import gtaIcon from "img/ic_gtaVI_24.svg";

export default function HistoryView({ 
  umbrellaBalances, 
  returnsByQid,
  orders
}: { 
  umbrellaBalances: any[];
  returnsByQid: Record<string, { Yes: number; No: number }>;
  orders: any[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div
        className="grid items-center px-12 py-10"
        style={{
          gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr)",
          borderBottom: "1px solid #333333",
          color: "#888",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        <div>Market</div>
        <div style={{ textAlign: "center" }}>Final Position</div>
        <div style={{ textAlign: "center" }}>Settlement Payout</div>
        <div style={{ textAlign: "center" }}>Total Cost</div>
        <div style={{ textAlign: "center" }}>Total Payout</div>
        <div style={{ textAlign: "center" }}>Total Return</div>
      </div>

      <div className="flex flex-col">
        {umbrellaBalances.map(({ umbrella, markets }) => (
          <div key={umbrella._id} className="umbrella-block">
            <div
              className="grid px-12 py-10"
              style={{
                gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr)",
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

            {markets.map(({ market, yes, no }) => {
              const yesNum = Number(yes);
              const noNum = Number(no);
              const qid = market._id || market.questionId || market.marketId;
              
              // Calculate final amounts for this market
              const finalAmounts = qid ? getFinalAmount(orders, qid) : { yesShares: 0, noShares: 0, yesCost: 0, noCost: 0 };
              
              const rows: { side: "Yes" | "No"; amount: string }[] = [];
              if (yesNum > 0) rows.push({ side: "Yes", amount: yes });
              if (noNum > 0) rows.push({ side: "No", amount: no });

              return rows.map(({ side, amount }) => {
                const legPnls = qid ? returnsByQid[qid] : undefined;
                const legPnl = side === "Yes" ? (legPnls?.Yes || 0) : (legPnls?.No || 0);
                const totalReturnColor = legPnl >= 0 ? "#16a34a" : "#ef4444";
                const totalReturnText = legPnl === 0 ? "—" : `${legPnl >= 0 ? "+" : ""}$${legPnl.toFixed(2)}`;

                // Get final position and cost for this leg
                const finalShares = side === "Yes" ? finalAmounts.yesShares : finalAmounts.noShares;
                const finalCost = side === "Yes" ? finalAmounts.yesCost : finalAmounts.noCost;
                
                // Format shares - remove unnecessary decimals; show just the number (no label)
                const finalPositionText = finalShares > 0 ? `${finalShares % 1 === 0 ? finalShares.toFixed(0) : finalShares.toFixed(2)}` : "—";
                
                // Format USDC cost - remove unnecessary decimals
                const totalCostText = finalCost > 0 ? `$${finalCost % 1 === 0 ? finalCost.toFixed(0) : finalCost.toFixed(2)}` : "—";

                const title = (market?.displayName || (market as any)?.question || '').trim();
                const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
                const isVs = parts.length === 2;
                return (
                  <div
                    key={`${market._id}-${side.toLowerCase()}`}
                    className="grid items-center px-12 py-12"
                    style={{
                      gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr)",
                      borderBottom: "1px solid #1f1f1f",
                      fontSize: 16,
                    }}
                  >
                    <div style={{ color: "#fff", fontWeight: 600 }}>
                      {isVs ? (
                        <span>{side === "Yes" ? parts[0] : parts[1]}</span>
                      ) : (
                        <>
                          <span>{market.displayName || market.question} </span>
                          <span style={{ color: side === "Yes" ? "#16a34a" : "#ef4444" }}>{side}</span>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>{finalPositionText}</div>
                    <div style={{ textAlign: "center", color: "#fff" }}>—</div>
                    <div style={{ textAlign: "center", color: "#fff" }}>{totalCostText}</div>
                    <div style={{ textAlign: "center", color: "#fff" }}>—</div>
                    <div style={{ textAlign: "center", color: totalReturnColor }}>{totalReturnText}</div>
                  </div>
                );
              });
            })}
          </div>
        ))}
      </div>
    </div>
  );
}


