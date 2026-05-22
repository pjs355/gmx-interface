import Button from "components/Button/Button";
import { mixpanelTrack } from "@/utils/mixpanel";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import {
	SorKalshiKycShortfallBanner,
	formatSorDetailsSharesDisplay,
	sorBuyPredictLegNetHeldShares,
	type RoutePlan,
	type RouteExecution,
	type SorExecutionPhase,
	type SorPrefundLegProgress,
} from "@/trading/sor";
import {
	SHARE_SELL_COMPARE_EPS,
	formatShareCountDisplay,
} from "../checkBalances";
import type { TradeBoxCoreState, TradeBoxProps } from "../types";
import type { TradeQuote } from "../tradeQuote/types";

export interface TradeBoxExecutionFooterProps {
	tradingVenue: TradingVenue;
	sorRoute: {
		displayRoute: RoutePlan | null;
		executionRoute: RoutePlan | null;
	};
	side: "buy" | "sell";
	buttonState: {
		text: string;
		disabled: boolean;
		onClick: () => void;
	};
	maxScopedSellShares: number;
	amount: string;
	outcomeSelection: "yes" | "no";
	yesTeamLabel: string;
	noTeamLabel: string;
	market: TradeBoxProps["market"];
	state: TradeBoxCoreState & { tradingVenue: TradingVenue };
	orderType: "market" | "limit";
	selectedPosition: "yes" | "no" | null;
	price: string;
	oddsData: {
		pct: number;
		avgPrice: number;
		isUpdated: boolean;
		fromPct: number | null;
	} | null;
	sellAvgCents: number | null;
	calculatedContracts: number | null | undefined;
	tradeQuote: TradeQuote;
	sorExecution: {
		execution: RouteExecution | null;
		isExecuting: boolean;
		executionPhase?: SorExecutionPhase;
		prefundLegProgress?: SorPrefundLegProgress | null;
		remainingBudget: number | null;
		requestReroute: () => Promise<number | null>;
		acceptResult: () => Promise<void>;
		resetExecution: () => void;
	};
	dflowUninitAtSubmit?: boolean;
	orderResult: TradeBoxCoreState["orderResult"];
	predictFunFeeRateBps?: number;
	dflowOrderQuoteForSentinel?: {
		contracts: number | null;
		amountAlignedWithQuote: boolean;
	};
}

