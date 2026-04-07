import { useCallback, useMemo, useRef } from "react";
import { useWallets } from "@privy-io/react-auth";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { bsc } from "viem/chains";
import { Side } from "@polymarket/clob-client";
import type { TickSize } from "@polymarket/clob-client";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { TradeExecutionParams } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import type { RouteLeg, SorVenue } from "./sor-types";
import { CHAIN_LIFI_IDS } from "./sor-types";
import type { SolanaSignerCapable, SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { isPrivyEmbeddedWallet } from "@/trading/polymarket/privyEmbeddedWallet";
import { PRIVY_SPONSOR_BSC_GAS } from "@/config/privyBscGas";
import { SOLANA_RPC_URL } from "@/config/rpc";
import { SOLANA_USDC_MINT } from "@/config/addresses";

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
	};
	predictSession: {
		ready: boolean;
		placeMarketOrder: (args: {
			marketId: number;
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			amount: string;
			book?: unknown;
		}) => Promise<{ orderHash?: string }>;
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
			statusBridge?: string;
			tool?: string;
		}>;
		getFundingLifiStatus: (params: {
			txHash: string;
			tool?: string;
		}) => Promise<unknown>;
	};
	privySolanaSign: (opts: {
		transaction: VersionedTransaction;
		connection: Connection;
	}) => Promise<VersionedTransaction>;

	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null;
	predictNumericId: number | null;
	predictMarketDetail: PredictMarketDetail | null;
	account: string | undefined;

	getClientForChain: (opts: { id: number }) => Promise<{
		sendTransaction: SendTransactionCapable["sendTransaction"];
	} | null>;
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

