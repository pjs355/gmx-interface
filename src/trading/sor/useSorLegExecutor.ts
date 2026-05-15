import { useCallback, useMemo, type MutableRefObject } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, formatUnits } from "viem";
import { base } from "viem/chains";
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
import { useFundingLifiExecution } from "@/trading/lifi/useFundingLifiExecution";
import { pickLifiSourceTxHashForStatus } from "@/trading/lifi/pickLifiSourceTxHashForStatus";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import type { LifiStatusResponse, LifiQuoteResponse } from "@/types/trading";
import { withTimeout } from "@/utils/withTimeout";
import { getPrivateApiErrorMessage } from "@/services/privateApi/errors";
import type {
	DflowOrderParams,
	DflowOrderStatusResponse,
	DflowOrderSubmitBody,
	DflowOrderSubmitResponse,
} from "@/services/privateApi/client";
import type { SorExecutionPhase } from "./useSorExecution";
import {
	readFundingStableBalancesHuman,
	readBaseEmbeddedUsdcBalanceRaw,
	readBaseScwUsdcBalanceRaw,
	readBnbUsdtBalanceWei,
	type FundingStableBalancesHuman,
} from "@/trading/sor/fundingStableBalances";
import {
	isLimitlessSweepInsufficientBalanceError,
	planLimitlessScwSweepMicros,
	recappedSweepForSend,
} from "@/trading/sor/limitlessPrefundSweep";
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
import {
	mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund,
	sorBasePrefundLifiShouldUseEmbeddedSigner,
} from "@/trading/sor/sorPrefundLifiExecutionAlignment";
import {
	SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
	SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
	SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
	SOR_LIFI_PREFUND_POLL_CONFIG,
} from "@/trading/sor/sorBridgeWallTimeBudget";
import { registerPendingDflowOutcomeMints } from "@/trading/dflow/pendingDflowOutcomeMints";
import type { BuildLimitlessSorOrderInput } from "@/trading/limitless/limitlessSignedClobOrder";
import type { LimitlessSignedOrderSubmit } from "@/trading/limitless/limitlessPrivateApiTypes";
import {
	buildPolygonSafeUsdceWrapTransactions,
	readPolymarketSafeCtfBalanceWei,
	readPolymarketSafePusdBalanceWei,
	readPolymarketSafeUsdceBalanceWei,
} from "@/trading/polymarket/polygonCollateralWrap";
import { clampMarketBuyAmountToWallet } from "@/trading/sor/postBridgeOrderResize";
import { clampMarketSellSharesToCtfBalance } from "@/trading/polymarket/polymarketSellShareClamp";
import { clampPredictSellSharesToOutcomeBalance } from "@/trading/predict/predictSellShareClamp";
import { readPredictOutcomeShareWei } from "@/trading/predict/usePredictBnbBalances";
import {
	floorSharesAtDecimals,
	floorSharesAtDecimalsAsString,
} from "@/trading/utils/floorShares";
import { wireAmountUsdForVenue } from "@/trading/sor/wireAmount";
import {
	levelUpBuySignedPremiumUsdHuman,
	resolveLevelUpSigningPrice,
} from "@/trading/sor/levelUpSorSigning";
import { predictionBuyMakerMicroUsdc } from "@/trading/sor/predictionBuyCollateralMicro";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { quoteSignAndSubmitDflowOrder } from "@/trading/dflow/quoteSignAndSubmitDflowOrder";
import { executePolygonRelayAndWait } from "@/trading/polymarket/safeActions";
import { getUSDCAddress, SOLANA_USDC_MINT } from "@/config/addresses";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";
import { levelUpBuyTotalMicroScwBalanceRequired } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLevelUp";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/trading/base/waitPrivyBaseTxReceipt";

/**
 * Limitless SDK `calculateFOKAmounts` rejects `makerAmount` when `.toString()`
 * has more than 6 fractional digits. We floor (never round half-up) to keep
 * sells from drifting above the wallet's actual balance — same rule the
 * trade box display uses (`formatShareCountDisplay`) and that Polymarket
 * enforces via its CTF clamp. `Number(toFixed(6))` was previously used and
 * could promote `3.3799999` to `3.38`, causing venues to reject the order.
 */
function floorLimitlessFokMakerAmountHuman(n: number): number {
	return floorSharesAtDecimals(n, 6);
}

/**
 * DFlow prediction-market orders are async end-to-end. `POST /api/dflow/orders`
 * does not return until the server observes DFlow `/order-status` === `closed`
 * (or returns a non-2xx with DFlow `msg`/`code`/`reverts` on failure). The SOR leg
 * is marked filled only on HTTP 200 from that route. Post-trade balance refetch
 * (`usePostTradeBalanceSync`) still converges positions after settlement.
 */

