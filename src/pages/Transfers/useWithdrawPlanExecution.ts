import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAddress, isAddress } from "viem";
import { useUserData } from "@/context/UserDataContext";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { pickLifiSourceTxHashForStatus } from "@/trading/lifi/pickLifiSourceTxHashForStatus";
import { executeDirectErc20Withdraw } from "@/trading/lifi/executeDirectEvmWithdraw";
import { executeDirectSolanaSplWithdraw } from "@/trading/lifi/executeDirectSolanaSplWithdraw";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import { useFundingLifiExecution } from "@/trading/lifi/useFundingLifiExecution";
import {
	BRIDGE_FUNDING_BALANCES_QUERY_KEY,
} from "@/trading/hooks/useBridgeFundingBalances";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { createSolanaConnectionForWalletSend } from "@/config/rpc";
import {
	formatLifiErrorForUser,
	formatLifiWithdrawStepFailed,
	userMessage,
	LIFI_INVALID_RECIPIENT,
	LIFI_NO_TX_HASH_WALLET,
	LIFI_POLY_EMBEDDED_WALLET_LOADING,
	LIFI_SOLANA_WALLET_UNAVAILABLE,
} from "@/errors";
import type { RelayClient } from "@polymarket/builder-relayer-client";
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

const POLYGON = 137;
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
	const {
		getSignerForChain,
		solanaSigner,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
		polymarketRelay,
	} = useFundingLifiExecution();

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
							throw new Error(userMessage(LIFI_SOLANA_WALLET_UNAVAILABLE));
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
						throw new Error(userMessage(LIFI_INVALID_RECIPIENT));
					}
					const recipient = getAddress(leg.toAddress) as `0x${string}`;
					let polygonRelayClient: RelayClient | undefined;
					if (chainId === POLYGON) {
						const pr = await preparePolygonRelay(true);
						polygonRelayClient = pr?.client;
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

				if (needsPolymarketRelay && !polymarketRelay.walletReady) {
					throw new Error(userMessage(LIFI_POLY_EMBEDDED_WALLET_LOADING));
				}

				const polygonRelay = await preparePolygonRelay(needsPolymarketRelay);

				if (routeIncludesSolana && !solanaSigner) {
					throw new Error(userMessage(LIFI_SOLANA_WALLET_UNAVAILABLE));
				}
				const { txHashes } = await executeLifiSteps(
					quote.steps,
					getSignerForChain,
					buildExecuteLifiStepsOptions(quote, {
						routeIncludesSolana,
						polygonRelay,
					}),
				);

				const statusTxHash = pickTxHashForLifiStatusPoll(
					txHashes,
					quote,
					fromChain
				);
				if (!statusTxHash) {
					throw new Error(userMessage(LIFI_NO_TX_HASH_WALLET));
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
						console.error("error", err);
						throw new Error(formatLifiWithdrawStepFailed(i + 1, n));
					}
				}
				return { entries };
			}

			return { entries: [await runSingleLeg(plan)] };
		},
		[
			api,
			buildExecuteLifiStepsOptions,
			funding,
			getSignerForChain,
			polymarketRelay.walletReady,
			preparePolygonRelay,
			queryClient,
			refreshUserData,
			solanaSigner,
		]
	);

	return { executePlan, funding };
}

export function getWithdrawExecutionErrorMessage(err: unknown): string {
	return formatLifiErrorForUser(err);
}
