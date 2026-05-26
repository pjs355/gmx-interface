import { useCallback, useRef, useState } from "react";
import { usePrivy, useWallets, useSendTransaction } from "@privy-io/react-auth";
import { parseUnits, type Signer } from "ethers";
import type { Book, TransactionResult } from "@predictdotfun/sdk";
import { ChainId, OrderBuilder, Side } from "@predictdotfun/sdk";
import type { PrivateApiClient } from "@/services/privateApi";
import { ensurePredictChain, getBscBrowserSigner } from "../wallet/bnbWallet";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { predictKernelAddressFromVacm } from "@/context/accountWallets";
import { findEvmPrivyEmbeddedWallet } from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import {
	buildPredictCreateOrderPayload,
	isPredictUnauthorizedError,
} from "../trade/predictOrderSubmit";
import type { PredictMarketDetail } from "../portfolio/predictMarketApi";
import { enrichPredictGasOrFundsErrorMessage } from "../trade/predictGasGuidance";
import { complementPredictOrderbook } from "../book/predictSingleMarketBook";

type SessionRefs = {
	builder: OrderBuilder;
	signer: Signer;
};

async function authenticatePredict(
	api: Pick<PrivateApiClient, "getPredictAuthMessage" | "completePredictAuth">,
	builder: OrderBuilder,
	ethSigner: Signer,
	predictAccount: string | undefined,
): Promise<void> {
	const { message } = await api.getPredictAuthMessage();
	if (!message) throw new Error("Predict auth: no message");

	const eoaAddr = await ethSigner.getAddress();
	let signature: string;
	let signer: string;

	if (predictAccount) {
		signature = await builder.signPredictAccountMessage(message);
		signer = predictAccount;
	} else {
		signature = await ethSigner.signMessage(message);
		signer = eoaAddr;
	}

	await api.completePredictAuth({ signer, message, signature });
}

function priceCentsToShareWei(cents: number): bigint {
	if (!Number.isFinite(cents) || cents <= 0 || cents >= 100) {
		throw new Error("Limit price must be 1–99 cents");
	}
	return (BigInt(Math.round(cents)) * 10n ** 18n) / 100n;
}

async function withSessionRetry<T>(resetSession: () => void, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e: unknown) {
		if (isPredictUnauthorizedError(e)) {
			resetSession();
			return await fn();
		}
		throw e;
	}
}

