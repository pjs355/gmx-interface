import { useMemo, useState } from "react";
import useWallet from "lib/wallets/useWallet";
import { type PredictionMarket } from "lib/predictionMarketDataService";
import { type Umbrella } from "lib/umbrellaDataService";
// import { useUSDCBalance } from "components/PredictionMarketTradeBox/checkBalances";
import { useCurrentPrices } from "context/CurrentPriceContext";
import { getOrderAggregates, getTradingReturns, type ProcessedOrder, type OrderAggregates } from "lib/simplifiedOrderService";
import { useUserData } from "context/UserDataContext";
import { usePredictionData } from "context/PredictionDataContext";
import "./Positions.scss";
import PositionsHeader from "./PositionsHeader";
import { usePortfolio } from "context/PortfolioContext";
import PositionsTabs from "./PositionsTabs";
import PositionsTableView from "./PositionsTableView";
import ResolvedPositionsTable from "./ResolvedPositionsTable";
import OrdersView from "./OrdersView";
import HistoryView from "./HistoryView";
import { useClaimEarnings } from "lib/claimEarnings";
import Footer from "components/Footer/Footer";

type MarketPosition = {
  market: PredictionMarket;
  yesBalance: number;
  noBalance: number;
  yesPrice: number | null;
  noPrice: number | null;
  yesValue: number;
  noValue: number;
  totalValue: number;
  orders: ProcessedOrder[];
  aggregates: OrderAggregates;
};

type UmbrellaPositions = {
  umbrella: Umbrella;
  markets: MarketPosition[];
};

