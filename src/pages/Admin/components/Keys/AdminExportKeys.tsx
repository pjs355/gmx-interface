import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { usePrivy, type WalletWithMetadata } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";

function isPrivyEthereumEmbedded(account: unknown): account is WalletWithMetadata {
	const a = account as Record<string, unknown> | null | undefined;
	return a?.type === "wallet" && a?.walletClientType === "privy" && a?.chainType === "ethereum";
}

function isPrivySolanaEmbedded(account: unknown): account is WalletWithMetadata {
	const a = account as Record<string, unknown> | null | undefined;
	return a?.type === "wallet" && a?.walletClientType === "privy" && a?.chainType === "solana";
}

function hasSmartWalletLinked(linked: unknown[] | undefined): boolean {
	return (linked || []).some((a) => (a as { type?: string })?.type === "smart_wallet");
}

const panelStyle: CSSProperties = {
	maxWidth: 720,
	padding: 16,
	border: "1px solid #333",
	borderRadius: 8,
	background: "#0d0d0d",
};

const rowStyle: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "center",
	gap: 12,
	padding: "12px 0",
	borderBottom: "1px solid #222",
};

const btnStyle: CSSProperties = {
	padding: "8px 14px",
	border: "1px solid #22c55e",
	borderRadius: 6,
	background: "rgba(34,197,94,0.15)",
	color: "#86efac",
	cursor: "pointer",
};

const btnDisabled: CSSProperties = {
	...btnStyle,
	opacity: 0.45,
	cursor: "not-allowed",
};

export default function AdminExportKeys() {
	const { ready, authenticated, user, exportWallet } = usePrivy();
	const { exportWallet: exportSolanaWallet } = useExportWallet();
	const [busyAddress, setBusyAddress] = useState<string | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);

	const linked = user?.linkedAccounts;
	const evmEmbedded = useMemo(
		() =>
			(linked || [])
				.filter(isPrivyEthereumEmbedded)
				.filter((w) => typeof w.address === "string" && w.address.length > 0),
		[linked],
	);
	const solEmbedded = useMemo(
		() =>
			(linked || [])
				.filter(isPrivySolanaEmbedded)
				.filter((w) => typeof w.address === "string" && w.address.length > 0),
		[linked],
	);
	const smartLinked = useMemo(
		() => hasSmartWalletLinked(linked as unknown[] | undefined),
		[linked],
	);

	const canExportEvm =
		ready && authenticated && typeof exportWallet === "function" && evmEmbedded.length > 0;

	const canExportSol =
		ready && authenticated && typeof exportSolanaWallet === "function" && solEmbedded.length > 0;

	const onExportEvm = useCallback(
		async (address?: string) => {
			if (!exportWallet) return;
			setLastError(null);
			const key = address ?? "default";
			setBusyAddress(`evm:${key}`);
			try {
				if (address) {
					await exportWallet({ address });
				} else {
					await exportWallet();
				}
			} catch (e) {
				setLastError(e instanceof Error ? e.message : "EVM export failed");
			} finally {
				setBusyAddress(null);
			}
		},
		[exportWallet],
	);

	const onExportSol = useCallback(
		async (address?: string) => {
			setLastError(null);
			const key = address ?? "default";
			setBusyAddress(`sol:${key}`);
			try {
				if (address) {
					await exportSolanaWallet({ address });
				} else {
					await exportSolanaWallet();
				}
			} catch (e) {
				setLastError(e instanceof Error ? e.message : "Solana export failed");
			} finally {
				setBusyAddress(null);
			}
		},
		[exportSolanaWallet],
	);

	if (!ready) {
		return <div style={{ padding: 12 }}>Loading Privy…</div>;
	}

	if (!authenticated) {
		return (
			<div style={{ padding: 12, color: "#f87171" }}>
				You must be logged in with Privy to export embedded wallet keys.
			</div>
		);
	}

	return (
		<div style={panelStyle}>
			<h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Keys</h2>
			<p style={{ margin: "0 0 16px", color: "#aaa", lineHeight: 1.5 }}>
				Export uses Privy&apos;s secure flow: a Privy modal opens where you can view and copy your
				embedded wallet private key. The key is not pasted into this page. Use the copy from that
				modal in server code or another wallet client.
			</p>
			<p style={{ margin: "0 0 16px", color: "#888", fontSize: 14 }}>
				Alternate surface:{" "}
				<a
					href="https://home.privy.io/"
					target="_blank"
					rel="noopener noreferrer"
					style={{ color: "#60a5fa" }}
				>
					Privy Home
				</a>{" "}
				(same account).
			</p>

			{smartLinked && (
				<div
					style={{
						marginBottom: 16,
						padding: 12,
						borderRadius: 6,
						background: "rgba(234,179,8,0.12)",
						border: "1px solid rgba(234,179,8,0.35)",
						color: "#fcd34d",
						fontSize: 14,
						lineHeight: 1.5,
					}}
				>
					You have a smart wallet linked. EVM export returns the <strong>signer</strong> (EOA)
					private key that controls the smart wallet, not the smart contract address as a normal
					externally owned account.
				</div>
			)}

			{lastError && (
				<div
					style={{
						marginBottom: 16,
						padding: 12,
						borderRadius: 6,
						background: "rgba(248,113,113,0.12)",
						color: "#fca5a5",
					}}
				>
					{lastError}
				</div>
			)}

			<div style={{ fontWeight: 700, marginBottom: 8, color: "#e5e5e5" }}>Embedded EVM (Privy)</div>
			{evmEmbedded.length === 0 ? (
				<p style={{ color: "#888", margin: "0 0 20px" }}>
					No Privy embedded Ethereum wallet on this account. If you only use an external wallet
					(e.g. MetaMask), there is no Privy embedded key to export here.
				</p>
			) : (
				<div style={{ marginBottom: 24 }}>
					{evmEmbedded.map((w) => {
						const addr = w.address;
						const busy = busyAddress === `evm:${addr}`;
						const disabled = !canExportEvm || busy;
						return (
							<div key={addr} style={rowStyle}>
								<code
									style={{
										flex: 1,
										minWidth: 200,
										fontSize: 13,
										wordBreak: "break-all",
									}}
								>
									{addr}
								</code>
								<button
									type="button"
									disabled={disabled}
									style={disabled ? btnDisabled : btnStyle}
									onClick={() => void onExportEvm(addr)}
								>
									{busy ? "Opening…" : "Export key"}
								</button>
							</div>
						);
					})}
				</div>
			)}

			<div style={{ fontWeight: 700, marginBottom: 8, color: "#e5e5e5" }}>
				Embedded Solana (Privy)
			</div>
			{solEmbedded.length === 0 ? (
				<p style={{ color: "#888", margin: 0 }}>No Privy embedded Solana wallet on this account.</p>
			) : (
				<div>
					{solEmbedded.map((w) => {
						const addr = w.address;
						const busy = busyAddress === `sol:${addr}`;
						const disabled = !canExportSol || busy;
						return (
							<div key={addr} style={rowStyle}>
								<code
									style={{
										flex: 1,
										minWidth: 200,
										fontSize: 13,
										wordBreak: "break-all",
									}}
								>
									{addr}
								</code>
								<button
									type="button"
									disabled={disabled}
									style={disabled ? btnDisabled : btnStyle}
									onClick={() => void onExportSol(addr)}
								>
									{busy ? "Opening…" : "Export key"}
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
