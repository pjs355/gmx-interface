import React from "react";
import { useUserData } from "context/UserDataContext";

type MarketLike = {
  _id: string;
  questionId?: string;
  marketId?: string;
  yesTokenId?: string;
  noTokenId?: string;
  displayName?: string;
  question?: string;
  umbrellaChildrenCount?: number;
};

export function MyPositionsRow({ market }: { market: MarketLike }) {
  const { getTokenBalance } = useUserData();
  
  // Get market ID for lookup
  const marketId = market._id || market.questionId || market.marketId;
  const tokenBalance = marketId ? getTokenBalance(marketId) : null;
  
  const yesNum = tokenBalance ? Number(tokenBalance.yesBalance) : 0;
  const noNum = tokenBalance ? Number(tokenBalance.noBalance) : 0;
  const showYes = yesNum > 0;
  const showNo = noNum > 0;
  const showRow = showYes || showNo;

  // Single VS market detection and team labels
  const isVsSingle = (() => {
    const title = ((market as any)?.displayName || (market as any)?.question || '').trim();
    const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
    return parts.length === 2 && ((market as any)?.umbrellaChildrenCount === 1);
  })();
  const teamLabels = (() => {
    if (!isVsSingle) return { yesLabel: 'Yes', noLabel: 'No' };
    const title = ((market as any)?.displayName || (market as any)?.question || '').trim();
    const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
    return parts.length === 2 ? { yesLabel: parts[0], noLabel: parts[1] } : { yesLabel: 'Yes', noLabel: 'No' };
  })();
  const yesTeamColor: string | undefined = (market as any)?.yesColor;
  const noTeamColor: string | undefined = (market as any)?.noColor;

  if (!showRow) return null;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 400, color: "#6B7280" }}>My position</div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        {showYes && (
          <div style={{ fontSize: 14, fontWeight: 700, color: isVsSingle ? (yesTeamColor || "#ffffff") : "#22c55e" }}>
            {yesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} {isVsSingle ? teamLabels.yesLabel : 'Yes'} Shares
          </div>
        )}
        {showNo && (
          <div style={{ fontSize: 14, fontWeight: 700, color: isVsSingle ? (noTeamColor || "#ffffff") : "#ef4444" }}>
            {noNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} {isVsSingle ? teamLabels.noLabel : 'No'} Shares
          </div>
        )}
      </div>
    </div>
  );
}