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
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { checkPolymarketApprovals } from "@/features/trading/venues/polymarket/trade/approvalTxs";
import {
	deployPolymarketDepositWalletIfNeeded,
	executePolymarketApprovalBatch,
} from "@/features/trading/venues/polymarket/session/safeActions";
import { createPrivyEmbeddedSendTransactionCapable } from "@/features/trading/venues/polymarket/wallet/embeddedPrivyViemSend";
import { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import { sendPrivySponsoredSolanaTransaction } from "@/features/trading/chains/privySponsoredSolana";
import type {
	SendTransactionCapable,
	SolanaSignerCapable,
} from "@/features/trading/lifi/sendTransactionTypes";
import type { ExecuteLifiStepsOptions } from "@/features/trading/lifi/executeLifiSteps";
import type { LifiQuoteResponse } from "@/types/trading";
import { CHAIN_LIFI_IDS } from "@/features/trading/sor/core/sor-types";

const BASE = CHAIN_LIFI_IDS.base;
const POLYGON = CHAIN_LIFI_IDS.polygon;
const BNB = CHAIN_LIFI_IDS.bnb;

/**
 * Shared Privy + Polymarket wiring for funding LI.Fi (`executeLifiSteps`).
 * Used by Transfers bridge and withdraw-plan execution so relay prep and
 * option bags stay in one place.
 */
export function useFundingLifiExecution() {
	const privateApi = usePrivateApiClient();
	const venueAddressChainMap = useVenueAddressChainMap();
	const baseSmartWallet = venueAddressChainMap?.levelup.walletAddress;
	const polymarketSafe = venueAddressChainMap?.polymarket.walletAddress;
	const predictMaker = venueAddressChainMap?.predictfun.walletAddress;
	const bnbSignerAddress = venueAddressChainMap?.predictfun.signerAddress;
	const solanaAddress = venueAddressChainMap?.dflow.walletAddress;
	const { getClientForChain } = useSmartWallets();
	const polymarketRelay = usePolymarketRelay();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const { signAndSendTransaction: privySolanaSignAndSend } = useSignAndSendTransaction();
	const { signTransaction: privySolanaSignTransaction } = useSolanaSignTransaction();
	const { wallets: solanaWallets } = useSolanaWallets();
	const embeddedSolanaWallet = useMemo(() => {
		const dflowAddr = solanaAddress?.trim();
		if (!dflowAddr) return null;
		return solanaWallets.find((w) => w.address === dflowAddr) ?? null;
	}, [solanaWallets, solanaAddress]);

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
		if (baseSmartWallet) m[BASE] = baseSmartWallet;
		if (polymarketSafe) m[POLYGON] = polymarketSafe;
		if (predictMaker) m[BNB] = predictMaker;
		return m;
	}, [baseSmartWallet, polymarketSafe, predictMaker]);

	const getSignerForChain = useCallback(
		async (chainId: number) => {
			if (chainId === BNB) {
				const addr = bnbSignerAddress as `0x${string}` | undefined;
				if (!addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
					return null;
				}
				return createPrivyEmbeddedSendTransactionCapable(addr, bsc, privyEvmSendTransaction);
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
		[getClientForChain, bnbSignerAddress, privyEvmSendTransaction],
	);

	const preparePolygonRelay = useCallback(
		async (
			needsRelay: boolean,
		): Promise<{ client: RelayClient; walletAddress: string } | undefined> => {
			if (!needsRelay) return undefined;
			const safe = polymarketSafe?.trim();
			if (!safe) {
				throw new Error("Polymarket funding address missing — cannot use relay on Polygon.");
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
			const approvalState = await checkPolymarketApprovals(safe, privateApi);
			if (!approvalState.allApproved) {
				await executePolymarketApprovalBatch(client, safe, privateApi);
			}
			return { client, walletAddress: safe };
		},
		[polymarketSafe, polymarketRelay, privateApi],
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
			...(solanaAddress?.trim() ? { solanaTokenOwnerAddress: solanaAddress.trim() } : {}),
			...(args.polygonRelay ? { polygonRelay: args.polygonRelay } : {}),
			...(args.routeIncludesSolana && solanaSigner ? { solanaSigner } : {}),
		}),
		[allowanceOwnerByChainId, solanaAddress, solanaSigner],
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