/**
 * Detect Polymarket order errors that imply a missing/revoked allowance on the
 * Safe and would be cured by re-running the onboarding approval batch.
 *
 * - "not approved" — CLOB pre-trade check failure
 * - "not enough balance / allowance" — CLOB error string when the maker
 *   (Safe) hasn't approved the CTF Exchange or pUSD spender
 * - "ERC20: transfer amount exceeds allowance" — on-chain revert reason from
 *   the wrap/unwrap path or pUSD `transferFrom` inside CLOB settlement
 * - The Polymarket relay revert sentinel from `safeActions.ts` — wraps the
 *   above on-chain message when the relayer reports STATE_FAILED
 */
function isPolymarketAllowanceRecoverableError(message: string): boolean {
	const m = message.toLowerCase();
	return (
		m.includes("not approved") ||
		m.includes("not enough balance / allowance") ||
		m.includes("transfer amount exceeds allowance") ||
		m.includes("insufficient allowance") ||
		m.includes("polymarket deposit wallet relay transaction reverted on-chain")
	);
}

type LegResult = {
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
};

/**
 * Limitless `POST /orders` returns 200 with either a real order/execution
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
		getDflowOrder: (
			params: DflowOrderParams,
		) => Promise<{
			transaction?: string;
			outAmount?: string;
			lastValidBlockHeight?: number;
			code?: string;
			msg?: string;
		}>;
		postDflowOrder: (
			body: DflowOrderSubmitBody,
		) => Promise<DflowOrderSubmitResponse>;
		getDflowOrderStatus: (
			signature: string,
			lastValidBlockHeight?: number,
		) => Promise<DflowOrderStatusResponse>;
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
		postLimitlessOrder: (body: LimitlessSignedOrderSubmit) => Promise<unknown>;
		postLimitlessPortfolioWithdraw: (input: {
			amountHuman: number;
			destination: string;
		}) => Promise<unknown>;
	};

	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null;
	/** Mongo Umbrella `_id` — sent with DFlow submit for init-market umbrella mapping. */
	umbrellaId?: string | null;
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
	 *
	 * Default fast path: trusts the persisted venue-state flags from the
	 * polymarket-account query (set by `verify-on-chain` after onboarding) and
	 * skips the on-chain `checkPolymarketApprovals` multicall. Pass
	 * `{ force: true }` to bypass the fast path — used by the order-error
	 * recovery branch to repair an externally-revoked allowance.
	 *
	 * `onApprovalWorkStart` fires only when the callback is about to submit
	 * the on-chain relay batch (i.e. approvals are actually being set). The
	 * SOR executor uses it to flip the trade-button phase to "Approving
	 * trades..." just for that window — so the fast path doesn't briefly
	 * flash an "Approving" label when no approval work is happening.
	 */
	ensurePolymarketApprovals?: (opts?: {
		force?: boolean;
		onApprovalWorkStart?: () => void;
	}) => Promise<void>;
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
	/** EIP-712 signed CLOB body for Limitless SOR legs (fetches market + signs). */
	buildLimitlessSignedOrderFromMarket?: (
		input: BuildLimitlessSorOrderInput,
	) => Promise<LimitlessSignedOrderSubmit>;
	/** Partner `ownerId` from ensure-account. */
	getLimitlessOwnerId?: () => number | null | undefined;
	/** Venue maker address (must match the browser EIP-712 signer). */
	getLimitlessMakerAddress?: () => string | null | undefined;
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

/**
 * Per-chain destination address for SOR funding moves. The Polygon entry
 * returns `addrs.polymarketSafe`, which after the deposit-wallet migration is
 * the user's Polymarket **deposit wallet** (ERC-1967 proxy from the deposit
 * wallet factory) — same downstream consumers, different wallet type. The
 * field name is kept for back-compat with all existing callers.
 */
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

