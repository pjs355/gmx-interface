import { useCallback, useMemo } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSendTransaction } from "@privy-io/react-auth";
import {
	useSignAndSendTransaction,
	useSignTransaction as useSolanaSignTransaction,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { bsc } from "viem/chains";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { checkPolymarketApprovals } from "@/trading/polymarket/approvalTxs";
import {
	deployPolymarketDepositWalletIfNeeded,
	executePolymarketApprovalBatch,
} from "@/trading/polymarket/safeActions";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";
import type { SendTransactionCapable, SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import type { ExecuteLifiStepsOptions } from "@/trading/lifi/executeLifiSteps";
import type { LifiQuoteResponse } from "@/types/trading";
import { CHAIN_LIFI_IDS } from "@/trading/sor/sor-types";

const BASE = CHAIN_LIFI_IDS.base;
const POLYGON = CHAIN_LIFI_IDS.polygon;
const BNB = CHAIN_LIFI_IDS.bnb;

/**
 * Shared Privy + Polymarket wiring for funding LI.Fi (`executeLifiSteps`).
 * Used by Transfers bridge and withdraw-plan execution so relay prep and
 * option bags stay in one place.
 */
export function useFundingLifiExecution() {
	const funding = useFundingAddresses();
	const { getClientForChain } = useSmartWallets();
	const polymarketRelay = usePolymarketRelay();
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
			} satisfies SendTransactionCapable;
		},
		[getClientForChain, funding.embeddedEoa, privyEvmSendTransaction],
	);

	const preparePolygonRelay = useCallback(
		async (
			needsRelay: boolean,
		): Promise<{ client: RelayClient; walletAddress: string } | undefined> => {
			if (!needsRelay) return undefined;
			const safe = funding.polymarketSafe?.trim();
			if (!safe) {
				throw new Error(
					"Polymarket funding address missing — cannot use relay on Polygon."
				);
			}
			const client = await polymarketRelay.getRelayClient();
			if (!client) {
				throw new Error("Polymarket relay requires your embedded Privy wallet.");
			}
			const eoa = polymarketRelay.eoaAddress;
			if (!eoa) {
				throw new Error("Embedded wallet address unavailable.");
			}
			await deployPolymarketDepositWalletIfNeeded(client, eoa);
			const approvalState = await checkPolymarketApprovals(safe);
			if (!approvalState.allApproved) {
				await executePolymarketApprovalBatch(client, safe);
			}
			return { client, walletAddress: safe };
		},
		[funding.polymarketSafe, polymarketRelay],
	);

	const buildExecuteLifiStepsOptions = useCallback(
		(
			quote: LifiQuoteResponse,
			args: {
				routeIncludesSolana: boolean;
				polygonRelay?: { client: RelayClient; walletAddress: string };
			},
		): ExecuteLifiStepsOptions => ({
			allowanceOwnerByChainId,
			rawLifiRoute: quote.quote,
			polygonSafeUnwrapPrerequisite: quote.polygonSafeUnwrapPrerequisite ?? undefined,
			...(funding.solanaAddress?.trim()
				? { solanaTokenOwnerAddress: funding.solanaAddress.trim() }
				: {}),
			...(args.polygonRelay ? { polygonRelay: args.polygonRelay } : {}),
			...(args.routeIncludesSolana && solanaSigner ? { solanaSigner } : {}),
		}),
		[allowanceOwnerByChainId, funding.solanaAddress, solanaSigner],
	);

	return {
		allowanceOwnerByChainId,
		getSignerForChain,
		solanaSigner,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
		polymarketRelay,
	};
}
