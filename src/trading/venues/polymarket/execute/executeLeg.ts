import { formatUnits } from "viem";
import { Side } from "@polymarket/clob-client-v2";
import type { TickSize } from "@polymarket/clob-client-v2";
import {
	formatErrorForUser,
	formatPolymarketApprovalRepairFailed,
	userMessage,
	POLYMARKET_CTF_BALANCE_READ_FAILED,
	SOR_POLY_CLOB_NOT_READY,
	SOR_POLY_MISSING_TOKEN,
} from "@/errors";
import { wireAmountUsdForVenue } from "@/trading/sor/core/wireAmount";
import { isPolymarketAllowanceRecoverableError } from "@/trading/sor/execute/helpers";
import type { SorLegResult } from "@/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/trading/sor/execute/venueLegContext";
import { clampMarketBuyAmountToWallet } from "@/trading/sor/prefund/postBridgeOrderResize";
import { executePolygonRelayAndWait } from "@/trading/venues/polymarket/session/safeActions";
import {
	buildPolygonSafeUsdceWrapTransactions,
	readPolymarketSafeCtfBalanceWei,
	readPolymarketSafePusdBalanceWei,
	readPolymarketSafeUsdceBalanceWei,
} from "@/trading/venues/polymarket/trade/polygonCollateralWrap";
import { clampMarketSellSharesToCtfBalance } from "@/trading/venues/polymarket/trade/polymarketSellShareClamp";

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

	if (!polyClob.ready) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_POLY_CLOB_NOT_READY),
							};
						}
						// Approvals are ungated from SOR eligibility — the user
						// sees Polymarket in the plan regardless — but we must
						// satisfy them before signing an order, otherwise the
						// CLOB rejects with a cryptic "not approved" error.
						//
						// Fast path: trust the persisted venue-state flags from
						// `verify-on-chain` (set after onboarding). On the rare
						// event of an externally revoked allowance we re-run with
						// `{ force: true }` from the order-error recovery branch
						// below.
						//
						// `onApprovalWorkStart` only fires when the callback is
						// about to submit the on-chain relay batch — keeps the
						// trade-button label as "Executing trade..." in the
						// common case (fast path) and only briefly flashes
						// "Approving trades..." when we're truly approving.
						if (ensurePolymarketApprovals) {
							let didApprovalWork = false;
							try {
								await ensurePolymarketApprovals({
									onApprovalWorkStart: () => {
										didApprovalWork = true;
										reportSorExecutionPhase("approving_trades");
									},
								});
							} catch (e: unknown) {
								return {
									filled: false,
									filledShares: 0,
									error: formatErrorForUser(e),
								};
							} finally {
								if (didApprovalWork) {
									reportSorExecutionPhase("executing_trade");
								}
							}
						}
						// CLOB spends pUSD — wrap Safe USDC.e via Collateral Onramp before buys.
						const rawSafe = fundingAddresses.polymarketSafe;

						const tokenId =
							leg.outcome === "A"
								? leg.venueMarketIds.polyTokenIdA
								: leg.venueMarketIds.polyTokenIdB;
						if (!tokenId) {
							return {
								filled: false,
								filledShares: 0,
								error: userMessage(SOR_POLY_MISSING_TOKEN),
							};
						}

						const tickStyle = matchedMonitor?.polyTickSize != null
							? (matchedMonitor.polyTickSize as TickSize)
							: undefined;
						const negRisk = matchedMonitor?.polyNegRisk != null
							? Boolean(matchedMonitor.polyNegRisk)
							: undefined;

						/**
						 * Wrap + place order. Extracted so the order-error branch
						 * below can re-execute the whole sequence after a one-shot
						 * approval repair, since both the wrap (Onramp.wrap) and the
						 * CLOB pre-trade hook can revert with allowance errors when
						 * pre-approved allowances have been externally revoked.
						 */
						const attemptWrapAndPlace = async (): Promise<{
							filled: boolean;
							filledShares: number;
							error?: string;
						}> => {
							if (side === "buy") {
								let usdceWei: bigint;
								try {
									usdceWei = await readPolymarketSafeUsdceBalanceWei(rawSafe);
								} catch (e: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(e),
									};
								}
								if (usdceWei > 0n) {
									const relayClient = await getRelayClient();
									if (!relayClient) {
										return {
											filled: false,
											filledShares: 0,
											error:
												"Polymarket relayer unavailable — cannot wrap USDC.e to pUSD before trading.",
										};
									}
									const txs = buildPolygonSafeUsdceWrapTransactions({
										safeAddress: rawSafe,
										wrapAmountWei: usdceWei,
									});
									// Throws — caught by outer recovery block when
									// the revert is allowance-related.
									await executePolygonRelayAndWait(
										relayClient,
										txs,
										rawSafe,
										"Wrap USDC.e to pUSD for Polymarket",
									);
								}
							}

							if (isLimit) {
								await polyClob.placeLimitOrder({
									tokenId,
									price: limitPrice as number,
									size: leg.shares,
									side: side === "buy" ? Side.BUY : Side.SELL,
									tickStyle,
									negRisk,
								});
								return { filled: true, filledShares: leg.shares };
							}
							/**
							 * Wire `amount` for Polymarket BUY is the **notional** USDC
							 * (`max(0, executionAmountUsd - leg.fee)`). Polymarket's CTF
							 * pulls exactly `making = wire amount` USDC and deducts the
							 * protocol fee from outcome tokens (`taking - fee`). The CLOB
							 * API's pre-trade balance check requires
							 * `wallet >= wire + fee`, which is satisfied because we bridge
							 * `executionAmountUsd` (= notional + fee) to the Safe.
							 *
							 * If LI.FI under-delivered, `clampMarketBuyAmountToWallet`
							 * shrinks `wire` to fit `wallet - fee - dust`. The returned
							 * `scale` propagates to `filledShares` so cost-basis math
							 * stays in sync until the venue receipt overrides it.
							 */
							let buyAmountUsd = wireAmountUsdForVenue(leg);
							let postBridgeScale = 1;
							if (side === "buy") {
								let pusdWei: bigint;
								try {
									pusdWei = await readPolymarketSafePusdBalanceWei(rawSafe);
								} catch (e: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(e),
									};
								}
								const walletPusdHuman = Number(formatUnits(pusdWei, 6));
								const clamp = clampMarketBuyAmountToWallet({
									plannedExecutionUsd: buyAmountUsd,
									walletUsd: walletPusdHuman,
									feeEstimateUsd: leg.fee,
									minOrderUsd: 1,
								});
								if (!clamp.ok) {
									return { filled: false, filledShares: 0, error: clamp.error };
								}
								console.debug("[SOR][wire] polymarket", {
									venue: "polymarket",
									executionAmountUsd: Number(leg.executionAmountUsd.toFixed(6)),
									feeUsd: Number(leg.fee.toFixed(6)),
									plannedWireUsd: Number(buyAmountUsd.toFixed(6)),
									walletPusdUsd: Number(walletPusdHuman.toFixed(6)),
									finalWireUsd: Number(clamp.amountUsd.toFixed(6)),
									scale: Number(clamp.scale.toFixed(6)),
									resized: clamp.resized,
								});
								buyAmountUsd = clamp.amountUsd;
								postBridgeScale = clamp.scale;
							}

							// SELL: pre-flight clamp planned shares against the Safe's actual
							// on-chain CTF balance. The Polymarket Data API that feeds
							// `sorVenuePositions` lags the chain (and counts CTF locked in
							// resting limit sells), so a "max" sell often plans 1–3% more
							// shares than the Safe can transfer. The CTF Exchange's
							// pre-trade hook is `balanceOf(maker, tokenId) >= makerAmount`,
							// so the order would be rejected with HTTP 400
							// `not enough balance / allowance`. Reading the chain here and
							// shrinking `leg.shares` to fit prevents the rejection on the
							// first attempt instead of forcing the user into a manual retry.
							let sellShares = leg.shares;
							let sellScale = 1;
							if (side === "sell") {
								let ctfBalWei: bigint;
								try {
									ctfBalWei = await readPolymarketSafeCtfBalanceWei(rawSafe, tokenId);
								} catch (e: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(
											e instanceof Error
												? e
												: new Error(userMessage(POLYMARKET_CTF_BALANCE_READ_FAILED)),
										),
									};
								}
								const tickNumeric =
									typeof tickStyle === "string" ? Number(tickStyle) : undefined;
								const clamp = clampMarketSellSharesToCtfBalance({
									plannedShares: leg.shares,
									ctfBalanceWei: ctfBalWei,
									tickSize:
										tickNumeric != null && Number.isFinite(tickNumeric) && tickNumeric > 0
											? tickNumeric
											: undefined,
								});
								if (!clamp.ok) {
									return { filled: false, filledShares: 0, error: clamp.error };
								}
								if (clamp.resized) {
									console.debug("[SOR][sell-clamp] polymarket", {
										venue: "polymarket",
										tokenIdTail: tokenId.slice(-8),
										plannedShares: Number(leg.shares.toFixed(6)),
										ctfBalanceShares: Number((Number(ctfBalWei) / 1_000_000).toFixed(6)),
										clampedShares: Number(clamp.amountShares.toFixed(6)),
										scale: Number(clamp.scale.toFixed(6)),
										tickSize: tickNumeric ?? null,
									});
								}
								sellShares = clamp.amountShares;
								sellScale = clamp.scale;
							}

							await polyClob.placeMarketOrder({
								tokenId,
								amount: side === "buy" ? buyAmountUsd : sellShares,
								side: side === "buy" ? Side.BUY : Side.SELL,
								tickStyle,
								negRisk,
							});

							return {
								filled: true,
								filledShares:
									side === "buy"
										? leg.shares * postBridgeScale
										: leg.shares * sellScale,
							};
						};

						try {
							return await attemptWrapAndPlace();
						} catch (e: unknown) {
							const msg = e instanceof Error ? e.message : String(e);
							// Allowance/approval revoked externally between
							// onboarding and now — repair once and retry.
							// Patterns covered: CLOB "not approved", CLOB
							// "not enough balance / allowance", on-chain
							// `ERC20: transfer amount exceeds allowance`,
							// and the Polygon relay revert sentinel.
							if (
								isPolymarketAllowanceRecoverableError(msg) &&
								ensurePolymarketApprovals
							) {
								console.debug(
									"[SOR][polymarket] allowance error, attempting one-shot recovery",
									{ error: msg.slice(0, 240) },
								);
								let didRecoveryWork = false;
								try {
									await ensurePolymarketApprovals({
										force: true,
										onApprovalWorkStart: () => {
											didRecoveryWork = true;
											reportSorExecutionPhase("approving_trades");
										},
									});
								} catch (recovErr: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatPolymarketApprovalRepairFailed(
											formatErrorForUser(recovErr),
										),
									};
								} finally {
									if (didRecoveryWork) {
										reportSorExecutionPhase("executing_trade");
									}
								}
								try {
									return await attemptWrapAndPlace();
								} catch (retryErr: unknown) {
									return {
										filled: false,
										filledShares: 0,
										error: formatErrorForUser(retryErr),
									};
								}
							}
							return {
								filled: false,
								filledShares: 0,
								error: formatErrorForUser(e),
							};
						}

}
