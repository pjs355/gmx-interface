import { useCallback, useMemo } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";
import { bsc } from "viem/chains";
import { Side } from "@polymarket/clob-client";
import type { TickSize } from "@polymarket/clob-client";
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
import type { LifiStatusResponse } from "@/types/trading";
import { withTimeout } from "@/utils/withTimeout";
import { readFundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";
import {
	buildPrefundSteps,
	computePrefundBridgeShortfallUsdHuman,
	computePrefundNeedUsdHuman,
	formatPrefundBalanceBreakdown,
	isMultisourcePrefundEnabled,
	LIFI_BRIDGE_AMOUNT_MARGIN,
	PREFUND_SHORTFALL_COVERED_EPS_USD,
	type PrefundStep,
} from "@/trading/sor/prefundPlan";
import { ensurePrefundQuoteMeetsDestMin } from "@/trading/sor/lifiPrefundQuoteSolve";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import type { LimitlessOrderRequest } from "@/trading/limitless/limitlessPrivateApiTypes";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";

/** Keep prefund sub-steps bounded vs `LEG_OR_BRIDGE_TIMEOUT_MS` in `useSorExecution`. */
const SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS = 100_000;
/** ~15 × 4s ≈ 60s of idle wait between polls, plus ~15 status calls (outer bridge timeout still applies). */
const SOR_LIFI_PREFUND_POLL = { maxAttempts: 15, intervalMs: 4_000 } as const;

type LegResult = {
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
};

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
	 * Refreshes Limitless account provisioning (server-side `ensure-account`
	 * which runs `syncAllowance`) immediately before submitting. Approvals on
	 * Limitless are modeled server-side via the partner API; this call
	 * confirms the user is cleared to trade before we hit `postLimitlessOrder`.
	 */
	ensureLimitlessApprovals?: () => Promise<void>;
	/**
	 * Re-fetches the DFlow/Proof KYC status on click so a user who verified
	 * mid-session isn't falsely rejected from a stale cache. Returns the
	 * freshly-read verified boolean. On `false`, the executor throws a loud
	 * error and the trade box is expected to launch `startDflowProofRedirect`.
	 */
	ensureDflowProofVerified?: () => Promise<boolean>;
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
	} = deps;

	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();

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
						try {
							await ensureLevelUpApprovals();
						} catch (e: unknown) {
							const msg =
								e instanceof Error ? e.message : "LevelUp approvals failed";
							return { filled: false, filledShares: 0, error: msg };
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

				// ─── Polymarket (Polygon, USDC) ───────────
				case "polymarket": {
					if (!polyClob.ready) {
						return { filled: false, filledShares: 0, error: "Polymarket CLOB session not ready. Open Polymarket tab first to initialize." };
					}
					// Approvals are ungated from SOR eligibility — the user
					// sees Polymarket in the plan regardless — but we must
					// satisfy them JIT before signing an order, otherwise the
					// CLOB rejects with a cryptic "not approved" error.
					if (ensurePolymarketApprovals) {
						try {
							await ensurePolymarketApprovals();
						} catch (e: unknown) {
							const msg =
								e instanceof Error ? e.message : "Polymarket approvals failed";
							return { filled: false, filledShares: 0, error: msg };
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
					// Limitless approvals are server-side (partner API). The
					// SOR no longer gates on `approvalComplete`, so we must
					// re-run ensure-account on the click to guarantee the
					// partner's allowance ledger is fresh before we submit.
					if (ensureLimitlessApprovals) {
						try {
							await ensureLimitlessApprovals();
						} catch (e: unknown) {
							const msg =
								e instanceof Error ? e.message : "Limitless account not ready";
							return { filled: false, filledShares: 0, error: msg };
						}
					}
					const feeRateBps = LIMITLESS_DEFAULT_FEE_RATE_BPS;
					if (isLimit) {
						await privateApi.postLimitlessOrder({
							marketSlug: slug,
							orderType: "GTC",
							tokenId,
							side: side === "buy" ? "BUY" : "SELL",
							price: limitPrice as number,
							size: leg.shares,
							feeRateBps,
						});
					} else if (side === "buy") {
						await privateApi.postLimitlessOrder({
							marketSlug: slug,
							orderType: "FOK",
							tokenId,
							side: "BUY",
							makerAmount: leg.executionAmountUsd,
							feeRateBps,
						});
					} else {
						await privateApi.postLimitlessOrder({
							marketSlug: slug,
							orderType: "FOK",
							tokenId,
							side: "SELL",
							makerAmount: leg.shares,
							feeRateBps,
						});
					}
					return { filled: true, filledShares: leg.shares };
				}

				// ─── Predict (BNB, USDT) ─────────────
				case "predictfun": {
					if (!predictSession.ready) {
						return { filled: false, filledShares: 0, error: "Predict session not ready. Authenticate on the Predict tab first." };
					}
					if (ensurePredictApprovals) {
						try {
							await ensurePredictApprovals();
						} catch (e: unknown) {
							const msg = e instanceof Error ? e.message : "Predict approvals failed";
							return { filled: false, filledShares: 0, error: msg };
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
					}

					const amountStr = side === "buy"
						? leg.executionAmountUsd.toFixed(6)
						: leg.shares.toFixed(6);

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
		],
	);

	// ──────────────────────────────────────────────
	// executeBridge: LI.FI cross-chain transfer
	// ──────────────────────────────────────────────

	const executeBridge = useCallback(
		async (
			leg: RouteLeg,
			opts?: { amountUsdOverride?: number },
		): Promise<BridgeResult> => {
			const bridge = leg.bridge;
			if (!bridge) {
				return { success: false, error: "No bridge data on leg" };
			}

			const toChainLifi = CHAIN_LIFI_IDS[bridge.toChain];
			const toAddress = addressForChain(bridge.toChain, fundingAddresses);
			if (!toAddress?.trim()) {
				return {
					success: false,
					error: `No wallet address for destination chain ${bridge.toChain}`,
				};
			}

			const BNB_CHAIN_ID = bsc.id;
			const POLYGON_CHAIN_ID = 137;

			try {
				const needHuman = computePrefundNeedUsdHuman(
					opts?.amountUsdOverride ?? bridge.amount,
					LIFI_BRIDGE_AMOUNT_MARGIN,
				);
				const balancesHuman = await readFundingStableBalancesHuman(fundingAddresses);
				const multisource = isMultisourcePrefundEnabled();
				const onDestUsd = Math.max(0, balancesHuman[bridge.toChain] ?? 0);
				const venueAppliedUsd = Math.min(needHuman, onDestUsd);
				const bridgeShortfallUsd = computePrefundBridgeShortfallUsdHuman(
					needHuman,
					bridge.toChain,
					balancesHuman,
				);
				const prefundLogBase = {
					venue: leg.venue,
					prefundTargetUsdApprox: Number(needHuman.toFixed(4)),
					venueSpendAppliedUsdApprox: Number(venueAppliedUsd.toFixed(4)),
					bridgeShortfallUsdApprox: Number(bridgeShortfallUsd.toFixed(4)),
					bridgeAmountUsd: opts?.amountUsdOverride ?? bridge.amount,
					multisource,
					sorFrom: bridge.fromChain,
					sorTo: bridge.toChain,
					onChainUsd: {
						base: Number(balancesHuman.base.toFixed(4)),
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
					breakdownLine: formatPrefundBalanceBreakdown(balancesHuman, bridge.toChain),
					walletsMasked: {
						base: maskFundingAddress(fundingAddresses.baseSmartWallet),
						polygon: maskFundingAddress(fundingAddresses.polymarketSafe),
						bnb: maskFundingAddress(fundingAddresses.embeddedEoa),
						solana: maskFundingAddress(fundingAddresses.solanaAddress),
					},
				};
				console.warn("[SOR][prefund] on-chain stable snapshot (RPC)", prefundLogBase);

				if (bridgeShortfallUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD) {
					console.warn("[SOR][prefund] no LI.FI pull — venue balance covers prefund target", {
						...prefundLogBase,
					});
					return { success: true };
				}

				let steps: PrefundStep[];
				try {
					steps = buildPrefundSteps(
						bridgeShortfallUsd,
						bridge.fromChain,
						bridge.toChain,
						balancesHuman,
						multisource,
						{ fullPrefundNeedUsdHuman: needHuman },
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

				for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
					const step = steps[stepIdx]!;
					const fromChainLifi = CHAIN_LIFI_IDS[step.fromChain];
					const fromAddress = addressForChain(step.fromChain, fundingAddresses);
					if (!fromAddress) {
						return {
							success: false,
							error: `No wallet address for source chain ${step.fromChain}`,
						};
					}

					const maxFromHuman = Math.max(0, balancesHuman[step.fromChain] ?? 0);
					const destPortionUsd = Math.max(0, Number(step.amountHuman));
					let quote: Awaited<ReturnType<typeof privateApi.postFundingLifiQuote>>;
					let spentHumanForLedger = 0;
					try {
						const solved = await ensurePrefundQuoteMeetsDestMin({
							api: privateApi,
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
						return { success: false, error: msg };
					}

					if (!quote.steps?.length) {
						return { success: false, error: "LI.FI returned no bridge steps" };
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

					const bridgeGetSigner = async (chainId: number): Promise<SendTransactionCapable | null> => {
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
							sendTransaction: (args: Parameters<SendTransactionCapable["sendTransaction"]>[0]) =>
								client.sendTransaction(args),
						};
					};

					console.warn("[SOR][prefund] executing LI.FI on-chain steps (wallet may prompt)…", {
						venue: leg.venue,
						prefundStep: `${stepIdx + 1}/${steps.length}`,
						fromChainLifi,
						toChainLifi,
					});

					const { txHashes } = await withTimeout(
						executeLifiSteps(
							quote.steps as Parameters<typeof executeLifiSteps>[0],
							bridgeGetSigner,
							{
								allowanceOwnerByChainId,
								polygonRelay: needsRelay && relayClient ? { client: relayClient } : undefined,
								solanaSigner: solanaSigner ?? undefined,
								rawLifiRoute: quote.quote,
								...(fundingAddresses.solanaAddress?.trim()
									? { solanaTokenOwnerAddress: fundingAddresses.solanaAddress.trim() }
									: {}),
							},
						),
						SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
						"SOR LI.FI on-chain steps (approvals / bridge tx)",
					);

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
						return { success: false, error: "Bridge produced no transaction hash" };
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

				return { success: true, bridgeTxHash: lastSourceTxHash };
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Bridge execution failed";
				return { success: false, error: msg };
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
