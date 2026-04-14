import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useWallets } from "@privy-io/react-auth";
import { useSendTransaction as useSolanaSendTransaction } from "@privy-io/react-auth/solana";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { getAddress, isAddress } from "viem";
import { bsc } from "viem/chains";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { isPrivyEmbeddedWallet } from "@/trading/polymarket/privyEmbeddedWallet";
import { useUserData } from "@/context/UserDataContext";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { executeDirectErc20Withdraw } from "@/trading/lifi/executeDirectEvmWithdraw";
import { executeDirectSolanaSplWithdraw } from "@/trading/lifi/executeDirectSolanaSplWithdraw";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import {
	BRIDGE_FUNDING_BALANCES_QUERY_KEY,
} from "@/trading/hooks/useBridgeFundingBalances";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { checkPolymarketApprovals } from "@/trading/polymarket/approvalTxs";
import {
	deployPolymarketSafeIfNeeded,
	executePolymarketApprovalBatch,
} from "@/trading/polymarket/safeActions";
import { PRIVY_SPONSOR_BSC_GAS } from "@/config/privyBscGas";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { SOLANA_RPC_URL } from "@/config/rpc";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import type {
	LifiQuoteResponse,
	LifiWithdrawDirectTransferData,
	LifiWithdrawLifiData,
	LifiWithdrawPlanData,
	LifiWithdrawPlanLeg,
} from "@/types/trading";

/** User-signed tx + explorer chain (source chain for LI.FI legs). */
export type WithdrawPlanTxEntry = {
	txHash: string;
	explorerChainId: number;
};

export type WithdrawPlanExecuteResult = {
	entries: WithdrawPlanTxEntry[];
};

const BASE = 8453;
const POLYGON = 137;
const BNB = bsc.id;
const SOLANA_LIFI_CHAIN_ID = 1151111081099710;

function pickLifiStatusTool(quote: LifiQuoteResponse): string | undefined {
	const sb = quote.statusBridge;
	if (typeof sb === "string") {
		const t = sb.trim();
		if (t) return t;
	}
	return undefined;
}

function pickTxHashForLifiStatusPoll(
	txHashes: string[],
	quote: LifiQuoteResponse,
	fromChain: number
): string {
	const hashes = txHashes.filter(
		(h) => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/i.test(h)
	);
	if (hashes.length === 0) {
		return txHashes[0] ?? "";
	}
	if (hashes.length === 1) return hashes[0];

	const steps = quote.steps ?? [];
	const first = steps[0];
	const firstTr = first?.transactionRequest;
	const firstChain = firstTr?.chainId ?? first?.chainId;
	if (first?.requiresApproval && firstChain === fromChain) {
		return hashes[1] ?? hashes[hashes.length - 1];
	}
	return hashes[hashes.length - 1];
}

function lifiWithdrawToQuoteResponse(d: LifiWithdrawLifiData): LifiQuoteResponse {
	return {
		steps: d.steps,
		quote: d.quote,
		tool: d.tool,
		statusBridge: d.statusBridge ?? undefined,
		fromAmount: d.fromAmount,
		fromToken: d.fromToken,
		toToken: d.toToken,
		fromChain: d.fromChain,
		toChain: d.toChain,
		fromAddress: d.fromAddress,
		toAddress: d.toAddress,
	};
}

