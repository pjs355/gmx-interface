/**
 * DFlow/Kalshi regulatory proof status + trade-box proof redirect handler.
 *
 * Wraps `useDflowProofStatus` and exposes `handleStartDflowProofForTrade` (Privy Solana
 * message sign → API redirect). Consumed by `useApprovalGate` / `useTradeBoxApprovals`
 * to gate Kalshi execution until proof is verified.
 *
 * Does not submit orders; proof only.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSignMessage as useSolanaSignMessage } from "@privy-io/react-auth/solana";
import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import type { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { startDflowProofRedirect } from "@/features/trading/venues/dflow/onboarding/startDflowProofRedirect";

export function useTradeBoxDflowProof(args: {
	embeddedSolanaWallet: ConnectedStandardSolanaWallet | null;
	privateApi: ReturnType<typeof usePrivateApiClient>;
}) {
	const { embeddedSolanaWallet, privateApi } = args;
	const queryClient = useQueryClient();
	const { signMessage: privySolanaSignMessage } = useSolanaSignMessage();
	const dflowProof = useDflowProofStatus();

	const handleStartDflowProofForTrade = useCallback(async () => {
		if (!embeddedSolanaWallet) {
			console.warn("[DFlow] Solana embedded wallet unavailable — cannot start proof");
			return;
		}
		try {
			const returnUrl = new URL(window.location.href);
			returnUrl.searchParams.set("dflow_proof", "1");
			const out = await startDflowProofRedirect(
				privateApi,
				async ({ message }) => {
					const { signature } = await privySolanaSignMessage({
						message,
						wallet: embeddedSolanaWallet,
					});
					return signature;
				},
				returnUrl.toString(),
			);
			if (out === "already_verified") {
				await queryClient.invalidateQueries({ queryKey: ["dflow", "account"] });
			}
		} catch (err) {
			console.error("[DFlow] Enable Kalshi trading — start proof redirect failed", err);
		}
	}, [privateApi, privySolanaSignMessage, embeddedSolanaWallet, queryClient]);

	return { dflowProof, handleStartDflowProofForTrade };
}