export default function TradeBoxExecutionFooter(props: TradeBoxExecutionFooterProps) {
	const {
		tradingVenue,
		sorRoute,
		side,
		buttonState,
		maxScopedSellShares,
		amount,
		outcomeSelection,
		yesTeamLabel,
		noTeamLabel,
		market,
		state,
		orderType,
		selectedPosition,
		price,
		oddsData,
		sellAvgCents,
		calculatedContracts,
		tradeQuote,
		sorExecution,
		dflowUninitAtSubmit = false,
		orderResult,
		predictFunFeeRateBps,
		dflowOrderQuoteForSentinel,
	} = props;
	const venueConfig = getVenueConfig(tradingVenue);

	return (
		<>
      {(() => {
        const route =
          tradingVenue === "all"
            ? sorRoute.displayRoute
            : sorRoute.executionRoute;
        if (!route?.insufficientLiquidity) return null;
        const isSellRoute = route.side === "sell";
        return (
          <div className="trade-partial-fill-hint trade-button-above-hint">
            {isSellRoute
              ? "Not enough bids to sell all shares"
              : "Not enough shares to fill your order. Will fill partial order"}
          </div>
        );
      })()}
      {side === "sell" &&
        buttonState.text === "Not enough shares" &&
        maxScopedSellShares > 0 &&
        amount &&
        (() => {
          const n = parseFloat(amount);
          return (
            Number.isFinite(n) &&
            n > maxScopedSellShares + SHARE_SELL_COMPARE_EPS
          );
        })() && (
          <div className="trade-share-cap-hint trade-button-above-hint">
            {`${formatShareCountDisplay(maxScopedSellShares)} Shares ${
              outcomeSelection === "no" ? noTeamLabel : yesTeamLabel
            } on ${venueConfig.displayName}`}
          </div>
        )}

      {/* Trade Button */}
      <Button
        qa="tradebox-submit"
        variant="primary"
        onClick={() => {
          try {
            mixpanelTrack("TradeButtonClicked", {
              marketId: market?._id || market?.questionId,
              marketName: market?.displayName || market?.question,
              orderType: orderType,
              side: side,
              selectedPosition: selectedPosition,
              tradingVenue: state.tradingVenue,
              amount: amount,
              price: price,
              limitPriceProb:
                orderType === "limit" && price
                  ? Number(price) / 100
                  : null,
              derivedAvgFillPriceFromBook:
                orderType === "market" && oddsData
                  ? oddsData.avgPrice
                  : null,
              derivedAvgFillCents:
                orderType === "market" && oddsData
                  ? Math.round(oddsData.avgPrice * 100)
                  : null,
              marketSellAvgCents:
                orderType === "market" && side === "sell"
                  ? sellAvgCents
                  : null,
              estContracts: calculatedContracts,
              tradeQuoteSource: tradeQuote.source,
              buttonText: buttonState.text,
            });
          } catch (error) {
            console.error("error", error);
          }
          buttonState.onClick();
        }}
        disabled={buttonState.disabled}
        className="trade-button"
      >
        {buttonState.text}
      </Button>
      {/* The deposit-shortfall amount is already conveyed by the Buy button
          text via `useButtonState`'s `trySorDepositToTrade` path, so the
          standalone "Deposit needed $X" banner under the button was redundant
          and noisy — removed. */}
			{tradingVenue === "all" && sorRoute.displayRoute && (
				<SorKalshiKycShortfallBanner route={sorRoute.displayRoute} variant="tradebox" />
			)}

			{/* SOR execution result (partial / failed only — success has no fill summary banner) */}
      {tradingVenue === "all" &&
        sorExecution.execution &&
        !sorExecution.isExecuting &&
        sorExecution.execution.status !== "complete" && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            backgroundColor:
              sorExecution.execution.status === "partial"
                  ? "rgba(245, 158, 11, 0.08)"
                  : "rgba(239, 68, 68, 0.08)",
            color:
              sorExecution.execution.status === "partial"
                  ? "#f59e0b"
                  : "#ef4444",
          }}
        >
          {sorExecution.execution.status === "partial" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{side === "sell" ? "Partially sold" : "Partially filled"}: {formatSorDetailsSharesDisplay(sorExecution.execution.totalFilledShares)} shares</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => sorExecution.requestReroute()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #f59e0b",
                    backgroundColor: "transparent",
                    color: "#f59e0b",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Re-route {sorExecution.remainingBudget != null ? `$${sorExecution.remainingBudget.toFixed(2)}` : "remaining"}
                </button>
                <button
                  type="button"
                  onClick={() => sorExecution.acceptResult()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "transparent",
                    color: "#9ca3af",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Keep as-is
                </button>
              </div>
            </div>
          )}
          {sorExecution.execution.status === "failed" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{side === "sell" ? "Execution failed. Shares remain in your accounts." : "Execution failed. Funds remain in your wallets."}</span>
              <button
                type="button"
                onClick={() => sorExecution.resetExecution()}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                  color: "#9ca3af",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/*
        E2E / automation: outcome hook only (visually hidden — `e2e/page-objects/tradebox.ts` `waitForFill`).
        The error reason is exposed via `data-qa-fill-error` so the verbose payload never lands in
        the rendered DOM/toast — Playwright reads the attribute, the user sees the toast text only.
      */}
      {orderResult && (
        <div
          data-qa="tradebox-fill-confirmation"
          data-qa-fill-status={orderResult.success ? "success" : "error"}
          data-qa-fill-error={
            orderResult.success ? undefined : orderResult.error || ""
          }
          className="trade-notification-e2e-sentinel"
          aria-hidden="true"
        >
          <span className="trade-notification-e2e-sentinel__label">
            {orderResult.success ? "Order Submitted!" : "Order Failed"}
          </span>
        </div>
      )}

      {orderResult?.success && dflowUninitAtSubmit && (
        <div
          data-qa="tradebox-dflow-uninit-notice"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#9ca3af",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          Order may take longer as Kalshi via DFlow is creating this market
        </div>
      )}

      {/*
        E2E / automation: single-venue market quote hook (visually hidden — `e2e/page-objects/tradebox.ts`
        `readLegAttrs`, `readQuotedBuyCostUsd`, `readQuotedSellReceiveUsd`, `expandSorDetailsIfCollapsed`).
        Populated from `sorRoute.executionRoute` (the plan Submit signs). Kalshi/DFlow **market buy**:
        when the debounced Pond `/order/quote` matches the typed USD amount, `data-leg-num-shares`
        follows that quote’s contracts so QA matches post-fill `outAmount` / MyPositionsRow; otherwise
        the SOR leg (Predict uses net-held when bps known). When the route is null the sentinel is absent.
        The `aria-expanded="true"` toggle keeps the page object's expand helper a no-op without re-introducing
        the visible Details collapsible that was intentionally removed from the UI.
      */}
      {tradingVenue !== "all" &&
        orderType === "market" &&
        sorRoute.executionRoute &&
        sorRoute.executionRoute.legs.length > 0 && (() => {
          const route = sorRoute.executionRoute;
          const leg = route.legs[0];
          const legSide = route.side === "buy" ? "market-buy" : "market-sell";
          const dflowBuyQuoteShares =
            leg.venue === "dflow" &&
            legSide === "market-buy" &&
            dflowOrderQuoteForSentinel?.amountAlignedWithQuote &&
            dflowOrderQuoteForSentinel.contracts != null &&
            Number.isFinite(dflowOrderQuoteForSentinel.contracts) &&
            dflowOrderQuoteForSentinel.contracts > 0
              ? dflowOrderQuoteForSentinel.contracts
              : null;
          /** E2E `data-leg-num-shares`: DFlow market-buy prefers Pond quote when in sync; else gross SOR / Predict net-held. */
          const legNumSharesForDataQa =
            legSide === "market-buy"
              ? dflowBuyQuoteShares ?? sorBuyPredictLegNetHeldShares(leg, predictFunFeeRateBps)
              : leg.shares;
          const priceCents = Math.round(leg.avgPrice * 100);
          const sellReceiveUsd =
            typeof leg.executionAmountUsd === "number" &&
            Number.isFinite(leg.executionAmountUsd) &&
            leg.executionAmountUsd > 0
              ? leg.executionAmountUsd
              : route.totalCost;
          return (
            <div
              className="sor-details-panel tradebox-e2e-sentinel"
              aria-hidden="true"
            >
              <button
                type="button"
                tabIndex={-1}
                className="sor-details-toggle tradebox-e2e-sentinel__toggle"
                aria-expanded="true"
              />
              <div
                data-qa="sor-leg"
                data-leg-side={legSide}
                data-leg-venue={leg.venue}
                data-leg-num-shares={legNumSharesForDataQa}
                data-leg-price-cents={priceCents}
              />
              {route.side === "buy" && Number.isFinite(route.totalCost) && (
                <div
                  data-qa="sor-leg-cost"
                  data-cost-usd={route.totalCost}
                />
              )}
              {route.side === "sell" && Number.isFinite(sellReceiveUsd) && (
                <div
                  data-qa="tradebox-estimated-receive-usd"
                  data-receive-usd={sellReceiveUsd}
                />
              )}
            </div>
          );
        })()}

		</>
	);
}
