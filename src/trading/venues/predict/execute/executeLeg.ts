import { formatUnits } from "viem";
import {
	formatErrorForUser,
	userMessage,
	SOR_PREDICT_MARKET_NOT_LOADED,
	SOR_PREDICT_MISSING_TOKEN,
	SOR_PREDICT_NOT_APPROVED,
	SOR_PREDICT_SESSION_NOT_READY,
} from "@/errors";
import { predictFunNetOutcomeSharesHeldAfterBuy } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feePredict";
import { wireAmountUsdForVenue } from "@/trading/sor/core/wireAmount";
import type { SorLegResult } from "@/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/trading/sor/execute/venueLegContext";
import { readFundingStableBalancesForChains } from "@/trading/sor/prefund/fundingStableBalances";
import { clampMarketBuyAmountToWallet } from "@/trading/sor/prefund/postBridgeOrderResize";
import { validateLegMinimum } from "@/trading/sor/route/sorPreflight";
import { floorSharesAtDecimalsAsString } from "@/trading/utils/floorShares";
import { predictBookNeedsComplementForSorOutcome } from "@/trading/venues/predict/book/predictSingleMarketBook";
import { clampPredictSellSharesToOutcomeBalance } from "@/trading/venues/predict/trade/predictSellShareClamp";
import { readPredictOutcomeShareWei } from "@/trading/venues/predict/wallet/usePredictBnbBalances";

