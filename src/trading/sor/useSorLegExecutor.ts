import { useCallback, useMemo, type MutableRefObject } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";
import { encodeFunctionData, erc20Abi } from "viem";
import { base, bsc } from "viem/chains";
import { Side } from "@polymarket/clob-client-v2";
import type { TickSize } from "@polymarket/clob-client-v2";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { Book } from "@predictdotfun/sdk";
import type { TradeExecutionParams } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import type { RouteLeg, SorVenue } from "./sor-types";
import { validateLegMinimum } from "./sorPreflight";
import { CHAIN_LIFI_IDS } from "./sor-types";
import type { SolanaSignerCapable, SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { pickLifiSourceTxHashForStatus } from "@/trading/lifi/pickLifiSourceTxHashForStatus";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import type { LifiStatusResponse, LifiQuoteResponse } from "@/types/trading";
import { withTimeout } from "@/utils/withTimeout";
import { getPrivateApiErrorMessage } from "@/services/privateApi/errors";
import type { SorExecutionPhase } from "./useSorExecution";
import {
	readFundingStableBalancesHuman,
	type FundingStableBalancesHuman,
} from "@/trading/sor/fundingStableBalances";
import {
	buildPrefundSteps,
	computePrefundBridgeShortfallUsdHuman,
	computePrefundNeedUsdHuman,
	formatPrefundBalanceBreakdown,
	LIFI_BRIDGE_AMOUNT_MARGIN,
	MIN_PREFUND_CHUNK_USD,
	PREFUND_SHORTFALL_COVERED_EPS_USD,
	resolveBuyPrefundAnchorUsd,
	type PrefundStep,
} from "@/trading/sor/prefundPlan";
import {
	ensurePrefundQuoteMeetsDestMin,
	type PrefundLifiQuoteClient,
} from "@/trading/sor/lifiPrefundQuoteSolve";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import {
	buildPolygonSafeUsdceWrapTransactions,
	readPolymarketSafeUsdceBalanceWei,
} from "@/trading/polymarket/polygonCollateralWrap";
import { executePolygonRelayAndWait } from "@/trading/polymarket/safeActions";
import { getUSDCAddress, SOLANA_USDC_MINT } from "@/config/addresses";
import type { LimitlessOrderRequest } from "@/trading/limitless/limitlessPrivateApiTypes";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/trading/base/waitPrivyBaseTxReceipt";

/**
 * Must exceed Polymarket `RelayClient` poll budget for `wait()` (~100 polls × 2s ≈ 200s)
 * so we do not abort LI.FI Polygon legs while the relayer is still legitimately polling.
 * `useSorExecution`’s `LEG_OR_BRIDGE_TIMEOUT_MS` must cover this plus `pollLifiUntilTerminal`.
 */
const SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS = 210_000;
/** ~15 × 4s ≈ 60s of idle wait between polls, plus ~15 status calls (outer bridge timeout still applies). */
const SOR_LIFI_PREFUND_POLL = { maxAttempts: 15, intervalMs: 4_000 } as const;

/** Same-chain Base USDC `transfer` (SCW → Limitless maker); much shorter than LiFi legs. */
const SOR_BASE_USDC_TRANSFER_TIMEOUT_MS = 120_000;

/** Partner withdraw maker → SCW; poll until SCW can cover the upcoming Base LI.FI leg. */
const SOR_LX_WITHDRAW_TO_SCW_TIMEOUT_MS = 120_000;
const SOR_LX_WITHDRAW_POLL_INTERVAL_MS = 2500;

function sleepMs(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Limitless maker USDC is custodied by the partner; we cannot sign LI.FI from that address in
 * the browser. Before a Base-sourced LI.FI prefund leg, move just enough USDC to the user’s
 * Base smart wallet via `POST …/portfolio/withdraw`, then poll RPC until `balancesHuman.base`
 * can cover `destPortionUsd`.
 */
async function consolidateLimitlessMakerUsdcOntoScwForBaseLifiStep(input: {
	destPortionUsd: number;
	balancesHuman: FundingStableBalancesHuman;
	fundingAddresses: {
		baseSmartWallet?: string;
		limitlessMakerBase?: string;
	};
	privateApi: {
		postLimitlessPortfolioWithdraw: (body: {
			amountHuman: number;
			destination: string;
		}) => Promise<unknown>;
	};
}): Promise<void> {
	const need = Math.max(0, input.destPortionUsd);
	if (need + 1e-9 < MIN_PREFUND_CHUNK_USD) {
		return;
	}
	const swAddr = input.fundingAddresses.baseSmartWallet?.trim();
	const mkAddr = input.fundingAddresses.limitlessMakerBase?.trim();
	if (!swAddr || !/^0x[a-fA-F0-9]{40}$/i.test(swAddr) || !mkAddr) {
		return;
	}
	let sw = Math.max(0, input.balancesHuman.base ?? 0);
	const mk = Math.max(0, input.balancesHuman.limitlessMakerBase ?? 0);
	const shortfall = Math.max(0, need - sw);
	if (shortfall + 1e-9 < MIN_PREFUND_CHUNK_USD) {
		return;
	}
	const withdrawHuman = Math.min(shortfall, mk);
	if (withdrawHuman + 1e-9 < MIN_PREFUND_CHUNK_USD) {
		return;
	}
	console.warn("[SOR][prefund] Limitless maker → Base SCW (partner withdraw) before LI.FI", {
		usdcApprox: withdrawHuman,
	});
	await input.privateApi.postLimitlessPortfolioWithdraw({
		amountHuman: withdrawHuman,
		destination: swAddr,
	});
	const deadline = Date.now() + SOR_LX_WITHDRAW_TO_SCW_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleepMs(SOR_LX_WITHDRAW_POLL_INTERVAL_MS);
		const b = await readFundingStableBalancesHuman(input.fundingAddresses);
		input.balancesHuman.base = b.base;
		input.balancesHuman.limitlessMakerBase = b.limitlessMakerBase;
		sw = Math.max(0, b.base ?? 0);
		if (sw + PREFUND_SHORTFALL_COVERED_EPS_USD >= need) {
			return;
		}
	}
	throw new Error(
		"Timed out waiting for Limitless withdrawal to credit your Base smart wallet. Check Transfers or try again.",
	);
}

type LegResult = {
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
};

/**
 * Limitless delegated POST /orders returns 200 with either a real order/execution
 * payload or a partner error shape such as `{ message: "Insufficient collateral…" }`.
 */
function interpretLimitlessDelegatedOrderResponse(
	response: unknown,
): { ok: true } | { ok: false; error: string } {
	if (response == null || typeof response !== "object" || Array.isArray(response)) {
		return { ok: false, error: "No valid response from order submit" };
	}
	const o = response as Record<string, unknown>;

	if (typeof o.error === "string" && o.error.trim() !== "") {
		return { ok: false, error: o.error.trim() };
	}

	const ord = o.order;
	if (ord && typeof ord === "object" && !Array.isArray(ord)) {
		const id = (ord as { id?: unknown }).id;
		if (id !== undefined && id !== null && String(id).trim() !== "") {
			return { ok: true };
		}
	}

	const nestedData = o.data;
	if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
		const nestedOrder = (nestedData as { order?: unknown }).order;
		if (nestedOrder && typeof nestedOrder === "object" && !Array.isArray(nestedOrder)) {
			const id = (nestedOrder as { id?: unknown }).id;
			if (id !== undefined && id !== null && String(id).trim() !== "") {
				return { ok: true };
			}
		}
	}

	const ex = o.execution;
	if (ex && typeof ex === "object" && !Array.isArray(ex)) {
		const matched = (ex as { matched?: unknown }).matched;
		if (matched === true) {
			return { ok: true };
		}
		if (matched === false) {
			const m =
				typeof o.message === "string" && o.message.trim() !== ""
					? o.message.trim()
					: "Order was not filled";
			return { ok: false, error: m };
		}
		// `matched` omitted — still a structured execution payload; treat as success.
		return { ok: true };
	}

	if (typeof o.message === "string" && o.message.trim() !== "") {
		return { ok: false, error: o.message.trim() };
	}

	return {
		ok: false,
		error: "Order could not be confirmed. Please try again.",
	};
}