export function usePredictTradingSession(enabled: boolean) {
	const { authenticated, ready: privyReady } = usePrivy();
	const { wallets } = useWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const privateApi = usePrivateApiClient();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sessionRef = useRef<SessionRefs | null>(null);
	const sessionInFlightRef = useRef<Promise<SessionRefs> | null>(null);

	const venueAddressChainMap = useVenueAddressChainMap();
	const predictEntry = venueAddressChainMap?.predictfun;
	/** Predict maker / deposit (VACM walletAddress). */
	const predictMaker = predictEntry?.walletAddress;
	/** Kernel address for OrderBuilder when maker ≠ Privy signer. */
	const predictKernel = predictKernelAddressFromVacm(predictEntry);

	const chainId = ChainId.BnbMainnet;

	const resetSession = useCallback(() => {
		sessionRef.current = null;
	}, []);

	const ensureSession = useCallback(async (): Promise<SessionRefs> => {
		if (sessionInFlightRef.current) {
			return sessionInFlightRef.current;
		}

		const run = async (): Promise<SessionRefs> => {
			if (!authenticated) throw new Error("Log in to trade on Predict");
			const embedded = findEvmPrivyEmbeddedWallet(wallets) as
				| { getEthereumProvider?: () => Promise<unknown>; address?: string }
				| undefined;
			if (!embedded?.getEthereumProvider || !embedded.address) {
				throw new Error("Embedded wallet required for Predict on BNB");
			}
			const vacmSigner = predictEntry?.signerAddress?.trim();
			if (vacmSigner && embedded.address.trim().toLowerCase() !== vacmSigner.toLowerCase()) {
				throw new Error(
					"Privy embedded wallet does not match venueAddressChainMap.predictfun.signerAddress",
				);
			}
			const address = embedded.address as `0x${string}`;
			const ethereum = (await embedded.getEthereumProvider()) as never;
			await ensurePredictChain(ethereum);
			const ethSigner = await getBscBrowserSigner({
				ethereum,
				address,
				sendTransaction: privyEvmSendTransaction,
			});

			if (sessionRef.current) {
				const prev = await sessionRef.current.signer.getAddress();
				const next = await ethSigner.getAddress();
				if (prev === next) return sessionRef.current;
			}

			const builder = await OrderBuilder.make(chainId, ethSigner as any, {
				...(predictKernel ? { predictAccount: predictKernel } : {}),
			});

			await authenticatePredict(privateApi, builder, ethSigner, predictKernel);
			const refs: SessionRefs = { builder, signer: ethSigner };
			sessionRef.current = refs;
			return refs;
		};

		const p = run().finally(() => {
			if (sessionInFlightRef.current === p) {
				sessionInFlightRef.current = null;
			}
		});
		sessionInFlightRef.current = p;
		return p;
	}, [
		authenticated,
		wallets,
		chainId,
		predictKernel,
		predictEntry?.signerAddress,
		privateApi,
		privyEvmSendTransaction,
	]);

	/**
	 * Approve **only** the contracts needed for the user's current market type.
	 *
	 * Predict's SDK ships a `builder.setApprovals()` helper that fires the full
	 * cross-product of `{regular, neg-risk} × {regular, yield-bearing} ×
	 * {CTF→Exchange, CTF→NegRiskAdapter, USDT→Exchange}` — **10 sponsored
	 * `eth_sendTransaction` calls per cold setup**. Every sponsored send through
	 * Privy's TEE wallet RPC dispatches 2-3 internal calls
	 * (`recoverEmbeddedWallet`, `signWithUserSigner`, sponsorship validation) plus
	 * `eth_estimateGas` + receipt polling, so 10 user-visible approvals burn
	 * 40+ requests against a single wallet's `/api/v1/wallets/:id/rpc` bucket
	 * inside ~15s. That trips Privy's per-wallet rate limit and the 4-step
	 * backoff inside `privyBscProvider.sendWithBackoffForBscPrivy` then makes it
	 * worse — every retry burns more bucket while the previous tx is still queued.
	 *
	 * For LevelUp, `isNegRisk` and `isYieldBearing` are *always* `false` (we only
	 * ingest binary YES/NO sports markets — never the multi-outcome election or
	 * sUSDe-collateralized markets that those flags exist for). So 8 of the 10
	 * approvals target contracts our markets never touch, e.g. tx #7 in the
	 * SDK's list approves `YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS`
	 * (`0xF64b…A07F`) — visible as the 429 spam in the activation logs.
	 *
	 * This function fires only what's actually needed for the supplied
	 * `(isNegRisk, isYieldBearing)` pair. The SDK still skips any approval that
	 * already passes its on-chain `isApprovedForAll` / `allowance` check, so
	 * subsequent runs for an already-approved user are still 0 sends.
	 *
	 *   `(false, false)` — our hot path           → 2 sends (CTF→Exchange, USDT→Exchange)
	 *   `(true,  false)` — neg-risk markets       → 3 sends (+ CTF→NegRiskAdapter)
	 *   `(false, true )` — yield-bearing markets  → 2 sends on yield-bearing variants
	 *   `(true,  true )` — neg-risk + yield       → 3 sends on yield+neg-risk variants
	 */
	const setApprovals = useCallback(
		async (
			scope: { isNegRisk: boolean; isYieldBearing: boolean } = {
				isNegRisk: false,
				isYieldBearing: false,
			},
		) => {
			setLoading(true);
			setError(null);
			try {
				const { builder } = await ensureSession();
				const { isNegRisk, isYieldBearing } = scope;
				const steps: Array<{
					label: string;
					run: () => Promise<TransactionResult>;
				}> = [
					{
						label: "ctfExchangeApproval",
						run: () => builder.setCtfExchangeApproval(isNegRisk, isYieldBearing),
					},
					{
						label: "ctfExchangeAllowance",
						run: () => builder.setCtfExchangeAllowance(isNegRisk, isYieldBearing),
					},
				];
				if (isNegRisk) {
					// Only neg-risk markets route through the adapter; non-neg-risk
					// trades never call `mergePositions` / `redeemPositions` on the
					// adapter contract, so this approval is dead weight for binary
					// sports markets. Inserted before the USDT allowance to mirror
					// the SDK's ordering inside `setApprovals()`.
					steps.splice(1, 0, {
						label: "negRiskAdapterApproval",
						run: () => builder.setNegRiskAdapterApproval(isYieldBearing),
					});
				}

				const results: TransactionResult[] = [];
				for (const step of steps) {
					results.push(await step.run());
				}

				const failed = results.filter((r) => !r.success);
				if (failed.length > 0) {
					const detail = failed
						.map((t) => {
							const c = "cause" in t ? t.cause : undefined;
							return c instanceof Error ? c.message : c ? String(c) : null;
						})
						.filter((s): s is string => Boolean(s && s.trim()))
						.join("; ");
					throw new Error(
						detail ? `Predict approvals failed: ${detail}` : "Predict approvals failed",
					);
				}
			} catch (e: unknown) {
				const base = e instanceof Error ? e.message : String(e);
				const msg = enrichPredictGasOrFundsErrorMessage(base);
				setError(msg);
				throw e instanceof Error ? e : new Error(msg);
			} finally {
				setLoading(false);
			}
		},
		[ensureSession],
	);

	const placeLimitOrder = useCallback(
		async (args: {
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			priceCents: number;
			sizeShares: string;
		}) => {
			const attempt = async () => {
				const { builder } = await ensureSession();
				const { market, tokenId, side, priceCents, sizeShares } = args;
				if (market.tradingStatus !== "OPEN") {
					throw new Error("Market is not open for trading");
				}
				if (!predictMaker?.trim()) {
					throw new Error(
						"Predict maker missing — venueAddressChainMap.predictfun.walletAddress is required",
					);
				}
				const maker = predictMaker.trim();
				const sideE = side === "buy" ? Side.BUY : Side.SELL;
				const quantityWei = parseUnits(sizeShares.trim(), 18);
				const pricePerShareWei = priceCentsToShareWei(priceCents);
				const amounts = builder.getLimitOrderAmounts({
					side: sideE,
					pricePerShareWei,
					quantityWei,
				});
				const order = builder.buildOrder("LIMIT", {
					maker,
					signer: maker,
					side: sideE,
					tokenId,
					makerAmount: amounts.makerAmount,
					takerAmount: amounts.takerAmount,
					nonce: 0n,
					feeRateBps: market.feeRateBps,
				});
				const typed = builder.buildTypedData(order, {
					isNegRisk: market.isNegRisk,
					isYieldBearing: market.isYieldBearing,
				});
				const signed = await builder.signTypedDataOrder(typed);
				const hash = builder.buildTypedDataHash(typed);
				const payload = buildPredictCreateOrderPayload(
					signed,
					hash,
					amounts.pricePerShare,
					"LIMIT",
				);
				return privateApi.postPredictOrder(payload);
			};
			return withSessionRetry(resetSession, attempt);
		},
		[ensureSession, predictMaker, privateApi, resetSession],
	);

	const placeMarketOrder = useCallback(
		async (args: {
			marketId: number;
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			amount: string;
			/** When set, skips a duplicate orderbook GET (e.g. reuse React Query cache). */
			book?: Book | null;
			/** Single-market NO (or non-native A/B): mirror YES-native REST book before sizing. */
			complementOrderbook?: boolean;
		}) => {
			const attempt = async () => {
				const { builder } = await ensureSession();
				const {
					marketId,
					market,
					tokenId,
					side,
					amount,
					book: bookArg,
					complementOrderbook,
				} = args;
				if (market.tradingStatus !== "OPEN") {
					throw new Error("Market is not open for trading");
				}
				if (!predictMaker?.trim()) {
					throw new Error(
						"Predict maker missing — venueAddressChainMap.predictfun.walletAddress is required",
					);
				}
				const maker = predictMaker.trim();
				let book =
					bookArg && (bookArg.asks?.length || bookArg.bids?.length)
						? bookArg
						: await privateApi.getPredictOrderbook(marketId);
				if (complementOrderbook) {
					book = complementPredictOrderbook(book);
				}
				const sideE = side === "buy" ? Side.BUY : Side.SELL;
				const amounts =
					side === "buy"
						? builder.getMarketOrderAmounts(
								{ side: Side.BUY, valueWei: parseUnits(amount.trim(), 18) },
								book,
							)
						: builder.getMarketOrderAmounts(
								{
									side: Side.SELL,
									quantityWei: parseUnits(amount.trim(), 18),
								},
								book,
							);
				const order = builder.buildOrder("MARKET", {
					maker,
					signer: maker,
					side: sideE,
					tokenId,
					makerAmount: amounts.makerAmount,
					takerAmount: amounts.takerAmount,
					nonce: 0n,
					feeRateBps: market.feeRateBps,
				});
				const typed = builder.buildTypedData(order, {
					isNegRisk: market.isNegRisk,
					isYieldBearing: market.isYieldBearing,
				});
				const signed = await builder.signTypedDataOrder(typed);
				const hash = builder.buildTypedDataHash(typed);
				const payload = buildPredictCreateOrderPayload(
					signed,
					hash,
					amounts.pricePerShare,
					"MARKET",
					{ slippageBps: 150n },
				);
				return privateApi.postPredictOrder(payload);
			};
			return withSessionRetry(resetSession, attempt);
		},
		[ensureSession, predictMaker, privateApi, resetSession],
	);

	const canInit = Boolean(privyReady && authenticated && enabled);

	return {
		ready: canInit,
		loading,
		error,
		blockedReason: null,
		/** Predict maker / deposit from VACM (`predictfun.walletAddress`). */
		predictAccount: predictMaker,
		resetSession,
		ensureSession,
		setApprovals,
		placeLimitOrder,
		placeMarketOrder,
	};
}
