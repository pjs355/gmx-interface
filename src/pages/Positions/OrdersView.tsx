import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useWallet from "lib/wallets/useWallet";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import type { OrderbookSnapshot } from "lib/orderbookService";
import type { ProcessedOrder } from "lib/simplifiedOrderService";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import type { Umbrella } from "lib/umbrellaDataService";
import { cancelOrder } from "lib/simplifiedOrderService";
import gtaIcon from "img/ic_gtaVI_24.svg";
import { resolveLogoByTags, collectTagsFromUmbrella } from "../Predictions/utils/gameLogoResolver";

type NormalizedOpenOrder = {
  orderId?: string;
  questionId?: string;
  side: "buy" | "sell";
  price?: number;
  size?: number;
  ts?: number;
  tokenId?: string;
  status?: string;
};

export default function OrdersView({ umbrellaBalances, orders }: { umbrellaBalances: any[]; orders: ProcessedOrder[] }) {
  const { account } = useWallet();
  const { user } = usePrivy();
  const { wallets: privyWallets } = usePrivyWallets();
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

  // Filter orders to only show unfilled (open) orders
  const ordersByMarket = useMemo(() => {
    const unfilledOrders = orders.filter(order => !order.filled && Number(order.size) > 0);
    const grouped: Record<string, ProcessedOrder[]> = {};
    
    unfilledOrders.forEach(order => {
      const questionId = order.questionId;
      if (!grouped[questionId]) {
        grouped[questionId] = [];
      }
      grouped[questionId].push(order);
    });
    
    return grouped;
  }, [orders]);

  // Track canceling state and optimistic removal
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 3), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col gap-8">
      <div
        className="grid items-center px-12 py-10"
        style={{
          gridTemplateColumns: "minmax(200px, 2fr) repeat(4, 1fr)",
          borderBottom: "1px solid #333333",
          color: "#888",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        <div>Market</div>
        <div style={{ textAlign: "center" }}>Side</div>
        <div style={{ textAlign: "center" }}>Price</div>
        <div style={{ textAlign: "center" }}>Shares</div>
        <div style={{ textAlign: "center" }}>Cancel</div>
      </div>

      <div className="flex flex-col">
        {umbrellaBalances.map(({ umbrella, markets }) => {
          // Collect only markets under this umbrella that have open orders
          const marketsWithOrders = markets.filter(({ market }: any) => {
            const qid = market._id || market.questionId || market.marketId;
            return qid && Array.isArray(ordersByMarket[qid]) && ordersByMarket[qid].length > 0;
          });
          if (marketsWithOrders.length === 0) return null;

          return (
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
                {(() => {
                  const logo = resolveLogoByTags(collectTagsFromUmbrella(umbrella)) || gtaIcon;
                  return (
                    <img
                      src={(umbrella as any).image || logo}
                      alt="umbrella"
                      width={48}
                      height={48}
                      style={{ display: "block", background: "#000", borderRadius: 8, objectFit: "contain" }}
                    />
                  );
                })()}
                  {umbrella.displayName}
                </div>
              </div>

              {marketsWithOrders.map(({ market }: any) => {
                const qid = market._id || market.questionId || market.marketId;
                const list = (ordersByMarket[qid] || []).filter((o) => !removedIds.has(o.orderId));
                return list.map((o) => (
                  <div 
                    key={`${qid}-${o.orderId}`} 
                    className="grid items-center px-12 py-12 order-row" 
                    style={{ 
                      gridTemplateColumns: "minmax(200px, 2fr) repeat(4, 1fr)", 
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
                    onClick={() => navigateToTradingPage(umbrella, market, o.position?.toLowerCase() as 'yes' | 'no')}
                  >
                    <div style={{ color: "#fff", fontWeight: 600 }}>
                      {(() => {
                        const title = (market?.displayName || (market as any)?.question || '').trim();
                        const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
                        const isVs = parts.length === 2;
                        if (isVs) {
                          return <span>{o.position === 'Yes' ? parts[0] : parts[1]}</span>;
                        }
                        return (
                          <>
                            {(market.displayName || market.question)}{" "}
                            {o.position === 'Yes' && (
                              <span style={{ color: "#16a34a" }}>Yes</span>
                            )}
                            {o.position === 'No' && (
                              <span style={{ color: "#ef4444" }}>No</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ textAlign: "center", color: o.side === "buy" ? "#16a34a" : "#ef4444" }}>
                      {o.side === 'buy' ? 'Buy' : 'Sell'}
                    </div>
                    <div style={{ textAlign: "center", color: "#fff" }}>{o.price !== undefined ? `${Math.round((o.price || 0) * 100)}¢` : "—"}</div>
                    <div style={{ textAlign: "center", color: "#fff" }}>{o.size !== undefined ? Number(o.size).toFixed(2) : "—"}</div>
                    <div style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        style={{
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          cursor: cancelingIds.has(o.orderId) ? "default" : "pointer",
                          opacity: cancelingIds.has(o.orderId) ? 0.7 : 1,
                        }}
                        onClick={async (e) => {
                          e.stopPropagation(); // Prevent row click when canceling
                          if (cancelingIds.has(o.orderId)) return;
                          setCancelingIds((prev) => new Set(prev).add(o.orderId));
                          try {
                            const res = await cancelOrder(o.orderId);
                            console.log('Cancel order result:', res);
                          } catch (e) {
                            console.error('Cancel order error:', e);
                          } finally {
                            setTimeout(() => {
                              setRemovedIds((prev) => new Set(prev).add(o.orderId));
                              setCancelingIds((prev) => {
                                const ns = new Set(prev);
                                ns.delete(o.orderId);
                                return ns;
                              });
                            }, 3000);
                          }
                        }}
                      >
                        {cancelingIds.has(o.orderId) ? `Canceling${".".repeat((tick % 3) + 1)}` : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ));
              })}
            </div>
          );
        })}

        {umbrellaBalances.length > 0 && Object.keys(ordersByMarket).length === 0 && (
          <div className="grid items-center px-12 py-12" style={{ gridTemplateColumns: "minmax(200px, 2fr) repeat(4, 1fr)", borderBottom: "1px solid #1f1f1f" }}>
            <div style={{ color: "#fff", fontWeight: 600 }}>No open orders found</div>
            <div style={{ textAlign: "center", color: "#fff" }}>—</div>
            <div style={{ textAlign: "center", color: "#fff" }}>—</div>
            <div style={{ textAlign: "center", color: "#fff" }}>—</div>
            <div style={{ textAlign: "center", color: "#fff" }}>—</div>
          </div>
        )}
      </div>
    </div>
  );
}