type BridgeResult = {
	success: boolean;
	bridgeTxHash?: string;
	error?: string;
};

export interface UseSorLegExecutorDeps {
	tradeExecutionService: {
		executeTrade: (
			params: TradeExecutionParams,
			privyWallet: unknown,
		) => Promise<{ success: boolean; transactionHash?: string; error?: string }>;
	};
	polyClob: {
		ready: boolean;
		placeMarketOrder: (args: {
			tokenId: string;
			amount: number;
			side: typeof Side.BUY | typeof Side.SELL;
			tickStyle?: TickSize;
			negRisk?: boolean;
		}) => Promise<unknown>;
		placeLimitOrder: (args: {
			tokenId: string;
			price: number;
			size: number;
			side: typeof Side.BUY | typeof Side.SELL;
			tickStyle?: TickSize;
			negRisk?: boolean;
		}) => Promise<unknown>;
	};
	predictSession: {
		ready: boolean;
		placeMarketOrder: (args: {
			marketId: number;
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			amount: string;
			book?: Book | null;
		}) => Promise<{ orderHash?: string }>;
		placeLimitOrder: (args: {
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			priceCents: number;
			sizeShares: string;
		}) => Promise<{ orderHash?: string } | unknown>;
	};
	privateApi: {
		getDflowOrder: (params: {
			inputMint: string;
			outputMint: string;
			amount: string;
		}) => Promise<{
			transaction?: string;
			outAmount?: string;
			code?: string;
			msg?: string;
		}>;
		postFundingLifiQuote: (body: {
			fromChain: number;
			toChain: number;
			amountHuman: string;
			fromAddress: string;
			toAddress?: string;
			slippage?: number;
		}) => Promise<{
			steps?: unknown[];
			/** Raw LI.FI route object (`data.quote` from POST /funding/lifi/quote). */
			quote?: unknown;
			statusBridge?: string | null;
			tool?: string;
		}>;
		getFundingLifiStatus: (params: {
			txHash: string;
			tool?: string;
			fromChain?: number;
			toChain?: number;
		}) => Promise<unknown>;
		postLimitlessOrder: (body: LimitlessOrderRequest) => Promise<unknown>;
		postLimitlessPortfolioWithdraw: (input: {
			amountHuman: number;
			destination: string;
		}) => Promise<unknown>;
	};

	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null;
	predictNumericId: number | null;
	predictMarketDetail: PredictMarketDetail | null;
	account: string | undefined;

	getClientForChain: (opts: { id: number }) => Promise<{
		sendTransaction: SendTransactionCapable["sendTransaction"];
	} | null | undefined>;
	fundingAddresses: {
		baseSmartWallet?: string;
		limitlessMakerBase?: string;
		polymarketSafe?: string;
		embeddedEoa?: string;
		solanaAddress?: string;
	};
	solanaSigner: SolanaSignerCapable | null;
	getRelayClient: () => Promise<RelayClient | null>;

	dflowProofVerified: boolean;
	predictApprovalsOk: boolean;
	predictTokenId: string | null;
	/** Runs LevelUp USDC/CTF approvals if needed (first trade / SOR leg). */
	ensureLevelUpApprovals?: () => Promise<void>;
	/** Runs Predict BNB approvals if needed before placing orders. */
	ensurePredictApprovals?: () => Promise<void>;
	/**
	 * Runs Polymarket approvals (Safe deploy + USDC/CTF approvals batch)
	 * just-in-time before submitting the order. Throws with a user-visible
	 * message if the batch fails — never fails silently.
	 */
	ensurePolymarketApprovals?: () => Promise<void>;
	/**
	 * Before `postLimitlessOrder`: verify Limitless allowance for this slug; for
	 * BUYs without minimum allowance, submits Base USDC `approve` txs via the
	 * smart wallet, re-verifies, then refetches `ensure-account` for owner state.
	 */
	ensureLimitlessApprovals?: (ctx: {
		marketSlug: string;
		/** Same outcome token as POST /orders — enables parent→child slug resolution on verify. */
		limitlessOrderTokenId?: string;
		side: "buy" | "sell";
		getClientForChain: UseSorLegExecutorDeps["getClientForChain"];
	}) => Promise<void>;
	/**
	 * Re-fetches the DFlow/Proof KYC status on click so a user who verified
	 * mid-session isn't falsely rejected from a stale cache. Returns the
	 * freshly-read verified boolean. On `false`, the executor throws a loud
	 * error and the trade box is expected to launch `startDflowProofRedirect`.
	 */
	ensureDflowProofVerified?: () => Promise<boolean>;
	/**
	 * Filled by `useSorExecution` (trade box) so first-time allowance / venue
	 * approval prompts surface as explicit UI phases instead of looking hung.
	 */
	reportExecutionPhaseRef?: MutableRefObject<
		((phase: SorExecutionPhase) => void) | undefined
	>;
}

