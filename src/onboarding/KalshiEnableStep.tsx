import { useCallback, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
	useSignMessage,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { startDflowProofRedirect } from "@/trading/dflow/startDflowProofRedirect";

/**
 * Kalshi onboarding step inside the post-signup setup modal.
 *
 * Behavior matches `pages/Profile/Details/DflowProofSection`:
 *   - Calls `startDflowProofRedirect` which signs the server-issued message
 *     with the user's Solana embedded wallet and redirects them to the
 *     DFlow Proof KYC URL.
 *   - The return URL embeds `?dflow_proof=1` so when DFlow bounces them
 *     back, `useOnboardingStep` picks up the param and advances to the
 *     `deposit` step.
 *   - If the server already says they're verified (rare race; usually
 *     only re-onboarders), we skip the redirect and call
 *     `onAlreadyVerified()` so the gate advances immediately.
 *
 * No new env var, reuses the existing `getDflowAccount` cache.
 */
export function KalshiEnableStep({
	onLater,
	onAlreadyVerified,
	returnPath,
}: {
	onLater(): void;
	onAlreadyVerified(): void;
	returnPath: string;
}) {
	const { user } = usePrivy();
	const { signMessage } = useSignMessage();
	const { wallets: solanaWallets } = useSolanaWallets();
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	const dflow = useDflowProofStatus();

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const solanaLinked = user?.linkedAccounts?.find(
		(a: any) => a.type === "wallet" && a.chainType === "solana",
	) as { address?: string } | undefined;
	const solanaAddress = dflow.solanaAddress ?? solanaLinked?.address ?? null;
	const embeddedSolanaWallet = useMemo(
		() =>
			solanaWallets.find((w) => w.address === solanaAddress) ??
			solanaWallets[0] ??
			null,
		[solanaWallets, solanaAddress],
	);

	const handleEnable = useCallback(async () => {
		setError(null);
		setBusy(true);
		try {
			if (!embeddedSolanaWallet) {
				throw new Error(
					"Solana wallet not ready yet. Wait a moment and try again.",
				);
			}
			const returnUrl = `${window.location.origin}${returnPath}`;
			const out = await startDflowProofRedirect(
				api,
				async ({ message }) => {
					const { signature } = await signMessage({
						message,
						wallet: embeddedSolanaWallet,
					});
					return signature;
				},
				returnUrl,
			);
			if (out === "already_verified") {
				await queryClient.invalidateQueries({
					queryKey: ["dflow", "account"],
				});
				onAlreadyVerified();
			}
			// On "redirected" the browser leaves this page; nothing more to do.
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : "Couldn't start Kalshi verification.";
			setError(msg);
		} finally {
			setBusy(false);
		}
	}, [
		api,
		signMessage,
		embeddedSolanaWallet,
		queryClient,
		onAlreadyVerified,
		returnPath,
	]);

	return (
		<div className="first-signup-setup-modal__kalshi">
			<h3 className="first-signup-setup-modal__heading">
				Enable Kalshi trading
			</h3>
			<p className="first-signup-setup-modal__sub">
				Verify your identity through DFlow to unlock Kalshi markets. You can
				skip and come back to this anytime from Settings.
			</p>
			<div className="first-signup-setup-modal__actions">
				<button
					type="button"
					className="first-signup-setup-modal__btn first-signup-setup-modal__btn--secondary"
					onClick={onLater}
					disabled={busy}
					data-qa="onboarding-kalshi-later"
				>
					Later
				</button>
				<button
					type="button"
					className="first-signup-setup-modal__btn first-signup-setup-modal__btn--primary"
					onClick={() => void handleEnable()}
					disabled={busy}
					data-qa="onboarding-kalshi-enable"
				>
					{busy ? "Starting…" : "Enable Kalshi trading"}
				</button>
			</div>
			{error && (
				<div className="first-signup-setup-modal__error">{error}</div>
			)}
		</div>
	);
}