export function useWithdrawPlanExecution() {
	const queryClient = useQueryClient();
	const funding = useFundingAddresses();
	const { refresh: refreshUserData } = useUserData();
	const api = usePrivateApiClient();
	const { getClientForChain } = useSmartWallets();
	const { wallets } = useWallets();
	const relay = usePolymarketRelay();
	const { sendTransaction: privySolanaSendTx } = useSolanaSendTransaction();
	const embeddedRef = useRef<
		| { getEthereumProvider?: () => Promise<unknown> }
		| null
	>(null);
	embeddedRef.current =
		(wallets || []).find((w) => isPrivyEmbeddedWallet(w as never)) ?? null;

	const solanaSigner = useMemo<SolanaSignerCapable>(
		() => ({
			signAndSendTransaction: async (serializedTx: Uint8Array) => {
				const tx = VersionedTransaction.deserialize(serializedTx);
				const conn = new Connection(SOLANA_RPC_URL);
				return sendPrivySponsoredSolanaTransaction(privySolanaSendTx, tx, conn);
			},
		}),
		[privySolanaSendTx]
	);

	const allowanceOwnerByChainId = useMemo(() => {
		const m: Partial<Record<number, string>> = {};
		if (funding.baseSmartWallet) m[BASE] = funding.baseSmartWallet;
		if (funding.polymarketSafe) m[POLYGON] = funding.polymarketSafe;
		if (funding.embeddedEoa) m[BNB] = funding.embeddedEoa;
		return m;
	}, [funding.baseSmartWallet, funding.polymarketSafe, funding.embeddedEoa]);

	const getSignerForChain = useCallback(
		async (chainId: number) => {
			if (chainId === BNB) {
				const embedded = embeddedRef.current;
				const addr = funding.embeddedEoa as `0x${string}` | undefined;
				if (
					!embedded ||
					typeof embedded.getEthereumProvider !== "function" ||
					!addr ||
					!/^0x[a-fA-F0-9]{40}$/i.test(addr)
				) {
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
				sendTransaction: (args: {
					to: `0x${string}`;
					data?: `0x${string}`;
					value?: bigint;
					chainId?: number;
					sponsor?: boolean;
				}) => client.sendTransaction(args),
			};
		},
		[getClientForChain, funding.embeddedEoa]
	);

	const executePlan = useCallback(
		async (plan: LifiWithdrawPlanData): Promise<WithdrawPlanExecuteResult> => {
			const runSingleLeg = async (
				leg: LifiWithdrawPlanLeg
			): Promise<WithdrawPlanTxEntry> => {
				const abort = new AbortController();

				if (leg.mode === "direct_transfer") {
					const chainId = leg.toChain;
					if (chainId === SOLANA_LIFI_CHAIN_ID) {
						const conn = new Connection(SOLANA_RPC_URL);
						const txHash = await executeDirectSolanaSplWithdraw({
							mintAddress: leg.token.address,
							ownerWalletAddress: leg.selectedSource.walletAddress,
							recipientAddress: leg.toAddress.trim(),
							amountAtomic: BigInt(leg.amountAtomic),
							connection: conn,
							privySolanaSend: privySolanaSendTx,
						});
						await refreshUserData();
						await Promise.all([
							funding.refetchPolymarket(),
							funding.refetchOverview(),
						]);
						await queryClient.invalidateQueries({
							queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
						});
						return { txHash, explorerChainId: SOLANA_LIFI_CHAIN_ID };
					}
					if (!isAddress(leg.toAddress)) {
						throw new Error("Invalid recipient address");
					}
					const recipient = getAddress(leg.toAddress) as `0x${string}`;
					let polygonRelayClient: RelayClient | undefined;
					if (chainId === POLYGON) {
						const client = await relay.getRelayClient();
						if (!client) {
							throw new Error(
								"Polymarket relay is required for withdrawals from your Polygon wallet."
							);
						}
						const eoa = relay.eoaAddress;
						if (!eoa) {
							throw new Error("Embedded wallet address unavailable.");
						}
						await deployPolymarketSafeIfNeeded(client, eoa);
						if (funding.polymarketSafe) {
							const approvalState = await checkPolymarketApprovals(
								funding.polymarketSafe
							);
							if (!approvalState.allApproved) {
								await executePolymarketApprovalBatch(
									client,
									funding.polymarketSafe
								);
							}
						}
						polygonRelayClient = client;
					}

					const txHash = await executeDirectErc20Withdraw({
						chainId,
						tokenAddress: leg.token.address,
						recipient,
						amount: BigInt(leg.amountAtomic),
						getSignerForChain,
						polygonRelayClient,
					});

					await refreshUserData();
					await Promise.all([
						funding.refetchPolymarket(),
						funding.refetchOverview(),
					]);
					await queryClient.invalidateQueries({
						queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
					});
					return { txHash, explorerChainId: chainId };
				}

				const quote = lifiWithdrawToQuoteResponse(leg);
				const fromChain = leg.fromChain;
				const toChain = leg.toChain;
				const routeIncludesSolana =
					fromChain === SOLANA_LIFI_CHAIN_ID ||
					toChain === SOLANA_LIFI_CHAIN_ID;

				const needsPolymarketRelay =
					leg.selectedSource.lifiChainId === POLYGON;

				if (needsPolymarketRelay && !relay.walletReady) {
					throw new Error(
						"This route sends from your Polymarket wallet. Wait for your embedded wallet to load, then try again."
					);
				}

				let polygonRelay: { client: RelayClient } | undefined;
				if (needsPolymarketRelay && funding.polymarketSafe) {
					const client = await relay.getRelayClient();
					if (!client) {
						throw new Error(
							"Polymarket relay requires your embedded Privy wallet."
						);
					}
					const eoa = relay.eoaAddress;
					if (!eoa) {
						throw new Error("Embedded wallet address unavailable.");
					}
					await deployPolymarketSafeIfNeeded(client, eoa);
					const approvalState = await checkPolymarketApprovals(
						funding.polymarketSafe
					);
					if (!approvalState.allApproved) {
						await executePolymarketApprovalBatch(client, funding.polymarketSafe);
					}
					polygonRelay = { client };
				}

				const { txHashes } = await executeLifiSteps(
					quote.steps,
					getSignerForChain,
					{
						allowanceOwnerByChainId,
						...(polygonRelay ? { polygonRelay } : {}),
						...(routeIncludesSolana ? { solanaSigner } : {}),
					}
				);

				const statusTxHash = pickTxHashForLifiStatusPoll(
					txHashes,
					quote,
					fromChain
				);
				if (!statusTxHash) {
					throw new Error("No transaction hash returned from wallet");
				}

				const statusTool = pickLifiStatusTool(quote);
				await pollLifiUntilTerminal(
					() =>
						api.getFundingLifiStatus({
							txHash: statusTxHash,
							...(statusTool != null ? { tool: statusTool } : {}),
							fromChain,
							toChain,
						}),
					{ intervalMs: 15_000, maxAttempts: 40, signal: abort.signal }
				);

				try {
					await funding.verifyOnChain.mutateAsync({});
				} catch {
					/* ignore */
				}
				await refreshUserData();
				await Promise.all([
					funding.refetchPolymarket(),
					funding.refetchOverview(),
				]);
				await queryClient.invalidateQueries({
					queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
				});

				return { txHash: statusTxHash, explorerChainId: fromChain };
			};

			if (plan.mode === "composite") {
				const entries: WithdrawPlanTxEntry[] = [];
				const n = plan.legs.length;
				for (let i = 0; i < n; i++) {
					try {
						entries.push(await runSingleLeg(plan.legs[i]));
					} catch (err) {
						const base = getWithdrawExecutionErrorMessage(err);
						throw new Error(`Step ${i + 1} of ${n} failed: ${base}`);
					}
				}
				return { entries };
			}

			return { entries: [await runSingleLeg(plan)] };
		},
		[
			allowanceOwnerByChainId,
			api,
			funding,
			getSignerForChain,
			privySolanaSendTx,
			queryClient,
			refreshUserData,
			relay,
			solanaSigner,
		]
	);

	return { executePlan, funding };
}

export function getWithdrawExecutionErrorMessage(err: unknown): string {
	return getPrivateApiErrorMessage(err);
}