type SorChainKey = "base" | "polygon" | "solana" | "bnb";

function addressForChain(
	chain: SorChainKey,
	addrs: UseSorLegExecutorDeps["fundingAddresses"],
): string | undefined {
	switch (chain) {
		case "base":
			return addrs.baseSmartWallet;
		case "polygon":
			return addrs.polymarketSafe;
		case "bnb":
			return addrs.embeddedEoa;
		case "solana":
			return addrs.solanaAddress;
	}
}

const SOLANA_LIFI_CHAIN_ID = CHAIN_LIFI_IDS.solana;

function maskFundingAddress(addr: string | undefined): string | undefined {
	if (!addr?.trim()) return undefined;
	const a = addr.trim();
	if (a.startsWith("0x") && a.length > 12) {
		return `${a.slice(0, 6)}…${a.slice(-4)}`;
	}
	if (a.length > 12) {
		return `${a.slice(0, 4)}…${a.slice(-4)}`;
	}
	return a;
}

/**
 * Hash to pass to `GET /funding/lifi/status`: the **source-chain** tx (first hop).
 * When the route starts on Solana, that signature is base58, not `0x…`; picking the last
 * EVM hash would poll the wrong tx.
 */
function pickBridgeSourceTxHashForLifiStatus(
	txHashes: string[],
	_steps: unknown[] | undefined,
	fromChainLifi: number,
): string {
	return pickLifiSourceTxHashForStatus({
		txHashes,
		fromChainLifi,
		solanaLifiChainId: SOLANA_LIFI_CHAIN_ID,
	});
}

