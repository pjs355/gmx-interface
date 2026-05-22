import {
	formatErrorForUser,
	userMessage,
	SOR_LIMITLESS_MISSING_SLUG,
} from "@/errors";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";
import { wireAmountUsdForVenue } from "@/trading/sor/core/wireAmount";
import {
	floorLimitlessFokMakerAmountHuman,
	interpretLimitlessDelegatedOrderResponse,
} from "@/trading/sor/execute/helpers";
import type { SorLegResult } from "@/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/trading/sor/execute/venueLegContext";
import { readFundingStableBalancesForChains } from "@/trading/sor/prefund/fundingStableBalances";
import { clampMarketBuyAmountToWallet } from "@/trading/sor/prefund/postBridgeOrderResize";
import { readLimitlessMakerUsdcPreflightForFokBuy } from "@/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase";
import type { LimitlessSignedOrderSubmit } from "@/trading/venues/limitless/trade/limitlessPrivateApiTypes";

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

	const sorLx = "[SOR][limitless]";
						const ids = leg.venueMarketIds;
						const routeSlug = ids.limitlessSlug?.trim();
						/** CLOB child slug when SOR attached `limitlessOrderbookSlugA|B`; else umbrella `limitlessSlug`. */
						const orderMarketSlug =
							leg.outcome === "A"
								? (ids.limitlessOrderbookSlugA?.trim() || routeSlug)
								: (ids.limitlessOrderbookSlugB?.trim() || routeSlug);
						const tokenId =
							leg.outcome === "A"
								? ids.limitlessTokenIdA
								: ids.limitlessTokenIdB;
						if (!orderMarketSlug || !tokenId) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_LIMITLESS_MISSING_SLUG),
							};
						}
						const childSlugA = ids.limitlessOrderbookSlugA?.trim() ?? "";
						const childSlugB = ids.limitlessOrderbookSlugB?.trim() ?? "";
						if (
							routeSlug &&
							orderMarketSlug === routeSlug &&
							(leg.outcome === "A" ? !childSlugA : !childSlugB)
						) {
							return {
								filled: false,
								filledShares: 0,
								error:
									"Limitless group market is missing per-team orderbook slugs (orderbookSlugA/B). Re-run matching or refresh market data.",
							};
						}
						const limitlessDeclaredSlug = routeSlug ?? orderMarketSlug;
						const limitlessLegSlug =
							routeSlug && orderMarketSlug !== routeSlug
								? orderMarketSlug
								: undefined;
						let phase:
							| "init"
							| "ensureLimitlessApprovals"
							| "postLimitlessOrder" = "init";
						console.debug(sorLx, "leg start", {
							routeSlug: routeSlug ?? orderMarketSlug,
							orderMarketSlug,
							side,
							orderType: isLimit ? "limit" : "market",
							outcome: leg.outcome,
							shares: leg.shares,
							tokenId: `${String(tokenId).slice(0, 14)}…`,
						});
						try {
							phase = "ensureLimitlessApprovals";
							// Re-run ensure-account so venue state is fresh; BUY allowance
							// is re-checked on the API inside POST /limitless/orders.
							if (ensureLimitlessApprovals) {
								console.debug(sorLx, "phase", {
									phase,
									note: "verify-allowance + Base USDC/CTF txs if needed + partner recheck + gate",
								});
								reportSorExecutionPhase("approving_trades");
								try {
									await ensureLimitlessApprovals({
										marketSlug: orderMarketSlug,
										limitlessOrderTokenId: String(tokenId),
										side,
										getClientForChain,
									});
									console.debug(sorLx, "phase ok", { phase });
								} catch (e: unknown) {
									const msg =
										e instanceof Error ? e.message : "Limitless account not ready";
									console.error(sorLx, "phase failed", {
										phase,
										orderMarketSlug,
										routeSlug,
										message: msg,
										stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
									});
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(e),
									};
								} finally {
									reportSorExecutionPhase("executing_trade");
								}
							} else {
								console.warn(sorLx, "ensureLimitlessApprovals hook missing — skipping JIT");
							}
							phase = "postLimitlessOrder";
							console.debug(sorLx, "phase", {
								phase,
								routeSlug: routeSlug ?? orderMarketSlug,
								orderMarketSlug,
							});
							const feeRateBps = LIMITLESS_DEFAULT_FEE_RATE_BPS;
							const buildSigned = buildLimitlessSignedOrderFromMarket;
							const ownerIdRaw = getLimitlessOwnerId?.();
							const ownerId =
								typeof ownerIdRaw === "number" &&
								Number.isFinite(ownerIdRaw) &&
								ownerIdRaw > 0
									? ownerIdRaw
									: null;
							const maker = getLimitlessMakerAddress?.()?.trim() ?? "";
							if (!buildSigned || ownerId == null || !maker) {
								return {
									filled: false,
									filledShares: 0,
									error:
										"Limitless signed orders are not configured (missing ownerId, maker, or buildLimitlessSignedOrderFromMarket).",
								};
							}
							const submitLimitlessOrder = async (body: LimitlessSignedOrderSubmit) => {
								const r = (await privateApi.postLimitlessOrder(body)) as Record<
									string,
									unknown
								> | null;
								if (import.meta.env.DEV && r && typeof r === "object") {
									const meta = r._meta as
										| { effectiveMarketSlug?: string; declaredMarketSlug?: string }
										| undefined;
									const { _meta, ...rest } = r;
									void _meta;
									const ord = rest.order;
									const orderId =
										ord && typeof ord === "object" && "id" in ord
											? String((ord as { id?: unknown }).id)
											: undefined;
									const ex = rest.execution;
									const matched =
										ex && typeof ex === "object" && "matched" in ex
											? (ex as { matched?: unknown }).matched
											: undefined;
									const settlementStatus =
										ex && typeof ex === "object" && "settlementStatus" in ex
											? (ex as { settlementStatus?: unknown }).settlementStatus
											: undefined;
									const keys = Object.keys(rest);
									const onlyMessage =
										keys.length === 1 && keys[0] === "message";
									if (onlyMessage) {
										const msg = rest.message;
										console.debug(sorLx, "POST /orders minimal body (no order object)", {
											message:
												typeof msg === "string"
													? msg.length > 400
														? `${msg.slice(0, 400)}…`
														: msg
													: msg,
										});
									}
									if (meta?.effectiveMarketSlug) {
										console.debug(sorLx, "POST /orders venue slug (from API meta)", {
											routeSlug: body.marketSlug,
											effectiveMarketSlug: meta.effectiveMarketSlug,
											declaredMarketSlug: meta.declaredMarketSlug,
										});
									}
									console.debug(sorLx, "POST /orders response (dev)", {
										keys: keys.slice(0, 25),
										orderId,
										executionMatched: matched,
										settlementStatus,
									});
								}
								return r;
							};
							/**
							 * Wire `makerAmount` for Limitless FOK BUY is the **notional**
							 * USDC (`max(0, executionAmountUsd - leg.fee)`). Limitless
							 * deducts the protocol fee from outcome tokens (token-side fee).
							 * The API's collateral check requires `wallet >= maker + fee`;
							 * we bridge `executionAmountUsd` (= notional + fee) to the
							 * maker so the check passes.
							 *
							 * `clampMarketBuyAmountToWallet` is the secondary route if
							 * LI.FI under-delivered. SELL `makerAmount` is shares — leave
							 * untouched (no collateral check, no clamp needed).
							 */
							let limitlessBuyMakerUsd = wireAmountUsdForVenue(leg);
							let limitlessPostBridgeScale = 1;
							if (!isLimit && side === "buy") {
								let makerUsdcHuman: number;
								try {
									const balances = await readFundingStableBalancesForChains(
										{
											limitlessMakerBase:
												fundingAddresses.limitlessMakerBase,
										},
										["limitlessMakerBase"],
									);
									makerUsdcHuman = balances.limitlessMakerBase ?? 0;
								} catch (e: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(e),
									};
								}
								const clamp = clampMarketBuyAmountToWallet({
									plannedExecutionUsd: limitlessBuyMakerUsd,
									walletUsd: makerUsdcHuman,
									feeEstimateUsd: leg.fee,
									minOrderUsd: 1,
								});
								if (!clamp.ok) {
									return { filled: false, filledShares: 0, error: clamp.error };
								}
								console.debug("[SOR][wire] limitless", {
									venue: "limitless",
									executionAmountUsd: Number(leg.executionAmountUsd.toFixed(6)),
									feeUsd: Number(leg.fee.toFixed(6)),
									plannedWireUsd: Number(limitlessBuyMakerUsd.toFixed(6)),
									walletUsdcUsd: Number(makerUsdcHuman.toFixed(6)),
									finalWireUsd: Number(clamp.amountUsd.toFixed(6)),
									scale: Number(clamp.scale.toFixed(6)),
									resized: clamp.resized,
								});
								limitlessBuyMakerUsd = clamp.amountUsd;
								limitlessPostBridgeScale = clamp.scale;
							}
							if (!isLimit && side === "buy") {
								let verifyForPreflight;
								try {
									verifyForPreflight = await privateApi.postLimitlessVerifyAllowance(
										orderMarketSlug,
										{ tokenId: String(tokenId) },
									);
								} catch (e: unknown) {
									const msg =
										e instanceof Error
											? e.message
											: "Limitless verify-allowance failed before order";
									return { filled: false, filledShares: 0, error: msg };
								}
								const preflight = await readLimitlessMakerUsdcPreflightForFokBuy({
									maker,
									verify:
										verifyForPreflight as import("@/trading/venues/limitless/trade/limitlessPrivateApiTypes").LimitlessVerifyAllowanceResult,
									wireUsd: limitlessBuyMakerUsd,
									feeUsd: leg.fee,
								});
								if (!preflight.ok) {
									return {
										filled: false,
										filledShares: 0,
										error:
											preflight.reason ??
											"Limitless maker wallet is not funded or approved for this buy.",
									};
								}
							}
							let limitlessOrderResponse: unknown;
							const limitlessSlugBase = {
								slug: limitlessDeclaredSlug,
								...(limitlessLegSlug ? { marketSlugLeg: limitlessLegSlug } : {}),
							};
							if (isLimit) {
								limitlessOrderResponse = await submitLimitlessOrder(
									await buildSigned({
										kind: "gtc",
										...limitlessSlugBase,
										ownerId,
										maker,
										feeRateBps,
										tokenId: String(tokenId),
										side,
										price: limitPrice as number,
										size: leg.shares,
									}),
								);
							} else if (side === "buy") {
								limitlessOrderResponse = await submitLimitlessOrder(
									await buildSigned({
										kind: "fok_buy",
										...limitlessSlugBase,
										ownerId,
										maker,
										feeRateBps,
										tokenId: String(tokenId),
										makerAmount: floorLimitlessFokMakerAmountHuman(limitlessBuyMakerUsd),
									}),
								);
							} else {
								limitlessOrderResponse = await submitLimitlessOrder(
									await buildSigned({
										kind: "fok_sell",
										...limitlessSlugBase,
										ownerId,
										maker,
										feeRateBps,
										tokenId: String(tokenId),
										makerAmount: floorLimitlessFokMakerAmountHuman(leg.shares),
									}),
								);
							}
							const submitOutcome = interpretLimitlessDelegatedOrderResponse(
								limitlessOrderResponse,
							);
							if (!submitOutcome.ok) {
								console.error(sorLx, "order submit rejected", {
									routeSlug: routeSlug ?? orderMarketSlug,
									orderMarketSlug,
									error: submitOutcome.error,
								});
								return {
									filled: false,
									filledShares: 0,
									error: submitOutcome.error,
								};
							}

							if (import.meta.env.DEV && isLimit) {
								const o =
									limitlessOrderResponse &&
									typeof limitlessOrderResponse === "object"
										? (limitlessOrderResponse as Record<string, unknown>)
										: null;
								const ord = o?.order;
								const orderId =
									ord && typeof ord === "object" && "id" in ord
										? String((ord as { id?: unknown }).id)
										: undefined;
								if (orderId) {
									console.debug(sorLx, "GTC: resting limit accepted (not a book fill yet)", {
										routeSlug: routeSlug ?? orderMarketSlug,
										orderMarketSlug,
										orderId,
									});
								}
							}
							console.debug(sorLx, "leg complete", {
								routeSlug: routeSlug ?? orderMarketSlug,
								orderMarketSlug,
							});
							// SOR `filled` means the venue accepted the order / execution payload.
							// `limitlessPostBridgeScale` is 1 for SELL / GTC; for FOK BUY it tracks
							// any post-bridge resize so cost-basis math stays in sync until the
							// venue receipt overrides it.
							return {
								filled: true,
								filledShares:
									!isLimit && side === "buy"
										? leg.shares * limitlessPostBridgeScale
										: leg.shares,
							};
						} catch (e: unknown) {
							const msg = e instanceof Error ? e.message : String(e);
							console.error(sorLx, "phase failed", {
								phase,
								orderMarketSlug,
								routeSlug,
								message: msg,
								stack: e instanceof Error ? e.stack?.slice(0, 600) : undefined,
								hint:
									msg.includes("reading 'data')")
										? "Usually Privy Embedded1193Provider (walletProxy.rpc null response), not Limitless REST. If logs never reached [Limitless/API] POST orders, failure is before HTTP submit."
										: undefined,
							});
							return {
								filled: false,
								filledShares: 0,
								error: formatErrorForUser(e),
							};
						}

}
