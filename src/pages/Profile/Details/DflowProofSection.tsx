import { useState, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Tooltip from "@/components/Tooltip/Tooltip";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { startDflowProofRedirect } from "@/trading/dflow/startDflowProofRedirect";

const KALSHI_NOT_VERIFIED_TOOLTIP =
	"You must verify your identity via DFlow in order to place trades with Kalshi.";

export default function DflowProofSection() {
	const { authenticated, user } = usePrivy();
	const { signMessage } = useSignMessage();
	const { wallets: solanaWallets } = useSolanaWallets();
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);

	const accountQuery = useQuery({
		queryKey: ["dflow", "account"],
		queryFn: () => api.getDflowAccount(),
		enabled: authenticated,
		staleTime: 30_000,
	});

	const proofState = accountQuery.data?.proofState;

	const solanaLinked = user?.linkedAccounts?.find(
		(a: any) => a.type === "wallet" && a.chainType === "solana"
	) as { address?: string } | undefined;
	const solanaAddress =
		proofState?.solanaWalletAddress ?? solanaLinked?.address ?? null;

	const embeddedSolanaWallet = useMemo(
		() => solanaWallets.find((w) => w.address === solanaAddress) ?? solanaWallets[0] ?? null,
		[solanaWallets, solanaAddress],
	);

	const isVerified =
		proofState?.identityVerified && proofState?.ownershipProofValid;

	/**
	 * Proof may show you as verified before LevelUp Mongo updates. The private API
	 * only syncs when `GET /api/dflow/verify` runs (same as returning from Proof with `?dflow_proof=1`).
	 */
	const verifySyncQuery = useQuery({
		queryKey: ["dflow", "verify-status-sync", solanaAddress ?? ""],
		queryFn: async () => {
			const result = await api.getDflowVerify();
			if (result.verified) {
				await queryClient.invalidateQueries({
					queryKey: ["dflow", "account"],
				});
			}
			return result;
		},
		enabled:
			authenticated &&
			Boolean(solanaAddress) &&
			accountQuery.isSuccess &&
			!isVerified,
		staleTime: 120_000,
		retry: false,
	});

	const handleVerify = useCallback(async () => {
		setError(null);
		setSuccessMsg(null);
		setBusy(true);
		try {
			if (!embeddedSolanaWallet) {
				throw new Error(
					"No Solana wallet available. Reload the page, then try again.",
				);
			}
			const returnUrl = `${window.location.origin}/profile?dflow_proof=1`;
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
				setSuccessMsg("Proof KYC verified.");
			}
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : "Proof verification failed.";
			setError(msg);
		} finally {
			setBusy(false);
		}
	}, [api, signMessage, embeddedSolanaWallet, queryClient]);

	if (!authenticated) return null;

	return (
		<div
			id="dflow-kyc"
			className="Details-info-section"
			style={{ marginTop: 24 }}
		>
			<div
				className="Details-info-label"
				style={{ fontSize: 16, fontWeight: 700, opacity: 1 }}
			>
				Kalshi enabled trading
			</div>

			<div style={{ marginTop: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
					<span style={{ color: "#888", fontSize: 13 }}>Status:</span>
					{accountQuery.isLoading ? (
						<span style={{ color: "#888", fontSize: 13 }}>Loading…</span>
					) : verifySyncQuery.isFetching ? (
						<span style={{ color: "#888", fontSize: 13 }}>Syncing with Proof…</span>
					) : isVerified ? (
						<span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
							Enabled
						</span>
					) : (
						<Tooltip
							content={KALSHI_NOT_VERIFIED_TOOLTIP}
							position="top"
							withPortal={true}
						>
							<span
								style={{
									color: "#f59e0b",
									fontSize: 13,
									fontWeight: 600,
									cursor: "help",
								}}
							>
								Not verified
							</span>
						</Tooltip>
					)}
				</div>

				{!isVerified && (
					<div style={{ marginTop: 4 }}>
						<button
							type="button"
							className="Details-button"
							onClick={() => void handleVerify()}
							disabled={busy || accountQuery.isLoading || verifySyncQuery.isFetching}
							style={{ minWidth: 180, opacity: 0.92 }}
						>
							{busy ? "Verifying…" : "Get Verified"}
						</button>
					</div>
				)}

				{error && (
					<div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>
						{error}
					</div>
				)}
				{successMsg && (
					<div style={{ color: "#16a34a", fontSize: 13, marginTop: 8 }}>
						{successMsg}
					</div>
				)}
			</div>
		</div>
	);
}