export function useSorLegExecutor(deps: UseSorLegExecutorDeps) {
	const {
		tradeExecutionService,
		polyClob,
		predictSession,
		privateApi,
		market,
		matchedMonitor,
		predictNumericId,
		predictMarketDetail,
		account,
		getClientForChain,
		fundingAddresses,
		solanaSigner,
		getRelayClient,
		dflowProofVerified,
		predictApprovalsOk,
		predictTokenId,
		ensureLevelUpApprovals,
		ensurePredictApprovals,
		ensurePolymarketApprovals,
		ensureLimitlessApprovals,
		ensureDflowProofVerified,
		reportExecutionPhaseRef,
	} = deps;

	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();

	const reportSorExecutionPhase = (phase: SorExecutionPhase) => {
		reportExecutionPhaseRef?.current?.(phase);
	};

	// ──────────────────────────────────────────────
	// executeLeg: dispatches to the correct venue
	// ──────────────────────────────────────────────

	const executeLeg = useCallback(
		async (leg: RouteLeg, side: "buy" | "sell" = "buy"): Promise<LegResult> => {
			const venue: SorVenue = leg.venue;

			// Defense-in-depth: shares are non-transferable between venues, so
			// sells must never arrive with a bridge plan. If a future bug ever
			// stamps one, fail loud instead of LI.FI-spending the user's USDC
			// to chase a non-transferable share.
			if (side === "sell" && leg.bridge !== null) {
				return {
					filled: false,
					filledShares: 0,
					error: "Refusing to bridge on a sell leg — shares are non-transferable",
				};
			}

			const isLimit = leg.orderType === "limit";
			const limitPrice =
				isLimit && typeof leg.limitPriceCents === "number"
					? leg.limitPriceCents / 100
					: undefined;

			if (isLimit && (limitPrice == null || limitPrice <= 0 || limitPrice >= 1)) {
				return {
					filled: false,
					filledShares: 0,
					error: "Missing or invalid limit price on leg",
				};
			}

			switch (venue) {
				// ─── LevelUp (Base, USDC) ─────────────────
				case "levelup": {
					if (!account) {
						return { filled: false, filledShares: 0, error: "No wallet connected" };
					}
					if (ensureLevelUpApprovals) {
						reportSorExecutionPhase("approving_trades");
						try {
							await ensureLevelUpApprovals();
						} catch (e: unknown) {
							const msg =
								e instanceof Error ? e.message : "LevelUp approvals failed";
							return { filled: false, filledShares: 0, error: msg };
						} finally {
							reportSorExecutionPhase("executing_trade");
						}
					}
					const questionId = leg.venueMarketIds.levelUpQuestionId;
					if (!questionId) {
						return { filled: false, filledShares: 0, error: "Missing LevelUp question ID" };
					}

					const position: "yes" | "no" = leg.outcome === "A" ? "yes" : "no";
					const shares = Math.round(leg.shares);
					const maxPx = leg.maxPrice;
					const signingPrice = isLimit
						? Math.round((limitPrice as number) * 100) / 100
						: maxPx != null && Number.isFinite(maxPx) && maxPx > 0 && maxPx <= 1
							? Math.round(maxPx * 100) / 100
							: side === "buy"
								? Math.round(Math.min(leg.avgPrice * 1.15, 0.99) * 100) / 100
								: Math.round(Math.max(leg.avgPrice * 0.85, 0.01) * 100) / 100;

					const params: TradeExecutionParams = {
						marketId: questionId,
						position,
						amount: shares,
						price: signingPrice,
						orderType: isLimit ? "limit" : "market",
						side,
						userAddress: account,
						market,
					};

					const result = await tradeExecutionService.executeTrade(params, null);
					return {
						filled: result.success,
						filledShares: result.success ? shares : 0,
						txHash: result.transactionHash,
						error: result.error,
					};
				}

				// ─── Polymarket (Polygon, pUSD) — session, JIT approvals, wrap USDC.e→pUSD
				// before buys; see `src/trading/polymarket/POLYMARKET_TRADING.md`.
				case "polymarket": {
					if (!polyClob.ready) {
						return { filled: false, filledShares: 0, error: "Polymarket CLOB session not ready. Open Polymarket tab first to initialize." };
					}
					// Approvals are ungated from SOR eligibility — the user
					// sees Polymarket in the plan regardless — but we must
					// satisfy them JIT before signing an order, otherwise the
					// CLOB rejects with a cryptic "not approved" error.
					if (ensurePolymarketApprovals) {
						reportSorExecutionPhase("approving_trades");
						try {
							await ensurePolymarketApprovals();
						} catch (e: unknown) {
							const msg =
								e instanceof Error ? e.message : "Polymarket approvals failed";
							return { filled: false, filledShares: 0, error: msg };
						} finally {
							reportSorExecutionPhase("executing_trade");
						}
					}
					// CLOB spends pUSD — wrap Safe USDC.e via Collateral Onramp before buys.
					if (side === "buy") {
						const rawSafe = fundingAddresses.polymarketSafe?.trim();
						if (rawSafe && /^0x[a-fA-F0-9]{40}$/i.test(rawSafe)) {
							let usdceWei: bigint;
							try {
								usdceWei = await readPolymarketSafeUsdceBalanceWei(rawSafe);
							} catch (e: unknown) {
								const msg =
									e instanceof Error
										? e.message
										: "Could not read Polygon USDC.e balance before trade";
								return { filled: false, filledShares: 0, error: msg };
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
								try {
									const txs = buildPolygonSafeUsdceWrapTransactions({
										safeAddress: rawSafe,
										wrapAmountWei: usdceWei,
									});
									await executePolygonRelayAndWait(
										relayClient,
										txs,
										"Wrap USDC.e to pUSD for Polymarket",
									);
								} catch (e: unknown) {
									const msg =
										e instanceof Error
											? e.message
											: "USDC.e wrap failed before Polymarket order";
									return { filled: false, filledShares: 0, error: msg };
								}
							}
						}
					}
					const tokenId =
						leg.outcome === "A"
							? leg.venueMarketIds.polyTokenIdA
							: leg.venueMarketIds.polyTokenIdB;
					if (!tokenId) {
						return { filled: false, filledShares: 0, error: "Missing Polymarket outcome token ID" };
					}

					const tickStyle = matchedMonitor?.polyTickSize != null
						? (matchedMonitor.polyTickSize as TickSize)
						: undefined;
					const negRisk = matchedMonitor?.polyNegRisk != null
						? Boolean(matchedMonitor.polyNegRisk)
						: undefined;

					if (isLimit) {
						await polyClob.placeLimitOrder({
							tokenId,
							price: limitPrice as number,
							size: leg.shares,
							side: side === "buy" ? Side.BUY : Side.SELL,
							tickStyle,
							negRisk,
						});
					} else {
						await polyClob.placeMarketOrder({
							tokenId,
							amount: side === "buy" ? leg.executionAmountUsd : leg.shares,
							side: side === "buy" ? Side.BUY : Side.SELL,
							tickStyle,
							negRisk,
						});
					}

					return { filled: true, filledShares: leg.shares };
				}

				// ─── DFlow / Kalshi (Solana, USDC) ────────
				case "dflow": {
					if (isLimit) {
						return {
							filled: false,
							filledShares: 0,
							error: "Kalshi does not support limit orders",
						};
					}
					// KYC is the one SOR gate we keep on DFlow (regulatory). A
					// user can have KYC'd mid-session and still carry a stale
					// `dflowProofVerified=false` flag from page load, so
					// re-fetch on the click before bailing. When the refresh
					// still says unverified, throw a loud error so the trade
					// box can launch `startDflowProofRedirect` — no silent
					// rejections.
					let proofOk = dflowProofVerified;
					if (ensureDflowProofVerified) {
						try {
							proofOk = await ensureDflowProofVerified();
						} catch (e: unknown) {
							const msg =
								e instanceof Error
									? e.message
									: "Failed to refresh Kalshi KYC status";
							return { filled: false, filledShares: 0, error: msg };
						}
					}
					if (!proofOk) {
						return {
							filled: false,
							filledShares: 0,
							error:
								"Kalshi KYC not verified. Complete verification on the Profile page.",
						};
					}
					const outcomeMint =
						leg.outcome === "A"
							? leg.venueMarketIds.dflowYesMintA
							: leg.venueMarketIds.dflowYesMintB;
					if (!outcomeMint) {
						return { filled: false, filledShares: 0, error: "Missing Kalshi outcome mint" };
					}

					const inputMint = side === "buy" ? SOLANA_USDC_MINT : outcomeMint;
					const outputMint = side === "buy" ? outcomeMint : SOLANA_USDC_MINT;
					const amountBaseUnits = side === "buy"
						? Math.round(leg.executionAmountUsd * 1_000_000).toString()
						: Math.round(leg.shares * 1_000_000).toString();

					const orderResult = await privateApi.getDflowOrder({
						inputMint,
						outputMint,
						amount: amountBaseUnits,
					});

					if (orderResult.code || orderResult.msg) {
						return { filled: false, filledShares: 0, error: orderResult.msg ?? orderResult.code ?? "Kalshi order failed" };
					}
					if (!orderResult.transaction) {
						throw new Error("Kalshi returned no transaction to sign");
					}

					if (!solanaSigner) {
						return {
							filled: false,
							filledShares: 0,
							error: "Solana signer unavailable — connect your Solana embedded wallet",
						};
					}

					const txBytes = Buffer.from(orderResult.transaction, "base64");
					const transaction = VersionedTransaction.deserialize(txBytes);
					const sig = await solanaSigner.signAndSendTransaction(
						transaction.serialize(),
					);

					return { filled: true, filledShares: leg.shares, txHash: sig };
				}

				// ─── Limitless (Base, USDC) ───────────
				case "limitless": {
					const sorLx = "[SOR][limitless]";
					const ids = leg.venueMarketIds;
					const slug = ids.limitlessSlug?.trim();
					const tokenId =
						leg.outcome === "A"
							? ids.limitlessTokenIdA
							: ids.limitlessTokenIdB;
					if (!slug || !tokenId) {
						return {
							filled: false,
							filledShares: 0,
							error: "Missing Limitless slug or outcome token on route leg",
						};
					}
					let phase:
						| "init"
						| "ensureLimitlessApprovals"
						| "postLimitlessOrder" = "init";
					console.info(sorLx, "leg start", {
						slug,
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
							console.info(sorLx, "phase", {
								phase,
								note: "verify-allowance + Base USDC/CTF txs if needed + partner recheck + gate",
							});
							reportSorExecutionPhase("approving_trades");
							try {
								await ensureLimitlessApprovals({
									marketSlug: slug,
									limitlessOrderTokenId: String(tokenId),
									side,
									getClientForChain,
								});
								console.info(sorLx, "phase ok", { phase });
							} catch (e: unknown) {
								const msg =
									e instanceof Error ? e.message : "Limitless account not ready";
								console.error(sorLx, "phase failed", {
									phase,
									slug,
									message: msg,
									stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
								});
								return { filled: false, filledShares: 0, error: msg };
							} finally {
								reportSorExecutionPhase("executing_trade");
							}
						} else {
							console.warn(sorLx, "ensureLimitlessApprovals hook missing — skipping JIT");
						}
						phase = "postLimitlessOrder";
						console.info(sorLx, "phase", { phase, routeSlug: slug });
						const feeRateBps = LIMITLESS_DEFAULT_FEE_RATE_BPS;
						const submitLimitlessOrder = async (body: Parameters<typeof privateApi.postLimitlessOrder>[0]) => {
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
									console.warn(sorLx, "POST /orders minimal body (no order object)", {
										message:
											typeof msg === "string"
												? msg.length > 400
													? `${msg.slice(0, 400)}…`
													: msg
												: msg,
									});
								}
								if (meta?.effectiveMarketSlug) {
									console.info(sorLx, "POST /orders venue slug (from API meta)", {
										routeSlug: body.marketSlug,
										effectiveMarketSlug: meta.effectiveMarketSlug,
										declaredMarketSlug: meta.declaredMarketSlug,
									});
								}
								console.info(sorLx, "POST /orders response (dev)", {
									keys: keys.slice(0, 25),
									orderId,
									executionMatched: matched,
									settlementStatus,
								});
							}
							return r;
						};
						let limitlessOrderResponse: unknown;
						if (isLimit) {
							limitlessOrderResponse = await submitLimitlessOrder({
								marketSlug: slug,
								orderType: "GTC",
								tokenId,
								side: side === "buy" ? "BUY" : "SELL",
								price: limitPrice as number,
								size: leg.shares,
								feeRateBps,
							});
						} else if (side === "buy") {
							limitlessOrderResponse = await submitLimitlessOrder({
								marketSlug: slug,
								orderType: "FOK",
								tokenId,
								side: "BUY",
								makerAmount: leg.executionAmountUsd,
								feeRateBps,
							});
						} else {
							limitlessOrderResponse = await submitLimitlessOrder({
								marketSlug: slug,
								orderType: "FOK",
								tokenId,
								side: "SELL",
								makerAmount: leg.shares,
								feeRateBps,
							});
						}
						const submitOutcome = interpretLimitlessDelegatedOrderResponse(
							limitlessOrderResponse,
						);
						if (!submitOutcome.ok) {
							console.error(sorLx, "order submit rejected", {
								routeSlug: slug,
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
								console.info(sorLx, "GTC: resting limit accepted (not a book fill yet)", {
									routeSlug: slug,
									orderId,
								});
							}
						}
						console.info(sorLx, "leg complete", { routeSlug: slug });
						// SOR `filled` means the venue accepted the order / execution payload.
						return { filled: true, filledShares: leg.shares };
					} catch (e: unknown) {
						const msg = e instanceof Error ? e.message : String(e);
						console.error(sorLx, "phase failed", {
							phase,
							slug,
							message: msg,
							stack: e instanceof Error ? e.stack?.slice(0, 600) : undefined,
							hint:
								msg.includes("reading 'data')")
									? "Usually Privy Embedded1193Provider (walletProxy.rpc null response), not Limitless REST. If logs never reached [Limitless/API] POST orders, failure is before HTTP submit."
									: undefined,
						});
						return { filled: false, filledShares: 0, error: msg };
					}
				}

				// ─── Predict (BNB, USDT) ─────────────
				case "predictfun": {
					if (!predictSession.ready) {
						return { filled: false, filledShares: 0, error: "Predict session not ready. Authenticate on the Predict tab first." };
					}
					if (ensurePredictApprovals) {
						reportSorExecutionPhase("approving_trades");
						try {
							await ensurePredictApprovals();
						} catch (e: unknown) {
							console.error("error", e);
							const msg = getPrivateApiErrorMessage(e).trim();
							return {
								filled: false,
								filledShares: 0,
								error:
									msg.length > 0 ? msg : "Predict approvals failed (no error message).",
							};
						} finally {
							reportSorExecutionPhase("executing_trade");
						}
					} else if (!predictApprovalsOk) {
						return {
							filled: false,
							filledShares: 0,
							error: "Predict contracts not approved.",
						};
					}

					if (!predictTokenId) {
						return { filled: false, filledShares: 0, error: "Missing Predict outcome token ID" };
					}
					const tokenId = predictTokenId;

					if (predictNumericId == null || !predictMarketDetail) {
						return { filled: false, filledShares: 0, error: "Predict market data not loaded" };
					}

					const preflight = validateLegMinimum(leg, side);
					if (!preflight.ok) {
						return { filled: false, filledShares: 0, error: preflight.error };
					}

					if (isLimit) {
						try {
							const resp = await predictSession.placeLimitOrder({
								market: predictMarketDetail,
								tokenId,
								side,
								priceCents: leg.limitPriceCents as number,
								sizeShares: leg.shares.toFixed(6),
							});
							return {
								filled: true,
								filledShares: leg.shares,
								txHash: (resp as { orderHash?: string } | undefined)?.orderHash,
							};
						} catch (e: unknown) {
							console.error("error", e);
							const msg = getPrivateApiErrorMessage(e).trim();
							throw new Error(
								msg.length > 0 ? msg : "Predict limit order failed (no error message).",
							);
						}
					}

					const amountStr = side === "buy"
						? leg.executionAmountUsd.toFixed(6)
						: leg.shares.toFixed(6);

					try {
						const resp = await predictSession.placeMarketOrder({
							marketId: predictNumericId,
							market: predictMarketDetail,
							tokenId,
							side,
							amount: amountStr,
						});
						return {
							filled: true,
							filledShares: leg.shares,
							txHash: (resp as { orderHash?: string })?.orderHash,
						};
					} catch (e: unknown) {
						console.error("error", e);
						const msg = getPrivateApiErrorMessage(e).trim();
						throw new Error(
							msg.length > 0 ? msg : "Predict market order failed (no error message).",
						);
					}
				}

				default:
					return { filled: false, filledShares: 0, error: `Unknown venue: ${venue}` };
			}
		},
		[
			account,
			market,
			tradeExecutionService,
			polyClob,
			matchedMonitor,
			dflowProofVerified,
			privateApi,
			solanaSigner,
			predictSession,
			predictApprovalsOk,
			predictNumericId,
			predictMarketDetail,
			predictTokenId,
			ensureLevelUpApprovals,
			ensurePredictApprovals,
			ensurePolymarketApprovals,
			getRelayClient,
			fundingAddresses,
		],
	);

	// ──────────────────────────────────────────────
	// executeBridge: LI.FI cross-chain transfer
	// ──────────────────────────────────────────────

	const executeBridge = useCallback(
		async (
			leg: RouteLeg,
			opts?: {
				amountUsdOverride?: number;
				onPrefundProgress?: (p: { current: number; total: number }) => void;
			},
		): Promise<BridgeResult> => {
			const bridge = leg.bridge;
			if (!bridge) {
				return { success: false, error: "No bridge data on leg" };
			}

			const toChainLifi = CHAIN_LIFI_IDS[bridge.toChain];
			const limitlessBaseDest =
				leg.venue === "limitless" && bridge.toChain === "base";
			const toAddress = (() => {
				if (limitlessBaseDest) {
					const m = fundingAddresses.limitlessMakerBase?.trim();
					if (!m) {
						return "";
					}
					return m;
				}
				return addressForChain(bridge.toChain, fundingAddresses);
			})();
			if (!toAddress?.trim()) {
				return {
					success: false,
					error: limitlessBaseDest
						? "Limitless maker address missing — finish Limitless setup or refresh account overview. USDC cannot be prefunded to your Base smart wallet for Limitless orders."
						: `No wallet address for destination chain ${bridge.toChain}`,
				};
			}

			const BNB_CHAIN_ID = bsc.id;
			const POLYGON_CHAIN_ID = 137;

			try {
				/** Optimizer shortfall and/or group aggregate — see {@link resolveBuyPrefundAnchorUsd}. */
				const routeBridgeUsd = opts?.amountUsdOverride ?? bridge.amount;
				if (
					!(
						typeof leg.executionAmountUsd === "number" &&
						Number.isFinite(leg.executionAmountUsd) &&
						leg.executionAmountUsd > 0
					)
				) {
					throw new Error(
						"Buy route is missing executionAmountUsd on a bridged leg — refresh the quote and try again.",
					);
				}
				const prefundAnchorUsd = resolveBuyPrefundAnchorUsd(
					routeBridgeUsd,
					leg.executionAmountUsd,
				);
				const needHuman = computePrefundNeedUsdHuman(
					prefundAnchorUsd,
					LIFI_BRIDGE_AMOUNT_MARGIN,
				);
				let balancesHuman = await readFundingStableBalancesHuman(fundingAddresses);
				const onDestUsd = limitlessBaseDest
					? Math.max(0, balancesHuman.limitlessMakerBase ?? 0)
					: Math.max(0, balancesHuman[bridge.toChain] ?? 0);
				const venueAppliedUsd = Math.min(needHuman, onDestUsd);
				const bridgeShortfallUsd = computePrefundBridgeShortfallUsdHuman(
					needHuman,
					bridge.toChain,
					balancesHuman,
					{ limitlessBaseDest },
				);

				/**
				 * Limitless maker is **not** the Base SCW. Li.FI prefund must not pull from SCW as a
				 * "source chain" for cross-chain routes, but USDC on the SCW can cover the same-chain
				 * shortfall via a direct ERC-20 `transfer` to the maker before any Li.FI steps.
				 * (Maker → SCW remains `postLimitlessPortfolioWithdraw` — Transfers modal prefund + SOR.)
				 *
				 * The post-sweep Li.FI need is **ledger-derived** (shortfall minus exact USDC micros
				 * sent) — no RPC re-read required for planning. USDC `transfer` does not deduct trade
				 * notional from the moved amount (gas is separate). When both sweep and Li.FI run,
				 * they execute in **parallel**; we `Promise.all` so the trade only proceeds after the
				 * Base receipt is success **and** Li.FI status is terminal (bridge usually dominates).
				 */
				let scwToMakerSweepTxHash: string | undefined;
				let plannedSweepMicros = 0n;
				if (
					limitlessBaseDest &&
					bridgeShortfallUsd > PREFUND_SHORTFALL_COVERED_EPS_USD &&
					fundingAddresses.baseSmartWallet?.trim() &&
					fundingAddresses.limitlessMakerBase?.trim()
				) {
					const scwUsd = Math.max(0, balancesHuman.base);
					const sweepUsd = Math.min(bridgeShortfallUsd, scwUsd);
					if (sweepUsd + 1e-9 >= MIN_PREFUND_CHUNK_USD) {
						const micros = BigInt(Math.floor(sweepUsd * 1_000_000));
						if (micros > 0n) {
							plannedSweepMicros = micros;
						}
					}
				}
				const sweepAmountHuman =
					plannedSweepMicros > 0n ? Number(plannedSweepMicros) / 1e6 : 0;
				const lifiNeedUsd =
					plannedSweepMicros > 0n
						? Math.max(0, bridgeShortfallUsd - sweepAmountHuman)
						: bridgeShortfallUsd;

				const prefundLogBase = {
					venue: leg.venue,
					prefundTargetUsdApprox: Number(needHuman.toFixed(4)),
					venueSpendAppliedUsdApprox: Number(venueAppliedUsd.toFixed(4)),
					bridgeShortfallUsdApprox: Number(bridgeShortfallUsd.toFixed(4)),
					lifiShortfallAfterScwSweepUsdApprox:
						plannedSweepMicros > 0n ? Number(lifiNeedUsd.toFixed(6)) : null,
					scwSweepUsdcApprox: plannedSweepMicros > 0n ? sweepAmountHuman : null,
					bridgeAmountUsd: opts?.amountUsdOverride ?? bridge.amount,
					prefundAnchorUsdApprox: Number(prefundAnchorUsd.toFixed(4)),
					sorFrom: bridge.fromChain,
					sorTo: bridge.toChain,
					onChainUsd: {
						base: Number(balancesHuman.base.toFixed(4)),
						limitlessMakerBase: Number(
							(balancesHuman.limitlessMakerBase ?? 0).toFixed(4),
						),
						polygon: Number(balancesHuman.polygon.toFixed(4)),
						bnb: Number(balancesHuman.bnb.toFixed(4)),
						solana: Number(balancesHuman.solana.toFixed(4)),
					},
					sumSourcesExclDest: Number(
						(["base", "polygon", "solana", "bnb"] as const)
							.filter((c) => c !== bridge.toChain)
							.reduce((s, c) => s + Math.max(0, balancesHuman[c] ?? 0), 0)
							.toFixed(4),
					),
					breakdownLine: formatPrefundBalanceBreakdown(balancesHuman, bridge.toChain, {
						limitlessBaseDest,
					}),
					walletsMasked: {
						base: maskFundingAddress(fundingAddresses.baseSmartWallet),
						limitlessMaker: maskFundingAddress(fundingAddresses.limitlessMakerBase),
						polygon: maskFundingAddress(fundingAddresses.polymarketSafe),
						bnb: maskFundingAddress(fundingAddresses.embeddedEoa),
						solana: maskFundingAddress(fundingAddresses.solanaAddress),
					},
				};
				console.warn("[SOR][prefund] on-chain stable snapshot (RPC)", prefundLogBase);

				if (bridgeShortfallUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD) {
					console.warn("[SOR][prefund] no LI.FI pull — venue balance covers prefund target", {
						...prefundLogBase,
						scwToMakerSweepTxHash: scwToMakerSweepTxHash ?? null,
					});
					return { success: true, bridgeTxHash: scwToMakerSweepTxHash };
				}

				const sendScwToLimitlessMakerSweep = async (): Promise<string> => {
					if (plannedSweepMicros === 0n) {
						throw new Error("SCW → Limitless maker sweep was not planned.");
					}
					const makerAddr = fundingAddresses.limitlessMakerBase!.trim() as `0x${string}`;
					const usdcAddr = getUSDCAddress() as `0x${string}`;
					const data = encodeFunctionData({
						abi: erc20Abi,
						functionName: "transfer",
						args: [makerAddr, plannedSweepMicros],
					});
					const baseClient = await getClientForChain({ id: base.id });
					if (!baseClient?.sendTransaction) {
						throw new Error(
							"No Base smart wallet client — cannot move USDC from your Base smart wallet to the Limitless maker for this trade.",
						);
					}
					console.warn("[SOR][prefund] same-chain Base USDC (SCW → Limitless maker)", {
						venue: leg.venue,
						usdcApprox: Number(plannedSweepMicros) / 1e6,
					});
					const sent = await withTimeout(
						baseClient.sendTransaction({
							to: usdcAddr,
							data,
							value: 0n,
							chainId: base.id,
						}),
						SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
						"Base USDC transfer (SCW → Limitless maker)",
					);
					const hash = parsePrivyEvmTxHash(sent);
					await waitForBaseTransactionSuccess(
						hash,
						"USDC transfer smart wallet → Limitless maker",
					);
					return hash;
				};

				if (
					plannedSweepMicros > 0n &&
					lifiNeedUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD
				) {
					scwToMakerSweepTxHash = await sendScwToLimitlessMakerSweep();
					console.warn(
						"[SOR][prefund] no LI.FI pull after deterministic SCW sweep — prefund target covered",
						{
							...prefundLogBase,
							scwToMakerSweepTxHash,
						},
					);
					return { success: true, bridgeTxHash: scwToMakerSweepTxHash };
				}

				let steps: PrefundStep[];
				try {
					steps = buildPrefundSteps(
						lifiNeedUsd,
						bridge.fromChain,
						bridge.toChain,
						balancesHuman,
						{
							fullPrefundNeedUsdHuman: needHuman,
							limitlessBaseDest,
						},
					);
				} catch (planErr) {
					console.warn("[SOR][prefund] plan rejected — compare to UI pooled cash", {
						...prefundLogBase,
						reason: planErr instanceof Error ? planErr.message : String(planErr),
					});
					return {
						success: false,
						error: planErr instanceof Error ? planErr.message : String(planErr),
					};
				}

				let lastSourceTxHash: string | undefined;

				const runPrefundLifiSteps = async (): Promise<void> => {
					const reportPrefund = opts?.onPrefundProgress;
					for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
						const step = steps[stepIdx]!;
						reportPrefund?.({
							current: stepIdx + 1,
							total: steps.length,
						});
						const fromChainLifi = CHAIN_LIFI_IDS[step.fromChain];
						if (
							step.fromChain === "base" &&
							!limitlessBaseDest &&
							fundingAddresses.limitlessMakerBase?.trim()
						) {
							await consolidateLimitlessMakerUsdcOntoScwForBaseLifiStep({
								destPortionUsd: Math.max(0, Number(step.amountHuman)),
								balancesHuman,
								fundingAddresses,
								privateApi,
							});
						}
						const fromAddress = addressForChain(step.fromChain, fundingAddresses);
						if (!fromAddress) {
							throw new Error(`No wallet address for source chain ${step.fromChain}`);
						}

						const maxFromHuman =
							step.fromChain === "base"
								? Math.max(0, balancesHuman.base ?? 0)
								: Math.max(0, balancesHuman[step.fromChain] ?? 0);
						const destPortionUsd = Math.max(0, Number(step.amountHuman));
						let quote: LifiQuoteResponse;
						let spentHumanForLedger = 0;
						try {
							const solved = await ensurePrefundQuoteMeetsDestMin({
								api: privateApi as PrefundLifiQuoteClient,
								fromChainLifi,
								toChainLifi,
								fromAddress,
								toAddress: toAddress.trim(),
								destPortionUsd,
								maxFromHuman,
								seedAmountHuman: step.amountHuman,
							});
							quote = solved.quote;
							spentHumanForLedger = Number(solved.amountHuman);
						} catch (quoteErr) {
							const msg =
								quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
							throw new Error(msg);
						}

						if (!quote.steps?.length) {
							throw new Error("LI.FI returned no bridge steps");
						}

						if (import.meta.env.DEV) {
							const st0 = quote.steps[0] as Record<string, unknown> | undefined;
							console.info("[SOR] Bridge LIFI quote", {
								venue: leg.venue,
								prefundStep: `${stepIdx + 1}/${steps.length}`,
								fromChainLifi,
								toChainLifi,
								stepCount: quote.steps.length,
								firstStepKind: st0?.kind,
								firstStepChainId: st0?.chainId,
							});
						}

						const needsRelay = fromChainLifi === POLYGON_CHAIN_ID;
						let relayClient: RelayClient | null = null;
						if (needsRelay) {
							relayClient = await getRelayClient();
						}

						const allowanceOwnerByChainId: Partial<Record<number, string>> = {};
						if (fundingAddresses.baseSmartWallet) {
							allowanceOwnerByChainId[8453] = fundingAddresses.baseSmartWallet;
						}
						if (fundingAddresses.polymarketSafe) {
							allowanceOwnerByChainId[POLYGON_CHAIN_ID] = fundingAddresses.polymarketSafe;
						}
						if (fundingAddresses.embeddedEoa) {
							allowanceOwnerByChainId[BNB_CHAIN_ID] = fundingAddresses.embeddedEoa;
						}

						const bridgeGetSigner = async (
							chainId: number,
						): Promise<SendTransactionCapable | null> => {
							if (chainId === BNB_CHAIN_ID) {
								const addr = fundingAddresses.embeddedEoa as `0x${string}` | undefined;
								if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
									return null;
								}
								return createPrivyEmbeddedSendTransactionCapable(
									addr,
									bsc,
									privyEvmSendTransaction,
								);
							}
							const client = await getClientForChain({ id: chainId });
							if (!client) return null;
							return {
								sendTransaction: (
									args: Parameters<SendTransactionCapable["sendTransaction"]>[0],
								) => client.sendTransaction(args),
							};
						};

						console.warn("[SOR][prefund] executing LI.FI on-chain steps (wallet may prompt)…", {
							venue: leg.venue,
							prefundStep: `${stepIdx + 1}/${steps.length}`,
							fromChainLifi,
							toChainLifi,
						});

						reportSorExecutionPhase("approving_funds_transfer");
						let txHashes: string[];
						try {
							const lifiOnchain = await withTimeout(
								executeLifiSteps(
									quote.steps as Parameters<typeof executeLifiSteps>[0],
									bridgeGetSigner,
									{
										allowanceOwnerByChainId,
										polygonRelay: needsRelay && relayClient ? { client: relayClient } : undefined,
										solanaSigner: solanaSigner ?? undefined,
										rawLifiRoute: quote.quote,
										polygonSafeUnwrapPrerequisite: quote.polygonSafeUnwrapPrerequisite ?? undefined,
										...(fundingAddresses.solanaAddress?.trim()
											? { solanaTokenOwnerAddress: fundingAddresses.solanaAddress.trim() }
											: {}),
									},
								),
								SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
								"SOR LI.FI on-chain steps (approvals / bridge tx)",
							);
							txHashes = lifiOnchain.txHashes;
						} finally {
							reportSorExecutionPhase("moving_funds");
						}

						console.warn("[SOR][prefund] on-chain steps submitted; polling bridge status…", {
							venue: leg.venue,
							txCount: txHashes.length,
						});

						const sourceTxHash = pickBridgeSourceTxHashForLifiStatus(
							txHashes,
							quote.steps as unknown[] | undefined,
							fromChainLifi,
						);
						if (!sourceTxHash) {
							throw new Error("Bridge produced no transaction hash");
						}

						const statusTool =
							typeof quote.statusBridge === "string" && quote.statusBridge.trim()
								? quote.statusBridge.trim()
								: undefined;

						await pollLifiUntilTerminal(
							() =>
								privateApi.getFundingLifiStatus({
									txHash: sourceTxHash,
									...(statusTool != null ? { tool: statusTool } : {}),
									fromChain: fromChainLifi,
									toChain: toChainLifi,
								}) as Promise<LifiStatusResponse>,
							SOR_LIFI_PREFUND_POLL,
						);

						if (Number.isFinite(spentHumanForLedger) && spentHumanForLedger > 0) {
							const cur = balancesHuman[step.fromChain] ?? 0;
							balancesHuman[step.fromChain] = Math.max(0, cur - spentHumanForLedger);
						}

						lastSourceTxHash = sourceTxHash;
					}
				};

				if (plannedSweepMicros > 0n) {
					console.warn(
						"[SOR][prefund] parallel settle: Base SCW → maker receipt + LI.FI terminal",
						{
							venue: leg.venue,
							scwSweepUsdcApprox: sweepAmountHuman,
							lifiSteps: steps.length,
						},
					);
					const [sweepHash] = await Promise.all([
						sendScwToLimitlessMakerSweep(),
						runPrefundLifiSteps(),
					]);
					scwToMakerSweepTxHash = sweepHash;
				} else {
					await runPrefundLifiSteps();
				}

				return {
					success: true,
					bridgeTxHash: lastSourceTxHash ?? scwToMakerSweepTxHash,
				};
			} catch (err) {
				console.error("error", err);
				const msg = getPrivateApiErrorMessage(err).trim();
				return {
					success: false,
					error:
						msg.length > 0
							? msg
							: "Bridge execution failed (no error message).",
				};
			}
		},
		[
			fundingAddresses,
			privateApi,
			getClientForChain,
			getRelayClient,
			solanaSigner,
		],
	);

	return useMemo(() => ({ executeLeg, executeBridge }), [executeLeg, executeBridge]);
}