export async function executeLeg(input: VenueLegDispatchInput): Promise<SorLegResult> {
	const {
		leg,
		side,
		routeCtx,
		fundingAddresses,
		isLimit,
		limitPrice,
		deps,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
	} = input;

	const {
		tradeExecutionService,
		polyClob,
		predictSession,
		privateApi,
		market,
		matchedMonitor,
		umbrellaId,
		predictNumericId,
		predictMarketDetail,
		account,
		getClientForChain,
		solanaSigner,
		getRelayClient,
		dflowProofVerified,
		predictApprovalsOk,
		predictTokenId,
		ensureLevelUpApprovals,
		ensurePredictApprovals,
		ensurePolymarketApprovals,
		ensureLimitlessApprovals,
		buildLimitlessSignedOrderFromMarket,
		getLimitlessOwnerId,
		getLimitlessMakerAddress,
		ensureDflowProofVerified,
	} = deps;

	if (!predictSession.ready) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_PREDICT_SESSION_NOT_READY),
							};
						}
						if (ensurePredictApprovals) {
							reportSorExecutionPhase("approving_trades");
							try {
								await ensurePredictApprovals();
							} catch (e: unknown) {
								console.error("error", e);
								return {
									filled: false,
									filledShares: 0,
									error: formatErrorForUser(e),
								};
							} finally {
								reportSorExecutionPhase("executing_trade");
							}
						} else if (!predictApprovalsOk) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_PREDICT_NOT_APPROVED),
							};
						}

						if (!predictTokenId) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_PREDICT_MISSING_TOKEN),
							};
						}
						const tokenId = predictTokenId;

						if (predictNumericId == null || !predictMarketDetail) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_PREDICT_MARKET_NOT_LOADED),
							};
						}

						const preflight = validateLegMinimum(leg, side);
						if (!preflight.ok) {
							return { filled: false, filledShares: 0, error: preflight.error };
						}

						/**
						 * SELL: pre-flight clamp planned shares against the EOA's
						 * actual on-chain ERC-1155 outcome balance. Predict's REST
						 * positions feed (which seeds `sorVenuePositions`) lags the
						 * chain and counts CTF locked in resting limit sells, so a
						 * "max" sell often plans 1–3% more shares than the wallet
						 * can transfer. Predict's CTF Exchange pre-trade hook is
						 * `balanceOf(maker, tokenId) >= makerAmount`, so the order
						 * would be rejected with `create_order_insufficient_shares_balance`.
						 * Reading the chain here and shrinking `leg.shares` to fit —
						 * mirroring Polymarket's `clampMarketSellSharesToCtfBalance`
						 * pattern — prevents the rejection on the first attempt.
						 */
						const predictEoa = fundingAddresses.embeddedEoa;
						let predictSellShares = leg.shares;
						let predictSellScale = 1;
						if (side === "sell") {
							let outcomeBalWei: bigint;
							try {
								outcomeBalWei = await readPredictOutcomeShareWei({
									account: predictEoa,
									tokenId,
									isNegRisk: predictMarketDetail.isNegRisk,
									isYieldBearing: predictMarketDetail.isYieldBearing,
								});
							} catch (e: unknown) {
								console.error("error", e);
								return {
									filled: false,
									filledShares: 0,
									error: formatErrorForUser(e),
								};
							}
							const clamp = clampPredictSellSharesToOutcomeBalance({
								plannedShares: leg.shares,
								erc1155BalanceWei: outcomeBalWei,
							});
							if (!clamp.ok) {
								return { filled: false, filledShares: 0, error: clamp.error };
							}
							if (clamp.resized) {
								console.debug("[SOR][sell-clamp] predictfun", {
									venue: "predictfun",
									tokenIdTail: tokenId.slice(-8),
									plannedShares: Number(leg.shares.toFixed(6)),
									outcomeBalanceShares: Number(
										Number(formatUnits(outcomeBalWei, 18)).toFixed(6),
									),
									clampedShares: Number(clamp.amountShares.toFixed(6)),
									scale: Number(clamp.scale.toFixed(6)),
								});
							}
							predictSellShares = clamp.amountShares;
							predictSellScale = clamp.scale;
						}

						if (isLimit) {
							try {
								const resp = await predictSession.placeLimitOrder({
									market: predictMarketDetail,
									tokenId,
									side,
									priceCents: leg.limitPriceCents as number,
									sizeShares:
										side === "sell"
											? floorSharesAtDecimalsAsString(predictSellShares, 6)
											: floorSharesAtDecimalsAsString(leg.shares, 6),
								});
								return {
									filled: true,
									filledShares:
										side === "sell"
											? leg.shares * predictSellScale
											: predictFunNetOutcomeSharesHeldAfterBuy(
													leg.shares,
													leg.avgPrice,
													predictMarketDetail.feeRateBps,
												),
									txHash: (resp as { orderHash?: string } | undefined)?.orderHash,
								};
							} catch (e: unknown) {
								console.error("error", e);
								throw new Error(formatErrorForUser(e));
							}
						}

						/**
						 * Wire `amount` for Predict.fun BUY is the **notional** USDT
						 * (`max(0, executionAmountUsd - leg.fee)`). Predict's CTF on
						 * BNB Chain pulls `wire amount` USDT and deducts the protocol
						 * fee from outcome tokens (token-side fee). The Predict API's
						 * collateral check requires `wallet >= wire + fee`; we bridge
						 * `executionAmountUsd` (= notional + fee) to the EOA so the
						 * check passes.
						 *
						 * If LI.FI under-delivered, `clampMarketBuyAmountToWallet`
						 * shrinks `wire` to fit `wallet - fee - dust`. The returned
						 * `scale` propagates to `filledShares`.
						 */
						let predictBuyAmountUsd = wireAmountUsdForVenue(leg);
						let predictPostBridgeScale = 1;
						if (side === "buy") {
							let bnbUsdtHuman: number;
							try {
								const balances = await readFundingStableBalancesForChains(
									{ embeddedEoa: fundingAddresses.embeddedEoa },
									["bnb"],
								);
								bnbUsdtHuman = balances.bnb ?? 0;
							} catch (e: unknown) {
								return {
									filled: false,
									filledShares: 0,
									error: formatErrorForUser(e),
								};
							}
							const clamp = clampMarketBuyAmountToWallet({
								plannedExecutionUsd: predictBuyAmountUsd,
								walletUsd: bnbUsdtHuman,
								feeEstimateUsd: leg.fee,
								minOrderUsd: 1,
							});
							if (!clamp.ok) {
								return { filled: false, filledShares: 0, error: clamp.error };
							}
							console.debug("[SOR][wire] predictfun", {
								venue: "predictfun",
								executionAmountUsd: Number(leg.executionAmountUsd.toFixed(6)),
								feeUsd: Number(leg.fee.toFixed(6)),
								plannedWireUsd: Number(predictBuyAmountUsd.toFixed(6)),
								walletUsdtUsd: Number(bnbUsdtHuman.toFixed(6)),
								finalWireUsd: Number(clamp.amountUsd.toFixed(6)),
								scale: Number(clamp.scale.toFixed(6)),
								resized: clamp.resized,
							});
							predictBuyAmountUsd = clamp.amountUsd;
							predictPostBridgeScale = clamp.scale;
						}
						const amountStr =
							side === "buy"
								? predictBuyAmountUsd.toFixed(6)
								: floorSharesAtDecimalsAsString(predictSellShares, 6);

						const complementOrderbook = predictBookNeedsComplementForSorOutcome(
							matchedMonitor,
							leg.outcome,
						);

						try {
							const resp = await predictSession.placeMarketOrder({
								marketId: predictNumericId,
								market: predictMarketDetail,
								tokenId,
								side,
								amount: amountStr,
								complementOrderbook,
							});
							const grossPredictBuyFilled = leg.shares * predictPostBridgeScale;
							return {
								filled: true,
								filledShares:
									side === "buy"
										? predictFunNetOutcomeSharesHeldAfterBuy(
												grossPredictBuyFilled,
												leg.avgPrice,
												predictMarketDetail.feeRateBps,
											)
										: leg.shares * predictSellScale,
								txHash: (resp as { orderHash?: string })?.orderHash,
							};
						} catch (e: unknown) {
							console.error("error", e);
							throw new Error(formatErrorForUser(e));
						}

}
