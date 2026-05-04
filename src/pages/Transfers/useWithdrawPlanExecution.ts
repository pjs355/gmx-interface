import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSendTransaction } from "@privy-io/react-auth";
import {
	useSignAndSendTransaction,
	useSignTransaction as useSolanaSignTransaction,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { getAddress, isAddress } from "viem";
import { bsc } from "viem/chains";
import { useUserData } from "@/context/UserDataContext";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { pickLifiSourceTxHashForStatus } from "@/trading/lifi/pickLifiSourceTxHashForStatus";
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
	deployPolymarketDepositWalletIfNeeded,
	executePolymarketApprovalBatch,
} from "@/trading/polymarket/safeActions";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { createSolanaConnectionForWalletSend } from "@/config/rpc";
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
	_quote: LifiQuoteResponse,
	fromChain: number
): string {
	return pickLifiSourceTxHashForStatus({
		txHashes,
		fromChainLifi: fromChain,
		solanaLifiChainId: SOLANA_LIFI_CHAIN_ID,
	});
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
		polygonSafeUnwrapPrerequisite: d.polygonSafeUnwrapPrerequisite ?? undefined,
	};
}

export function useWithdrawPlanExecution() {
	const queryClient = useQueryClient();
	const funding = useFundingAddresses();
	const { refresh: refreshUserData } = useUserData();
	const api = usePrivateApiClient();
	const { getClientForChain } = useSmartWallets();
	const relay = usePolymarketRelay();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const { signAndSendTransaction: privySolanaSignAndSend } = useSignAndSendTransaction();
	const { signTransaction: privySolanaSignTransaction } = useSolanaSignTransaction();
	const { wallets: solanaWallets } = useSolanaWallets();
	const embeddedSolanaWallet = useMemo(
		() => solanaWallets.find((w) => w.address === funding.solanaAddress) ?? solanaWallets[0] ?? null,
		[solanaWallets, funding.solanaAddress],
	);

	const solanaSigner = useMemo<SolanaSignerCapable | null>(
		() =>
			embeddedSolanaWallet
				? {
						signAndSendTransaction: (serializedTx: Uint8Array) =>
							sendPrivySponsoredSolanaTransaction(
								privySolanaSignAndSend,
								embeddedSolanaWallet,
								serializedTx,
							),
						signTransactionOnly: async (serializedTx: Uint8Array) => {
							const out = await privySolanaSignTransaction({
								transaction: serializedTx,
								wallet: embeddedSolanaWallet,
							});
							return out.signedTransaction;
						},
					}
				: null,
		[privySolanaSignAndSend, privySolanaSignTransaction, embeddedSolanaWallet],
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
				const addr = funding.embeddedEoa as `0x${string}` | undefined;
				if (!addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
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
				sendTransaction: (args: {
					to: `0x${string}`;
					data?: `0x${string}`;
					value?: bigint;
					chainId?: number;
					sponsor?: boolean;
				}) => client.sendTransaction(args),
			};
		},
		[getClientForChain, funding.embeddedEoa, privyEvmSendTransaction]
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
						if (!solanaSigner) {
							throw new Error("Solana embedded wallet unavailable — reload and try again.");
						}
						const conn = createSolanaConnectionForWalletSend();
						const txHash = await executeDirectSolanaSplWithdraw({
							mintAddress: leg.token.address,
							ownerWalletAddress: leg.selectedSource.walletAddress,
							recipientAddress: leg.toAddress.trim(),
							amountAtomic: BigInt(leg.amountAtomic),
							connection: conn,
							solanaSigner,
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
						await deployPolymarketDepositWalletIfNeeded(client, eoa);
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
						polygonRelayWalletAddress: funding.polymarketSafe || undefined,
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

				let polygonRelay:
					| { client: RelayClient; walletAddress: string }
					| undefined;
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
					await deployPolymarketDepositWalletIfNeeded(client, eoa);
					const approvalState = await checkPolymarketApprovals(
						funding.polymarketSafe
					);
					if (!approvalState.allApproved) {
						await executePolymarketApprovalBatch(client, funding.polymarketSafe);
					}
					polygonRelay = {
						client,
						walletAddress: funding.polymarketSafe,
					};
				}

				if (routeIncludesSolana && !solanaSigner) {
					throw new Error("Solana embedded wallet unavailable — reload and try again.");
				}
				const { txHashes } = await executeLifiSteps(
					quote.steps,
					getSignerForChain,
					{
						allowanceOwnerByChainId,
						rawLifiRoute: quote.quote,
						polygonSafeUnwrapPrerequisite: quote.polygonSafeUnwrapPrerequisite ?? undefined,
						...(funding.solanaAddress?.trim()
							? { solanaTokenOwnerAddress: funding.solanaAddress.trim() }
							: {}),
						...(polygonRelay ? { polygonRelay } : {}),
						...(routeIncludesSolana && solanaSigner ? { solanaSigner } : {}),
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