function prefundSourceAddressForStep(
	step: PrefundStep,
	addrs: UseSorLegExecutorDeps["fundingAddresses"],
): string | undefined {
	if (step.fromChain !== "base") {
		return addressForChain(step.fromChain, addrs);
	}
	const w = step.baseSpendWallet;
	if (w === "limitlessMaker") {
		return addrs.limitlessMakerBase?.trim();
	}
	return addrs.baseSmartWallet?.trim();
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
		umbrellaId,
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
		buildLimitlessSignedOrderFromMarket,
		getLimitlessOwnerId,
		getLimitlessMakerAddress,
		ensureDflowProofVerified,
		reportExecutionPhaseRef,
	} = deps;

	const {
		getSignerForChain,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
	} = useFundingLifiExecution();

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
					const scw = fundingAddresses.baseSmartWallet?.trim();
					if (!scw) {
						return {
							filled: false,
							filledShares: 0,
							error:
								"LevelUp trades require a Base Coinbase Smart Wallet. Link a smart wallet in Privy.",
						};
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
					const signingPrice = resolveLevelUpSigningPrice({
						leg,
						side,
						isLimit,
						limitPrice,
					});

					/**
					 * LevelUp `POST /orders` uses the **Base SCW as maker** — API balance checks
					 * are on SCW USDC only. SOR buy legs with `bridge: null` never run
					 * `executeBridge`, so no Li.FI prefund runs to move USDC onto the SCW.
					 * If the SCW is short but the user also holds USDC on the **embedded EOA on
					 * Base** (same chain), we `transfer` that USDC to the SCW before signing.
					 * This is a funding convenience only; venue trading identity stays the SCW.
					 */
					if (side === "buy") {
						const embeddedTrim = fundingAddresses.embeddedEoa?.trim() ?? "";
						const scwLc = scw.toLowerCase();
						if (
							embeddedTrim.length === 42 &&
							embeddedTrim.startsWith("0x") &&
							embeddedTrim.toLowerCase() !== scwLc
						) {
							const makerMicro = predictionBuyMakerMicroUsdc(
								shares,
								signingPrice,
							);
							/** SCW must cover signed `makerAmount` + LevelUp buy fee (FeeWrapper); see API `ensureUsdcApprovalAndBalance`. */
							const requiredMicro =
								levelUpBuyTotalMicroScwBalanceRequired(makerMicro);
							let scwBal = await readBaseScwUsdcBalanceRaw(scw);
							let embBal = 0n;
							if (scwBal < requiredMicro) {
								embBal = await readBaseEmbeddedUsdcBalanceRaw(embeddedTrim);
								const shortfall = requiredMicro - scwBal;
								const sendMicro =
									shortfall <= embBal ? shortfall : embBal;
								if (sendMicro > 0n) {
									reportSorExecutionPhase("moving_funds");
									try {
										console.debug("[SOR][prefund] same-chain Base USDC (embedded → SCW for LevelUp)", {
											venue: "levelup",
											usdcApprox: Number(sendMicro) / 1e6,
										});
										const embeddedTx =
											createPrivyEmbeddedSendTransactionCapable(
												embeddedTrim as `0x${string}`,
												base,
												privyEvmSendTransaction,
											);
										const usdcAddr = getUSDCAddress() as `0x${string}`;
										const data = encodeFunctionData({
											abi: erc20Abi,
											functionName: "transfer",
											args: [scw as `0x${string}`, sendMicro],
										});
										const sent = await withTimeout(
											embeddedTx.sendTransaction({
												to: usdcAddr,
												data,
												value: 0n,
												chainId: base.id,
											}),
											SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
											"Base USDC transfer (embedded EOA → smart wallet for LevelUp)",
										);
										const hash = parsePrivyEvmTxHash(sent);
										await withTimeout(
											waitForBaseTransactionSuccess(
												hash,
												"USDC transfer embedded → smart wallet",
											),
											SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
											"USDC transfer receipt embedded → smart wallet",
										);
									} finally {
										reportSorExecutionPhase("executing_trade");
									}
									scwBal = await readBaseScwUsdcBalanceRaw(scw);
								}
							}
							if (scwBal < requiredMicro) {
								const needHuman = Number(formatUnits(requiredMicro, 6));
								const haveHuman = Number(formatUnits(scwBal, 6));
								const embHuman = Number(formatUnits(embBal, 6));
								return {
									filled: false,
									filledShares: 0,
									error:
										`Insufficient USDC on your Base smart wallet for this LevelUp buy (~$${needHuman.toFixed(2)} required). ` +
										`After moving funds from your embedded wallet on Base, the smart wallet has ~$${haveHuman.toFixed(2)} ` +
										`(embedded Base USDC available to move was ~$${embHuman.toFixed(2)}). ` +
										"Add USDC on Base to your smart wallet or embedded wallet, refresh, and try again.",
								};
							}
						}
					}

					const params: TradeExecutionParams = {
						marketId: questionId,
						position,
						amount: shares,
						price: signingPrice,
						orderType: isLimit ? "limit" : "market",
						side,
						userAddress: scw,
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
							const msg =
								e instanceof Error ? e.message : "Polymarket approvals failed";
							return { filled: false, filledShares: 0, error: msg };
						} finally {
							if (didApprovalWork) {
								reportSorExecutionPhase("executing_trade");
							}
						}
					}
					// CLOB spends pUSD — wrap Safe USDC.e via Collateral Onramp before buys.
					const rawSafe = fundingAddresses.polymarketSafe?.trim();
					const safeAddrValid =
						!!rawSafe && /^0x[a-fA-F0-9]{40}$/i.test(rawSafe);

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
						if (side === "buy" && safeAddrValid) {
							let usdceWei: bigint;
							try {
								usdceWei = await readPolymarketSafeUsdceBalanceWei(rawSafe!);
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
								const txs = buildPolygonSafeUsdceWrapTransactions({
									safeAddress: rawSafe!,
									wrapAmountWei: usdceWei,
								});
								// Throws — caught by outer recovery block when
								// the revert is allowance-related.
								await executePolygonRelayAndWait(
									relayClient,
									txs,
									rawSafe!,
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
						if (side === "buy" && safeAddrValid) {
							let pusdWei: bigint;
							try {
								pusdWei = await readPolymarketSafePusdBalanceWei(rawSafe!);
							} catch (e: unknown) {
								const msg =
									e instanceof Error
										? e.message
										: "Could not read Polygon pUSD balance before trade";
								return { filled: false, filledShares: 0, error: msg };
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
						if (side === "sell" && safeAddrValid) {
							let ctfBalWei: bigint;
							try {
								ctfBalWei = await readPolymarketSafeCtfBalanceWei(rawSafe!, tokenId);
							} catch (e: unknown) {
								const msg =
									e instanceof Error
										? e.message
										: "Could not read Polymarket CTF balance before sell";
								return { filled: false, filledShares: 0, error: msg };
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
								const recovMsg =
									recovErr instanceof Error
										? recovErr.message
										: String(recovErr);
								return {
									filled: false,
									filledShares: 0,
									error: `Polymarket order failed; approval repair also failed: ${recovMsg}`,
								};
							} finally {
								if (didRecoveryWork) {
									reportSorExecutionPhase("executing_trade");
								}
							}
							try {
								return await attemptWrapAndPlace();
							} catch (retryErr: unknown) {
								const retryMsg =
									retryErr instanceof Error
										? retryErr.message
										: String(retryErr);
								return {
									filled: false,
									filledShares: 0,
									error: retryMsg,
								};
							}
						}
						return { filled: false, filledShares: 0, error: msg };
					}
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

					if (!solanaSigner) {
						return {
							filled: false,
							filledShares: 0,
							error: "Solana signer unavailable — connect your Solana embedded wallet",
						};
					}

					const ids = leg.venueMarketIds;
					const yesPairMint =
						leg.outcome === "A"
							? ids.dflowYesMintA?.trim()
							: ids.dflowYesMintB?.trim();
					const noPairMint =
						leg.outcome === "A"
							? ids.dflowNoMintA?.trim()
							: ids.dflowNoMintB?.trim();

					const submitExtras: Omit<
						DflowOrderSubmitBody,
						"signedTx" | "lastValidBlockHeight"
					> = {
						inputMint,
						outputMint,
						amount: amountBaseUnits,
						side: side === "buy" ? "BUY" : "SELL",
						outcome: leg.outcome === "A" ? "yes" : "no",
						umbrellaId: umbrellaId?.trim() || undefined,
						marketRef: {
							externalMarketId: outcomeMint,
							tokenId: outcomeMint,
						},
					};
					if (yesPairMint && noPairMint) {
						submitExtras.outcomePairMints = {
							yesMint: yesPairMint,
							noMint: noPairMint,
						};
					}

					let signature: string;
					try {
						const r = await quoteSignAndSubmitDflowOrder({
							privateApi,
							submitFn: (body) => privateApi.postDflowOrder(body),
							solanaSigner,
							orderParams: {
								inputMint,
								outputMint,
								amount: amountBaseUnits,
								slippageBps: "auto",
								predictionMarketSlippageBps: "auto",
							},
							submitExtras,
						});
						signature = r.signature;
					} catch (e: unknown) {
						const msg =
							e instanceof Error ? e.message : "Kalshi order failed";
						return { filled: false, filledShares: 0, error: msg };
					}

					if (side === "buy" && outputMint.trim()) {
						registerPendingDflowOutcomeMints([outputMint.trim()]);
					}

					return {
						filled: true,
						filledShares: leg.shares,
						txHash: signature,
					};
				}

				// ─── Limitless (Base, USDC) ───────────
				case "limitless": {
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
							error: "Missing Limitless slug or outcome token on route leg",
						};
					}
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
								return { filled: false, filledShares: 0, error: msg };
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
						if (
							!isLimit &&
							side === "buy" &&
							fundingAddresses.limitlessMakerBase?.trim()
						) {
							let makerUsdcHuman: number;
							try {
								const balances = await readFundingStableBalancesHuman({
									limitlessMakerBase: fundingAddresses.limitlessMakerBase,
								});
								makerUsdcHuman = balances.limitlessMakerBase ?? 0;
							} catch (e: unknown) {
								const msg =
									e instanceof Error
										? e.message
										: "Could not read Limitless maker USDC balance before order";
								return { filled: false, filledShares: 0, error: msg };
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
						let limitlessOrderResponse: unknown;
						if (isLimit) {
							limitlessOrderResponse = await submitLimitlessOrder(
								await buildSigned({
									kind: "gtc",
									slug: orderMarketSlug,
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
									slug: orderMarketSlug,
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
									slug: orderMarketSlug,
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
					const predictEoa = fundingAddresses.embeddedEoa?.trim() ?? "";
					const predictEoaValid = /^0x[a-fA-F0-9]{40}$/.test(predictEoa);
					let predictSellShares = leg.shares;
					let predictSellScale = 1;
					if (side === "sell" && predictEoaValid) {
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
							const msg =
								e instanceof Error
									? e.message
									: "Could not read Predict outcome ERC-1155 balance before sell";
							return { filled: false, filledShares: 0, error: msg };
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
									side === "sell" ? leg.shares * predictSellScale : leg.shares,
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
					if (side === "buy" && predictEoaValid) {
						let bnbUsdtHuman: number;
						try {
							const balances = await readFundingStableBalancesHuman({
								embeddedEoa: fundingAddresses.embeddedEoa,
							});
							bnbUsdtHuman = balances.bnb ?? 0;
						} catch (e: unknown) {
							const msg =
								e instanceof Error
									? e.message
									: "Could not read BNB USDT balance before Predict order";
							return { filled: false, filledShares: 0, error: msg };
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
							filledShares:
								side === "buy"
									? leg.shares * predictPostBridgeScale
									: leg.shares * predictSellScale,
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
			umbrellaId,
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
			ensureLimitlessApprovals,
			ensureDflowProofVerified,
			getClientForChain,
			buildLimitlessSignedOrderFromMarket,
			getLimitlessOwnerId,
			getLimitlessMakerAddress,
			getRelayClient,
			fundingAddresses,
			privyEvmSendTransaction,
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
				/**
				 * Strict source-debit ceiling for this corridor. For grouped legs,
				 * `Σ executionAmountUsd + groupBridgeCostUsd`. For a single leg,
				 * `leg.executionAmountUsd + leg.bridge.estimatedCost`. The LI.FI quote
				 * iteration caps `sendHuman` at `min(walletBalance, budgetUsdOverride)`
				 * so source-wallet debit never exceeds the optimizer's per-corridor
				 * allocation, regardless of wallet headroom.
				 */
				budgetUsdOverride?: number;
				onPrefundProgress?: (p: { current: number; total: number }) => void;
				/** LevelUp: require quoted LiFi min-dest ≥ full prefund step need at send cap. */
				strictLifiDestMinAtSendCap?: boolean;
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
					opts?.amountUsdOverride != null
						? undefined
						: leg.venue === "levelup"
							? levelUpBuySignedPremiumUsdHuman(leg)
							: undefined,
				);
				const needHuman = computePrefundNeedUsdHuman(
					prefundAnchorUsd,
					LIFI_BRIDGE_AMOUNT_MARGIN,
				);
				/**
				 * Per-corridor source-debit ceiling. For grouped legs the caller
				 * passes `Σ executionAmountUsd + groupBridgeCostUsd`; for a single
				 * leg fall back to this leg's `executionAmountUsd + bridge.estimatedCost`.
				 * Capping `sendHuman` at this budget is what enforces "source debit ≤
				 * request.amount" even when the source wallet has more available.
				 */
				const corridorBudgetUsd =
					typeof opts?.budgetUsdOverride === "number" &&
					Number.isFinite(opts.budgetUsdOverride) &&
					opts.budgetUsdOverride > 0
						? opts.budgetUsdOverride
						: leg.executionAmountUsd + Math.max(0, bridge.estimatedCost ?? 0);
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
				 * Cross-chain Base legs use either the SCW or the Limitless maker as `fromAddress`
				 * (`buildPrefundSteps` splits amounts; no partner withdraw).
				 *
				 * The post-sweep Li.FI need uses exact sweep micros vs `bridgeShortfallUsd`. SCW balance
				 * is re-read on-chain (bigint) before planning, again before sweep-only send, and again
				 * before building LI.FI steps so `lifiNeedUsd` cannot drift from stale float snapshots.
				 * When both sweep and Li.FI run, they execute in **parallel**; we `Promise.all` so the
				 * trade only proceeds after the Base receipt is success **and** Li.FI status is terminal
				 * (bridge usually dominates).
				 */
				let scwToMakerSweepTxHash: string | undefined;
				let plannedSweepMicros = 0n;
				let sweepAmountHuman = 0;
				let lifiNeedUsd = bridgeShortfallUsd;
				let scwUsdcLiveBalanceMicrosLog: string | null = null;
				const baseSwTrim = fundingAddresses.baseSmartWallet?.trim();
				const makerSwTrim = fundingAddresses.limitlessMakerBase?.trim();
				if (
					limitlessBaseDest &&
					bridgeShortfallUsd > PREFUND_SHORTFALL_COVERED_EPS_USD &&
					baseSwTrim &&
					makerSwTrim
				) {
					const b1 = await readBaseScwUsdcBalanceRaw(baseSwTrim);
					let sweepPlan = planLimitlessScwSweepMicros(
						bridgeShortfallUsd,
						b1,
						MIN_PREFUND_CHUNK_USD,
					);
					const b2 = await readBaseScwUsdcBalanceRaw(baseSwTrim);
					sweepPlan = recappedSweepForSend(
						sweepPlan.plannedSweepMicros,
						b2,
						bridgeShortfallUsd,
						MIN_PREFUND_CHUNK_USD,
					);
					plannedSweepMicros = sweepPlan.plannedSweepMicros;
					sweepAmountHuman = sweepPlan.sweepAmountHuman;
					lifiNeedUsd = sweepPlan.lifiNeedUsd;
					scwUsdcLiveBalanceMicrosLog = b2.toString();
				}

				const prefundLogBase = {
					venue: leg.venue,
					executionAmountUsd: Number(leg.executionAmountUsd.toFixed(4)),
					feeUsd: Number((leg.fee ?? 0).toFixed(4)),
					prefundTargetUsdApprox: Number(needHuman.toFixed(4)),
					venueSpendAppliedUsdApprox: Number(venueAppliedUsd.toFixed(4)),
					bridgeShortfallUsdApprox: Number(bridgeShortfallUsd.toFixed(4)),
					lifiShortfallAfterScwSweepUsdApprox:
						plannedSweepMicros > 0n ? Number(lifiNeedUsd.toFixed(6)) : null,
					scwSweepUsdcApprox: plannedSweepMicros > 0n ? sweepAmountHuman : null,
					bridgeAmountUsd: opts?.amountUsdOverride ?? bridge.amount,
					prefundAnchorUsdApprox: Number(prefundAnchorUsd.toFixed(4)),
					corridorBudgetUsdApprox: Number(corridorBudgetUsd.toFixed(4)),
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
					scwUsdcLiveBalanceMicrosFromRpc: scwUsdcLiveBalanceMicrosLog,
				};
				console.debug("[SOR][prefund] on-chain stable snapshot (RPC)", prefundLogBase);

				if (bridgeShortfallUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD) {
					console.debug("[SOR][prefund] no LI.FI pull — venue balance covers prefund target", {
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
					console.debug("[SOR][prefund] same-chain Base USDC (SCW → Limitless maker)", {
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
					await withTimeout(
						waitForBaseTransactionSuccess(
							hash,
							"USDC transfer smart wallet → Limitless maker",
						),
						SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
						"Base USDC transfer receipt (SCW → Limitless maker)",
					);
					return hash;
				};

				if (
					plannedSweepMicros > 0n &&
					lifiNeedUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD &&
					baseSwTrim &&
					makerSwTrim
				) {
					const b3 = await readBaseScwUsdcBalanceRaw(baseSwTrim);
					const fin3 = recappedSweepForSend(
						plannedSweepMicros,
						b3,
						bridgeShortfallUsd,
						MIN_PREFUND_CHUNK_USD,
					);
					plannedSweepMicros = fin3.plannedSweepMicros;
					sweepAmountHuman = fin3.sweepAmountHuman;
					lifiNeedUsd = fin3.lifiNeedUsd;
					if (
						plannedSweepMicros > 0n &&
						lifiNeedUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD
					) {
						try {
							scwToMakerSweepTxHash = await sendScwToLimitlessMakerSweep();
						} catch (sweepErr: unknown) {
							if (isLimitlessSweepInsufficientBalanceError(sweepErr)) {
								return {
									success: false,
									error:
										"Your Base smart wallet does not have enough native USDC to move to your Limitless trading wallet. Refresh the quote and try again, or add USDC to your Base smart wallet before trading.",
								};
							}
							throw sweepErr;
						}
						console.debug(
							"[SOR][prefund] no LI.FI pull after deterministic SCW sweep — prefund target covered",
							{
								...prefundLogBase,
								scwToMakerSweepTxHash,
							},
						);
						return { success: true, bridgeTxHash: scwToMakerSweepTxHash };
					}
				}

				if (
					limitlessBaseDest &&
					bridgeShortfallUsd > PREFUND_SHORTFALL_COVERED_EPS_USD &&
					baseSwTrim &&
					makerSwTrim
				) {
					const bPre = await readBaseScwUsdcBalanceRaw(baseSwTrim);
					const finPre = recappedSweepForSend(
						plannedSweepMicros,
						bPre,
						bridgeShortfallUsd,
						MIN_PREFUND_CHUNK_USD,
					);
					plannedSweepMicros = finPre.plannedSweepMicros;
					sweepAmountHuman = finPre.sweepAmountHuman;
					lifiNeedUsd = finPre.lifiNeedUsd;
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
					console.debug("[SOR][prefund] plan rejected — compare to UI pooled cash", {
						...prefundLogBase,
						reason: planErr instanceof Error ? planErr.message : String(planErr),
					});
					return {
						success: false,
						error: planErr instanceof Error ? planErr.message : String(planErr),
					};
				}

				let lastSourceTxHash: string | undefined;

				/**
				 * Pro-rate corridor budget across prefund steps proportional to each step's
				 * destination-USD share. Each step's `ensurePrefundQuoteMeetsDestMin` cap is
				 * `min(walletBalance, perStepBudget + carry)` where `carry` is unspent
				 * headroom from prior steps. This guarantees Σ sendHuman ≤ corridorBudgetUsd
				 * AND each step has enough headroom (proportional to its dest demand) to
				 * absorb LI.FI under-delivery. A single global "remaining" cap fails because
				 * step 1's iteration can over-consume the budget that step 2 needs.
				 */
				const sumStepsHuman = steps.reduce(
					(s, st) => s + Math.max(0, Number(st.amountHuman)),
					0,
				);
				const stepBudgetShares = steps.map((st) => {
					const portion = Math.max(0, Number(st.amountHuman));
					if (sumStepsHuman <= 1e-9) return 0;
					return (portion / sumStepsHuman) * corridorBudgetUsd;
				});
				let corridorBudgetCarryUsd = 0;

				const runPrefundLifiSteps = async (): Promise<void> => {
					const reportPrefund = opts?.onPrefundProgress;
					for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
						const step = steps[stepIdx]!;
						reportPrefund?.({
							current: stepIdx + 1,
							total: steps.length,
						});
						const fromChainLifi = CHAIN_LIFI_IDS[step.fromChain];
						const fromAddress = prefundSourceAddressForStep(step, fundingAddresses);
						if (!fromAddress) {
							throw new Error(`No wallet address for source chain ${step.fromChain}`);
						}

						const maxFromHuman =
							step.fromChain === "base"
								? step.baseSpendWallet === "limitlessMaker"
									? Math.max(0, balancesHuman.limitlessMakerBase ?? 0)
									: Math.max(0, balancesHuman.base ?? 0)
								: Math.max(0, balancesHuman[step.fromChain] ?? 0);
						const destPortionUsd = Math.max(0, Number(step.amountHuman));
						const perStepShare = Math.max(0, stepBudgetShares[stepIdx] ?? 0);
						const stepBudgetUsd = perStepShare + corridorBudgetCarryUsd;
						if (stepBudgetUsd <= 1e-9) {
							throw new Error(
								`Prefund step budget is zero (step ${stepIdx + 1}/${steps.length}, corridorBudgetUsd=${corridorBudgetUsd.toFixed(4)}). Optimizer corridor allocation cannot cover this hop — refresh the route.`,
							);
						}
						const maxFromWei =
							fromChainLifi === 56
								? await readBnbUsdtBalanceWei(fundingAddresses.embeddedEoa)
								: undefined;
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
								budgetUsd: stepBudgetUsd,
								seedAmountHuman: step.amountHuman,
								strictDestMinAtSendCap:
									opts?.strictLifiDestMinAtSendCap === true,
								maxFromWei,
							});
							quote = solved.quote;
							spentHumanForLedger = Number(solved.amountHuman);
							// Carry forward unspent share so later steps benefit from earlier under-spend.
							corridorBudgetCarryUsd = Math.max(
								0,
								stepBudgetUsd - spentHumanForLedger,
							);
							console.debug("[SOR][prefund] LI.FI quote solved", {
								venue: leg.venue,
								corridor: `${step.fromChain}->${bridge.toChain}`,
								step: `${stepIdx + 1}/${steps.length}`,
								destPortionUsd: Number(destPortionUsd.toFixed(6)),
								corridorBudgetUsd: Number(corridorBudgetUsd.toFixed(6)),
								perStepShareUsd: Number(perStepShare.toFixed(6)),
								stepBudgetUsd: Number(stepBudgetUsd.toFixed(6)),
								corridorBudgetCarryUsd: Number(
									corridorBudgetCarryUsd.toFixed(6),
								),
								maxFromHuman: Number(maxFromHuman.toFixed(6)),
								sendHuman: Number(spentHumanForLedger.toFixed(6)),
							});
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
							console.debug("[SOR] Bridge LIFI quote", {
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
						const polygonRelay = await preparePolygonRelay(needsRelay);

						const routeIncludesSolana =
							fromChainLifi === SOLANA_LIFI_CHAIN_ID ||
							toChainLifi === SOLANA_LIFI_CHAIN_ID;

						const builtLifiOpts = buildExecuteLifiStepsOptions(quote, {
							routeIncludesSolana,
							polygonRelay,
						});
						const lifiStepOptions = {
							...mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(
								builtLifiOpts,
								fromChainLifi,
								quote.fromAddress,
							),
							...(solanaSigner != null ? { solanaSigner } : {}),
						};

						const getSignerForChainPrefund = async (chainId: number) => {
							if (
								sorBasePrefundLifiShouldUseEmbeddedSigner({
									chainId,
									quoteFromAddressRaw: quote.fromAddress,
									embeddedEoaRaw: fundingAddresses.embeddedEoa,
								})
							) {
								return createPrivyEmbeddedSendTransactionCapable(
									fundingAddresses.embeddedEoa as `0x${string}`,
									base,
									privyEvmSendTransaction,
								);
							}
							return getSignerForChain(chainId);
						};

						console.debug("[SOR][prefund] executing LI.FI on-chain steps (wallet may prompt)…", {
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
									getSignerForChainPrefund,
									lifiStepOptions,
								),
								SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
								"SOR LI.FI on-chain steps (approvals / bridge tx)",
							);
							txHashes = lifiOnchain.txHashes;
						} finally {
							reportSorExecutionPhase("moving_funds");
						}

						console.debug("[SOR][prefund] on-chain steps submitted; polling bridge status…", {
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
							SOR_LIFI_PREFUND_POLL_CONFIG,
						);

						if (Number.isFinite(spentHumanForLedger) && spentHumanForLedger > 0) {
							if (step.fromChain === "base" && step.baseSpendWallet === "limitlessMaker") {
								const cur = balancesHuman.limitlessMakerBase ?? 0;
								balancesHuman.limitlessMakerBase = Math.max(
									0,
									cur - spentHumanForLedger,
								);
							} else {
								const cur = balancesHuman[step.fromChain] ?? 0;
								balancesHuman[step.fromChain] = Math.max(0, cur - spentHumanForLedger);
							}
						}

						lastSourceTxHash = sourceTxHash;
					}
				};

				if (plannedSweepMicros > 0n) {
					console.debug(
						"[SOR][prefund] parallel settle: Base SCW → maker receipt + LI.FI terminal",
						{
							venue: leg.venue,
							scwSweepUsdcApprox: sweepAmountHuman,
							lifiSteps: steps.length,
						},
					);
					let sweepHash: string;
					try {
						[sweepHash] = await Promise.all([
							sendScwToLimitlessMakerSweep(),
							runPrefundLifiSteps(),
						]);
					} catch (parallelErr: unknown) {
						if (isLimitlessSweepInsufficientBalanceError(parallelErr)) {
							return {
								success: false,
								error:
									"Your Base smart wallet does not have enough native USDC to move to your Limitless trading wallet while the cross-chain prefund ran. Refresh the quote and try again, or add USDC to your Base smart wallet before trading.",
							};
						}
						throw parallelErr;
					}
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
			getSignerForChain,
			preparePolygonRelay,
			buildExecuteLifiStepsOptions,
			privyEvmSendTransaction,
		],
	);

	return useMemo(() => ({ executeLeg, executeBridge }), [executeLeg, executeBridge]);
}