export default function Positions() {
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  // unified balances via PortfolioContext
  const { portfolioTotal: portfolioTotalCtx, cashBalance: cashBalanceCtx, loading: portfolioLoading } = usePortfolio();
  const { orders, tokenBalances, loading: userDataLoading } = useUserData();
  const { umbrellas, getQuestionsForUmbrella, getAllQuestionsForUmbrella, loading: predictionLoading } = usePredictionData();
  const { getCurrentPrice, isLoading: pricesLoading } = useCurrentPrices();
  const { claim, isClaiming, error: claimError } = useClaimEarnings();
  // removed setPortfolioTotal – portfolio is computed in context

  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");
  const allUmbrellas = useMemo(() => {
    return umbrellas.map((umb) => ({ umbrella: umb, markets: (getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) || [] }));
  }, [umbrellas, getAllQuestionsForUmbrella]);

  // Effective account comes from unified resolver (smart -> embedded -> external)
  const effectiveAccount = account || null;

  // derive active positions
  const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
    if (!effectiveAccount) return [];
    return umbrellas
      .map((umbrella) => {
        const markets = (getQuestionsForUmbrella(umbrella._id) as PredictionMarket[]) || [];
        const processedMarkets: MarketPosition[] = markets
          .map((market) => {
            const marketId = market._id || market.questionId || market.marketId;
            const tb = marketId ? tokenBalances.get(marketId) : undefined;
            const yesBalance = tb ? Number(tb.yesBalance) : 0;
            const noBalance = tb ? Number(tb.noBalance) : 0;
            const yesPrice = marketId ? getCurrentPrice(marketId, 'yes') : null;
            const noPrice = marketId ? getCurrentPrice(marketId, 'no') : null;
            const yesValue = yesPrice ? yesBalance * yesPrice : 0;
            const noValue = noPrice ? noBalance * noPrice : 0;
            const totalValue = yesValue + noValue;
            const marketOrders = (orders || []).filter(order => order.questionId === marketId);
            const aggregates = getOrderAggregates(orders || [], marketId);
            return { market, yesBalance, noBalance, yesPrice, noPrice, yesValue, noValue, totalValue, orders: marketOrders, aggregates };
          })
          .filter(market => market.yesBalance > 0 || market.noBalance > 0);
        const activeMarkets = processedMarkets.filter(mp => (mp.market as any).status !== 'settled');
        return { umbrella, markets: activeMarkets };
      })
      .filter(umbrella => umbrella.markets.length > 0);
  }, [effectiveAccount, umbrellas, getQuestionsForUmbrella, tokenBalances, orders, getCurrentPrice]);

  // derive resolved winnings
  const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
    if (!effectiveAccount) return [];
    const resolved: UmbrellaPositions[] = [];
    allUmbrellas.forEach(({ umbrella, markets }) => {
      const res = markets
        .filter((m: any) => String(m?.status || '').toLowerCase() === 'settled')
        .map((m) => {
          const marketId = (m as any)._id || (m as any).questionId || (m as any).marketId;
          const tb = marketId ? tokenBalances.get(marketId) : undefined;
          const yesBalance = tb ? Number(tb.yesBalance) : 0;
          const noBalance = tb ? Number(tb.noBalance) : 0;
          return { market: m, yesBalance, noBalance } as any;
        })
        .filter((mp: any) => {
          const outcome = String((mp.market as any).resolvedOutcome || '').toLowerCase();
          return (outcome === 'yes' && mp.yesBalance > 0) || (outcome === 'no' && mp.noBalance > 0);
        })
        .map((mp: any) => ({
          market: mp.market,
          yesBalance: mp.yesBalance,
          noBalance: mp.noBalance,
          yesPrice: null,
          noPrice: null,
          yesValue: 0,
          noValue: 0,
          totalValue: 0,
          orders: [],
          aggregates: { Yes: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 }, No: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 } },
        } as MarketPosition));
      if (res.length > 0) resolved.push({ umbrella, markets: res });
    });
    return resolved;
  }, [effectiveAccount, allUmbrellas, tokenBalances]);

  // Calculate totals
  const positionsTotalValue = useMemo(() => {
    return umbrellaPositions.reduce((total, umbrella) => {
      return total + umbrella.markets.reduce((umbrellaTotal, market) => {
        return umbrellaTotal + market.totalValue;
      }, 0);
    }, 0);
  }, [umbrellaPositions]);

  // Portfolio totals are sourced from PortfolioContext to avoid flicker/duplication

  // Helper functions for display
  const toCentsString = (value?: number | null): string => {
    if (value === undefined || value === null || !isFinite(value)) return "--";
    return `${Math.round(value * 100)}¢`;
  };

  const getCurrentPriceForSide = (market: PredictionMarket, side: "Yes" | "No"): number | null => {
    const marketId = market._id || market.questionId || market.marketId;
    if (!marketId) return null;
    return getCurrentPrice(marketId, side.toLowerCase() as 'yes' | 'no');
  };

  // Convert to old format for compatibility with existing components
  // For Positions tab (only markets with positions)
  const umbrellaBalancesPositions = umbrellaPositions.map(up => ({
    umbrella: up.umbrella,
    markets: up.markets.map(mp => ({
      market: mp.market,
      yes: mp.yesBalance.toString(),
      no: mp.noBalance.toString(),
    }))
  }));

  // For Orders tab (all markets under umbrellas; OrdersView will filter to those that have open orders)
  const umbrellaBalancesOrders = allUmbrellas.map(({ umbrella, markets }) => ({
    umbrella,
    markets: markets.map((market) => ({
      market,
      yes: "0",
      no: "0",
    }))
  }));

  const returnsByQid = useMemo(() => {
    const map: Record<string, { Yes: number; No: number }> = {};
    umbrellaPositions.forEach(up => {
      up.markets.forEach(mp => {
        const marketId = mp.market._id || mp.market.questionId || mp.market.marketId;
        if (marketId) {
          try {
            const returns = getTradingReturns(orders || [], marketId);
            map[marketId] = { Yes: returns.yesPnL, No: returns.noPnL };
          } catch {}
        }
      });
    });

    return map;
  }, [umbrellaPositions, orders]);

  const aggregates = umbrellaPositions.reduce((acc, up) => {
    up.markets.forEach(mp => {
      const marketId = mp.market._id || mp.market.questionId || mp.market.marketId;
      if (marketId) {
        // Convert to the format expected by PositionsTableView
        acc[marketId] = {
          Yes: {
            avgPrice: mp.aggregates.Yes.avgPrice,
            cost: mp.aggregates.Yes.totalValue,
          },
          No: {
            avgPrice: mp.aggregates.No.avgPrice,
            cost: mp.aggregates.No.totalValue,
          },
        };
      }
    });
    return acc;
  }, {} as Record<string, any>);

  const spentByQid = umbrellaPositions.reduce((acc, up) => {
    up.markets.forEach(mp => {
      const marketId = mp.market._id || mp.market.questionId || mp.market.marketId;
      if (marketId) {
        acc[marketId] = {
          Yes: mp.aggregates.Yes.totalValue,
          No: mp.aggregates.No.totalValue,
        };
      }
    });
    return acc;
  }, {} as Record<string, { Yes: number; No: number }>);

  return (
    <div className="default-container page-layout">
      <div className="mb-2">
        <PositionsHeader
          portfolioTotal={portfolioTotalCtx ?? (cashBalanceCtx + positionsTotalValue)}
          positionsTotalValue={positionsTotalValue}
          usdcBalance={Number(cashBalanceCtx)}
          softLoading={loading || predictionLoading || userDataLoading || pricesLoading || portfolioLoading}
        />

        <PositionsTabs 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          onClaim={claim} 
          isClaiming={isClaiming}
        />
        
        {!account && <p className="text-body">Log in to view balances.</p>}
        {account && (
          <div className="mt-12">
            {error || claimError ? (
              <p className="error-message">{error || claimError}</p>
            ) : (
              (() => {
                const softLoading = loading || predictionLoading || userDataLoading || pricesLoading;
                const hasPositions = umbrellaPositions.length > 0;
                if (!hasPositions && !softLoading) {
                  return <p className="text-body">No positions found.</p>;
                }
                if (activeTab === "positions") {
                  return (
                    <>
                      {resolvedUmbrellaPositions.length > 0 && (
                        <div className="mb-24">
                          <h3 className="mb-6 text-20 font-bold" style={{ color: '#ffffff', fontSize: 34 }}>Winnings</h3>
                          <ResolvedPositionsTable
                            umbrellaBalances={resolvedUmbrellaPositions.map(up => ({
                              umbrella: up.umbrella,
                              markets: up.markets.map(mp => {
                                const outcome = String((mp.market as any).resolvedOutcome || '').toLowerCase();
                                const yes = outcome === 'yes' ? mp.yesBalance.toString() : '0';
                                const no = outcome === 'no' ? mp.noBalance.toString() : '0';
                                return { market: mp.market, yes, no };
                              })
                            }))}
                            toCentsString={toCentsString}
                            softLoading={softLoading}
                            onClaim={claim}
                            isClaiming={isClaiming}
                          />
                        </div>
                      )}
                      {resolvedUmbrellaPositions.length > 0 && (
                        <h3 className="mb-6 text-20 font-bold" style={{ color: '#ffffff', fontSize: 34, marginTop: 40 }}>Positions</h3>
                      )}
                      <PositionsTableView
                        umbrellaBalances={umbrellaBalancesPositions}
                        aggregates={aggregates}
                        spentByQid={spentByQid}
                        returnsByQid={returnsByQid}
                        getCurrentPriceForSide={getCurrentPriceForSide}
                        toCentsString={toCentsString}
                        softLoading={softLoading}
                      />
                    </>
                  );
                }
                if (activeTab === "orders") {
                  return <OrdersView umbrellaBalances={umbrellaBalancesOrders} orders={orders || []} />;
                }
                return (
                  <HistoryView
                    umbrellaBalances={umbrellaBalancesPositions}
                    returnsByQid={returnsByQid}
                    orders={orders || []}
                  />
                );
              })()
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}