export function useSorLegExecutor(deps: UseSorLegExecutorDeps) {
	const {
		tradeExecutionService,
		polyClob,
		predictSession,
		privateApi,
		privySolanaSign,
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
	} = deps;

	const { wallets } = useWallets();
	const embeddedRef = useRef<{
		getEthereumProvider?: () => Promise<unknown>;
	} | null>(null);
	embeddedRef.current =
		(wallets || []).find((w) => isPrivyEmbeddedWallet(w as never)) ?? null;

	// ──────────────────────────────────────────────
	// executeLeg: dispatches to the correct venue
	// ──────────────────────────────────────────────

	const executeLeg = useCallback(
		async (leg: RouteLeg, side: "buy" | "sell" = "buy"): Promise<LegResult> => {
			const venue: SorVenue = leg.venue;

			switch (venue) {
				// ─── LevelUp (Base, USDC) ─────────────────
				case "levelup": {
					if (!account) {
						return { filled: false, filledShares: 0, error: "No wallet connected" };
					}
					const questionId = leg.venueMarketIds.levelUpQuestionId;
					if (!questionId) {
						return { filled: false, filledShares: 0, error: "Missing LevelUp question ID" };
					}

					const position: "yes" | "no" = leg.outcome === "A" ? "yes" : "no";
					const shares = Math.round(leg.shares);
					const signingPrice = side === "buy"
						? Math.round(Math.min(leg.avgPrice * 1.15, 0.99) * 100) / 100
						: Math.round(Math.max(leg.avgPrice * 0.85, 0.01) * 100) / 100;

					const params: TradeExecutionParams = {
						marketId: questionId,
						position,
						amount: shares,
						price: signingPrice,
						orderType: "market",
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

					await polyClob.placeMarketOrder({
						tokenId,
						amount: side === "buy" ? leg.executionAmountUsd : leg.shares,
						side: side === "buy" ? Side.BUY : Side.SELL,
						tickStyle,
						negRisk,
					});

					return { filled: true, filledShares: leg.shares };
				}

				// ─── DFlow / Kalshi (Solana, USDC) ────────
				case "dflow": {
					if (!dflowProofVerified) {
						return { filled: false, filledShares: 0, error: "DFlow KYC not verified. Complete verification on the Profile page." };
					}
					const outcomeMint =
						leg.outcome === "A"
							? leg.venueMarketIds.dflowYesMintA
							: leg.venueMarketIds.dflowYesMintB;
					if (!outcomeMint) {
						return { filled: false, filledShares: 0, error: "Missing DFlow outcome mint" };
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
						return { filled: false, filledShares: 0, error: orderResult.msg ?? orderResult.code ?? "DFlow order failed" };
					}
					if (!orderResult.transaction) {
						throw new Error("DFlow returned no transaction to sign");
					}

					const txBytes = Buffer.from(orderResult.transaction, "base64");
					const transaction = VersionedTransaction.deserialize(txBytes);
					const connection = new Connection(SOLANA_RPC_URL, "confirmed");

					const signedTx = (await privySolanaSign({
						transaction,
						connection,
					})) as VersionedTransaction;

					const sig = await connection.sendRawTransaction(signedTx.serialize(), {
						skipPreflight: true,
						maxRetries: 3,
					});

					return { filled: true, filledShares: leg.shares, txHash: sig };
				}

				// ─── Predict.fun (BNB, USDT) ─────────────
				case "predictfun": {
					if (!predictSession.ready) {
						return { filled: false, filledShares: 0, error: "Predict.fun session not ready. Authenticate on the Predict.fun tab first." };
					}
					if (!predictApprovalsOk) {
						return { filled: false, filledShares: 0, error: "Predict.fun contracts not approved. Approve on the Predict.fun tab first." };
					}

					if (!predictTokenId) {
						return { filled: false, filledShares: 0, error: "Missing Predict.fun outcome token ID" };
					}
					const tokenId = predictTokenId;

					if (predictNumericId == null || !predictMarketDetail) {
						return { filled: false, filledShares: 0, error: "Predict.fun market data not loaded" };
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
			privySolanaSign,
			predictSession,
			predictApprovalsOk,
			predictNumericId,
			predictMarketDetail,
			predictTokenId,
		],
	);

	// ──────────────────────────────────────────────
	// executeBridge: LI.FI cross-chain transfer
	// ──────────────────────────────────────────────

	const executeBridge = useCallback(
		async (leg: RouteLeg): Promise<BridgeResult> => {
			const bridge = leg.bridge;
			if (!bridge) {
				return { success: false, error: "No bridge data on leg" };
			}

			const fromChainLifi = CHAIN_LIFI_IDS[bridge.fromChain];
			const toChainLifi = CHAIN_LIFI_IDS[bridge.toChain];
			const fromAddress = addressForChain(bridge.fromChain, fundingAddresses);
			const toAddress = addressForChain(bridge.toChain, fundingAddresses);

			if (!fromAddress) {
				return { success: false, error: `No wallet address for source chain ${bridge.fromChain}` };
			}

			try {
				const quote = await privateApi.postFundingLifiQuote({
					fromChain: fromChainLifi,
					toChain: toChainLifi,
					amountHuman: bridge.amount.toFixed(6),
					fromAddress,
					toAddress,
					slippage: 0.005,
				});

				if (!quote.steps?.length) {
					return { success: false, error: "LI.FI returned no bridge steps" };
				}

				const BNB_CHAIN_ID = bsc.id;
				const POLYGON_CHAIN_ID = 137;

				const needsRelay = fromChainLifi === POLYGON_CHAIN_ID;
				let relayClient: RelayClient | null = null;
				if (needsRelay) {
					relayClient = await getRelayClient();
				}

				const allowanceOwnerByChainId: Partial<Record<number, string>> = {};
				if (fundingAddresses.baseSmartWallet) allowanceOwnerByChainId[8453] = fundingAddresses.baseSmartWallet;
				if (fundingAddresses.polymarketSafe) allowanceOwnerByChainId[POLYGON_CHAIN_ID] = fundingAddresses.polymarketSafe;
				if (fundingAddresses.embeddedEoa) allowanceOwnerByChainId[BNB_CHAIN_ID] = fundingAddresses.embeddedEoa;

				const bridgeGetSigner = async (chainId: number): Promise<SendTransactionCapable | null> => {
					if (chainId === BNB_CHAIN_ID) {
						const embedded = embeddedRef.current;
						const addr = fundingAddresses.embeddedEoa as `0x${string}` | undefined;
						if (!embedded?.getEthereumProvider || !addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
							return null;
						}
						const provider = await embedded.getEthereumProvider();
						return createPrivyEmbeddedSendTransactionCapable(provider, addr, bsc, {
							sponsorGas: PRIVY_SPONSOR_BSC_GAS,
						});
					}
					const client = await getClientForChain({ id: chainId });
					if (!client) return null;
					return {
						sendTransaction: (args: Parameters<SendTransactionCapable["sendTransaction"]>[0]) =>
							client.sendTransaction(args),
					};
				};

				const { txHashes } = await executeLifiSteps(
					quote.steps as Parameters<typeof executeLifiSteps>[0],
					bridgeGetSigner,
					{
						allowanceOwnerByChainId,
						polygonRelay: needsRelay && relayClient ? { client: relayClient } : undefined,
						solanaSigner: solanaSigner ?? undefined,
					},
				);

				const evmHashes = txHashes.filter((h) => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h));
				const sourceTxHash = evmHashes.length > 0
					? evmHashes[evmHashes.length - 1]
					: txHashes[txHashes.length - 1] ?? txHashes[0] ?? "";
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
							tool: statusTool,
						}) as ReturnType<Parameters<typeof pollLifiUntilTerminal>[0]>,
					{ maxAttempts: 60, intervalMs: 12_000 },
				);

				return { success: true, bridgeTxHash: sourceTxHash };
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
