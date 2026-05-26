/**
 * Privy embedded Solana wallet → SOR/LI.FI signer adapter for DFlow (Kalshi) legs.
 *
 * Resolves the user's DFlow venue address against Privy Solana wallets and wraps
 * `signAndSendTransaction` / `signTransactionOnly` with sponsored send helpers.
 *
 * Used by: `PredictionMarketTradeBox` → `buildTradeBoxSorLegExecutorDeps` (`solanaSigner`).
 * Pair with `useTradeBoxDflowProof` for regulatory proof, not signing.
 */
import { useMemo } from "react";
import {
	useSignAndSendTransaction as useSolanaSignAndSendTransaction,
	useSignTransaction as useSolanaSignTransaction,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { sendPrivySponsoredSolanaTransaction } from "@/features/trading/chains/privySponsoredSolana";
import type { SolanaSignerCapable } from "@/features/trading/lifi/sendTransactionTypes";

export function useTradeBoxSolanaSigner(dflowWalletAddress: string | undefined) {
	const { signAndSendTransaction: privySolanaSignAndSend } = useSolanaSignAndSendTransaction();
	const { signTransaction: privySolanaSignTransaction } = useSolanaSignTransaction();
	const { wallets: solanaWallets } = useSolanaWallets();

	const embeddedSolanaWallet = useMemo(() => {
		const dflowAddr = dflowWalletAddress?.trim();
		if (!dflowAddr) return null;
		return solanaWallets.find((w) => w.address === dflowAddr) ?? null;
	}, [solanaWallets, dflowWalletAddress]);

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

	return { embeddedSolanaWallet, solanaSigner };
}
