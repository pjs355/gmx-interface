import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage } from "@privy-io/react-auth/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { DflowVerifyResponse } from "@/services/privateApi";

function truncateAddr(a: string | null | undefined): string {
	if (!a) return "—";
	return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function DflowProofSection() {
	const { authenticated, user } = usePrivy();
	const { signMessage } = useSignMessage();
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

	const refreshFromProof = useCallback(async () => {
		setError(null);
		setSuccessMsg(null);
		setBusy(true);
		try {
			const result = await api.getDflowVerify();
			if (result.verified) {
				await queryClient.invalidateQueries({
					queryKey: ["dflow", "account"],
				});
				setSuccessMsg(
					"LevelUp is synced with Proof — you’re verified for Kalshi / DFlow."
				);
			} else {
				setError(
					"Proof still reports pending. If you only just finished ID verification, wait a minute and try again, or use Start Proof Verification."
				);
			}
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : "Could not refresh Proof status.";
			setError(msg);
		} finally {
			setBusy(false);
		}
	}, [api, queryClient]);

	const handleVerify = useCallback(async () => {
		setError(null);
		setSuccessMsg(null);
		setBusy(true);
		try {
			const result: DflowVerifyResponse = await api.getDflowVerify();

			if (result.verified) {
				await queryClient.invalidateQueries({
					queryKey: ["dflow", "account"],
				});
				setSuccessMsg("Proof KYC verified.");
				setBusy(false);
				return;
			}

			const messageBytes = new TextEncoder().encode(result.proofMessage);
			const sigBytes: Uint8Array = await signMessage({
				message: messageBytes,
			});

			const sigBase58 = bs58.encode(sigBytes);
			const walletPubkey = result.solanaWalletAddress;

			const redirectUri = encodeURIComponent(
				`${window.location.origin}/profile?dflow_proof=1`
			);
			const proofUrl =
				`${result.proofRedirectBase}?wallet=${walletPubkey}` +
				`&signature=${sigBase58}` +
				`&timestamp=${result.timestamp}` +
				`&redirect_uri=${redirectUri}`;

			window.location.href = proofUrl;
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : "Proof verification failed.";
			setError(msg);
		} finally {
			setBusy(false);
		}
	}, [api, signMessage, queryClient]);

	const searchParams = new URLSearchParams(window.location.search);
	const isProofReturn = searchParams.get("dflow_proof") === "1";

	useQuery({
		queryKey: ["dflow", "verify-on-return"],
		queryFn: async () => {
			const result = await api.getDflowVerify();
			if (result.verified) {
				await queryClient.invalidateQueries({
					queryKey: ["dflow", "account"],
				});
			}
			const url = new URL(window.location.href);
			url.searchParams.delete("dflow_proof");
			window.history.replaceState({}, "", url.toString());
			return result;
		},
		enabled: authenticated && isProofReturn,
		staleTime: Infinity,
	});

	if (!authenticated) return null;

	return (
		<div className="Details-info-section" style={{ marginTop: 24 }}>
			<div className="Details-info-label">Kalshi / DFlow (Proof KYC)</div>

			<div style={{ marginTop: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
					<span style={{ color: "#888", fontSize: 13 }}>Solana Wallet:</span>
					<span style={{ color: "#fff", fontSize: 13, fontFamily: "monospace" }}>
						{truncateAddr(solanaAddress)}
					</span>
				</div>

				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
					<span style={{ color: "#888", fontSize: 13 }}>Status:</span>
					{accountQuery.isLoading ? (
						<span style={{ color: "#888", fontSize: 13 }}>Loading…</span>
					) : verifySyncQuery.isFetching ? (
						<span style={{ color: "#888", fontSize: 13 }}>Syncing with Proof…</span>
					) : isVerified ? (
						<span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
							Verified
						</span>
					) : (
						<span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>
							Not verified
						</span>
					)}
				</div>

				{!isVerified && (
					<p
						style={{
							color: "rgba(255,255,255,0.55)",
							fontSize: 12,
							lineHeight: 1.45,
							margin: "0 0 12px 0",
							maxWidth: 480,
						}}
					>
						Got an email from DFlow that ID is verified? LevelUp only updates after our
						server talks to Proof. Open this page again or use{" "}
						<strong style={{ color: "rgba(255,255,255,0.75)" }}>
							Refresh from Proof
						</strong>{" "}
						— it runs the same check as returning from the Proof flow.
					</p>
				)}

				{!isVerified && (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
						<button
							type="button"
							className="Details-button"
							onClick={() => void refreshFromProof()}
							disabled={
								busy || accountQuery.isLoading || !solanaAddress || verifySyncQuery.isFetching
							}
							style={{ minWidth: 180 }}
						>
							{busy ? "Checking…" : "Refresh from Proof"}
						</button>
						<button
							type="button"
							className="Details-button"
							onClick={() => void handleVerify()}
							disabled={busy || accountQuery.isLoading || verifySyncQuery.isFetching}
							style={{ minWidth: 200, opacity: 0.92 }}
						>
							{busy ? "Verifying…" : "Start Proof Verification"}
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
