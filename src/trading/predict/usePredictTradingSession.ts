import { useCallback, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { parseUnits, type Signer } from "ethers";
import type { Book } from "@predictdotfun/sdk";
import { ChainId, OrderBuilder, Side } from "@predictdotfun/sdk";
import type { PrivateApiClient } from "@/services/privateApi";
import { ensurePredictChain, getBscBrowserSigner } from "./bnbWallet";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import {
	buildPredictCreateOrderPayload,
	isPredictUnauthorizedError,
} from "./predictOrderSubmit";
import type { PredictMarketDetail } from "./predictMarketApi";

type SessionRefs = {
	builder: OrderBuilder;
	signer: Signer;
};

async function authenticatePredict(
	api: Pick<
		PrivateApiClient,
		"getPredictAuthMessage" | "completePredictAuth"
	>,
	builder: OrderBuilder,
	ethSigner: Signer,
	predictAccount: string | undefined
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

async function withSessionRetry<T>(
	resetSession: () => void,
	fn: () => Promise<T>
): Promise<T> {
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
	const privateApi = usePrivateApiClient();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sessionRef = useRef<SessionRefs | null>(null);
	const sessionInFlightRef = useRef<Promise<SessionRefs> | null>(null);

	const predictAccount = useMemo(
		() => import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim() || undefined,
		[]
	);

	const chainId = ChainId.BnbMainnet;

	const resetSession = useCallback(() => {
		sessionRef.current = null;
	}, []);

	const ensureSession = useCallback(async (): Promise<SessionRefs> => {
		if (sessionInFlightRef.current) {
			return sessionInFlightRef.current;
		}

		const run = async (): Promise<SessionRefs> => {
			if (!authenticated) throw new Error("Log in to trade on Predict.fun");
			const embedded = (wallets || []).find(
				(w) =>
					(w as { walletClientType?: string }).walletClientType === "privy" ||
					(w as { connectorType?: string }).connectorType === "privy"
			) as
				| { getEthereumProvider?: () => Promise<unknown> }
				| undefined;
			if (!embedded?.getEthereumProvider) {
				throw new Error("Embedded wallet required for Predict.fun on BNB");
			}
			const ethereum = (await embedded.getEthereumProvider()) as {
				request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
			};
			await ensurePredictChain(ethereum);
			const ethSigner = await getBscBrowserSigner(ethereum);

			if (sessionRef.current) {
				const prev = await sessionRef.current.signer.getAddress();
				const next = await ethSigner.getAddress();
				if (prev === next) return sessionRef.current;
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const builder = await OrderBuilder.make(chainId, ethSigner as any, {
				...(predictAccount ? { predictAccount } : {}),
			});

			await authenticatePredict(privateApi, builder, ethSigner, predictAccount);
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
	}, [authenticated, wallets, chainId, predictAccount, privateApi]);

	const setApprovals = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const { builder } = await ensureSession();
			const result = await builder.setApprovals();
			if (!result.success) {
				throw new Error("Predict.fun approvals failed");
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			setError(msg);
			throw e;
		} finally {
			setLoading(false);
		}
	}, [ensureSession]);

	const placeLimitOrder = useCallback(
		async (args: {
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			priceCents: number;
			sizeShares: string;
		}) => {
			const attempt = async () => {
				const { builder, signer } = await ensureSession();
				const { market, tokenId, side, priceCents, sizeShares } = args;
				if (market.tradingStatus !== "OPEN") {
					throw new Error("Market is not open for trading");
				}
				const maker = predictAccount ?? (await signer.getAddress());
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
					"LIMIT"
				);
				return privateApi.postPredictOrder(payload);
			};
			return withSessionRetry(resetSession, attempt);
		},
		[ensureSession, predictAccount, privateApi, resetSession]
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
		}) => {
			const attempt = async () => {
				const { builder, signer } = await ensureSession();
				const { marketId, market, tokenId, side, amount, book: bookArg } = args;
				if (market.tradingStatus !== "OPEN") {
					throw new Error("Market is not open for trading");
				}
				const maker = predictAccount ?? (await signer.getAddress());
				const book =
					bookArg && (bookArg.asks?.length || bookArg.bids?.length)
						? bookArg
						: await privateApi.getPredictOrderbook(marketId);
				const sideE = side === "buy" ? Side.BUY : Side.SELL;
				const amounts =
					side === "buy"
						? builder.getMarketOrderAmounts(
								{ side: Side.BUY, valueWei: parseUnits(amount.trim(), 18) },
								book
							)
						: builder.getMarketOrderAmounts(
								{
									side: Side.SELL,
									quantityWei: parseUnits(amount.trim(), 18),
								},
								book
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
					{ slippageBps: 150n }
				);
				return privateApi.postPredictOrder(payload);
			};
			return withSessionRetry(resetSession, attempt);
		},
		[ensureSession, predictAccount, privateApi, resetSession]
	);

	const canInit = Boolean(privyReady && authenticated && enabled);

	return {
		ready: canInit,
		loading,
		error,
		blockedReason: null,
		predictAccount,
		resetSession,
		ensureSession,
		setApprovals,
		placeLimitOrder,
		placeMarketOrder,
	};
}
