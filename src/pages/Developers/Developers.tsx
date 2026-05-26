import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { useSignerContext } from "context/SignerContext";
import {
	createApiKey,
	deleteApiKey,
	generatePassphrase,
	getMe,
	listApiKeys,
	listApiKeysBySession,
} from "@/services/lvlup/api";
import type { L2Secrets } from "@/services/lvlup/hmac";
import "./Developers.scss";

export default function Developers() {
	const { authenticated, getAccessToken } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();
	const { account, signer } = useSignerContext() as any;
	const [keys, setKeys] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [showCreate, setShowCreate] = useState(false);
	const [passphrase, setPassphrase] = useState<string>("");
	const [created, setCreated] = useState<{
		key: string;
		secret: string;
		passphrase: string;
	} | null>(null);
	const [createdAddress, setCreatedAddress] = useState<string | null>(null);
	const [iSaved, setISaved] = useState(false);

	const l2Auth: L2Secrets | null = useMemo(() => {
		if (!created || !createdAddress) return null;
		return {
			key: created.key,
			secret: created.secret,
			passphrase: created.passphrase,
			address: createdAddress,
		};
	}, [created, createdAddress]);

	useEffect(() => {
		if (!showCreate) return;
		setPassphrase(generatePassphrase());
		setCreated(null);
		setISaved(false);
	}, [showCreate]);

	// On mount, populate keys via session-based endpoint (Privy token + connected address)
	useEffect(() => {
		(async () => {
			try {
				if (!account) return;
				const token = await getAccessToken();
				if (!token) return;
				const list = await listApiKeysBySession(account, token);
				setKeys(Array.isArray(list) ? list : []);
			} catch {}
		})();
	}, [account, getAccessToken]);

	// No persistence of secrets; keys will be listed only when L2 creds exist in memory

	async function loadKeys() {
		if (!l2Auth) return;
		setLoading(true);
		setError(null);
		try {
			const me = await getMe(l2Auth);
			console.log("/api/auth/me:", me);
			const list = await listApiKeys(l2Auth);
			setKeys(Array.isArray(list) ? list : []);
		} catch (e: any) {
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	async function resolveSigner(): Promise<ethers.Signer | null> {
		if (signer) return signer as unknown as ethers.Signer;
		try {
			const smart = Array.isArray(privyWallets)
				? privyWallets.find((w: any) => w?.type === "smart_wallet") || privyWallets[0]
				: null;
			if (smart && typeof smart.getEthereumProvider === "function") {
				const eip1193 = await smart.getEthereumProvider();
				const provider = new ethers.BrowserProvider(eip1193 as any);
				const s = await provider.getSigner();
				return s;
			}
		} catch {}
		return null;
	}

	async function onCreate() {
		// Do not rely on displayed account; use the address from the signer we actually use
		setLoading(true);
		setError(null);
		try {
			const s = await resolveSigner();
			if (!s) {
				throw new Error("No signer available. Please connect a wallet.");
			}
			const addr = await s.getAddress();
			console.log("[Developers] resolved signer address:", addr, "connected account:", account);
			const res = await createApiKey(passphrase, addr, s);
			console.log("[Developers] createApiKey result:", res);
			setCreated(res);
			setCreatedAddress(addr);
			// Immediately list keys using freshly issued creds
			try {
				const immediate = await listApiKeys({
					key: res.key,
					secret: res.secret,
					passphrase: res.passphrase,
					address: addr,
				});
				setKeys(Array.isArray(immediate) ? immediate : []);
			} catch (e) {}
			// Do not persist secrets
		} catch (e: any) {
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	// Auto-load keys once L2 creds are present (restored or just created)
	useEffect(() => {
		if (l2Auth) {
			loadKeys();
		}
	}, [!!l2Auth]);

	async function onRevoke(key: string) {
		if (!l2Auth) return;
		setLoading(true);
		setError(null);
		try {
			await deleteApiKey(l2Auth, key);
			await loadKeys();
		} catch (e: any) {
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="developers-container">
			<h1>Developers</h1>
			{!authenticated && (
				<div className="developers-unauthenticated">
					Please sign in with Privy to manage API keys.
				</div>
			)}

			<div className="developers-keys-section">
				<h2>Your API Keys</h2>
				<div className="developers-actions">
					<button onClick={() => setShowCreate(true)} className="developers-button">
						Create API Key
					</button>
					<button onClick={loadKeys} disabled={!l2Auth || loading} className="developers-button">
						Refresh
					</button>
					{error && <span className="developers-error">{error}</span>}
				</div>
				<div className="developers-keys-grid">
					{keys.map((k) => (
						<div key={k.key} className="developers-key-card">
							<div>
								<div className="developers-key-info">{k.key}</div>
								<div className="developers-key-meta">disabled: {String(k.disabled ?? false)}</div>
							</div>
							<div className="developers-key-meta">created: {k.createdAt}</div>
							<div className="developers-key-meta">last used: {k.lastUsedAt || "—"}</div>
							<div>
								<button onClick={() => onRevoke(k.key)} className="developers-button">
									Revoke
								</button>
							</div>
						</div>
					))}
					{keys.length === 0 && <div className="developers-no-keys">No keys yet.</div>}
				</div>
			</div>

			{showCreate && (
				<div className="developers-create-modal">
					<h3>Create API Key</h3>
					{!created && (
						<>
							<div className="developers-warning">
								The wallet used to create an API key must be used for authenticated API actions.
								Operations performed against the LVLUP API require access to that wallet's private
								key. The embedded Privy wallet shown in the UI cannot sign server-side operations on
								your behalf. Verify you are connected to the intended wallet before generating a
								key. You can view your linked accounts in the profile sidebar.
							</div>
							<div className="developers-instruction">
								Store your passphrase and secret in your .env. Shown once.
							</div>
							<label className="developers-passphrase-label">
								<span>Passphrase</span>
								<input
									value={passphrase}
									onChange={(e) => setPassphrase(e.target.value)}
									className="developers-input"
								/>
							</label>
							<div className="developers-button-group">
								<button
									onClick={() => setPassphrase(generatePassphrase())}
									className="developers-button"
								>
									Regenerate
								</button>
								<button
									onClick={onCreate}
									disabled={!account || loading}
									className="developers-button"
								>
									Create
								</button>
								<button onClick={() => setShowCreate(false)} className="developers-button">
									Close
								</button>
							</div>
							{error && <div className="developers-error-message">{error}</div>}
						</>
					)}
					{created && (
						<>
							<div className="developers-created-grid">
								<ReadOnlyRow label="API Key" value={created.key} />
								<ReadOnlyRow label="API Secret" value={created.secret} secret />
								<ReadOnlyRow label="Passphrase" value={created.passphrase} secret />
							</div>
							<div className="developers-download-section">
								<EnvDownload
									keyVal={created.key}
									secret={created.secret}
									passphrase={created.passphrase}
									address={account!}
								/>
							</div>
							<label className="developers-saved-checkbox">
								<input
									type="checkbox"
									checked={iSaved}
									onChange={(e) => setISaved(e.target.checked)}
								/>
								<span>I saved it</span>
							</label>
							<div className="developers-close-section">
								<button
									onClick={() => setShowCreate(false)}
									disabled={!iSaved}
									className="developers-button"
								>
									Close
								</button>
							</div>
						</>
					)}
				</div>
			)}

			{created && (
				<div className="developers-test-section">
					<h3>Test L2 (Me)</h3>
					<button onClick={loadKeys} className="developers-button">
						Call /api/auth/me
					</button>
					<div className="developers-test-note">
						Example: send LVLUP headers with HMAC(LVLUP_API_SECRET, method+path+timestamp)
					</div>
				</div>
			)}
		</div>
	);
}

function ReadOnlyRow({
	label,
	value,
	secret = false,
}: {
	label: string;
	value: string | undefined;
	secret?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const safe = value ?? "";
	const display = secret ? "•".repeat(Math.min(safe.length, 16)) : safe;
	return (
		<div className="readonly-row">
			<div className="readonly-label">{label}</div>
			<input readOnly value={display} className="readonly-input" />
			<button
				onClick={() => {
					navigator.clipboard.writeText(safe);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
				className="readonly-copy-button"
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

function EnvDownload({
	keyVal,
	secret,
	passphrase,
	address,
}: {
	keyVal: string;
	secret: string;
	passphrase: string;
	address: string;
}) {
	const content = `LVLUP_ADDRESS=${address}\nLVLUP_API_KEY=${keyVal}\nLVLUP_API_SECRET=${secret}\nLVLUP_PASSPHRASE=${passphrase}\n`;
	function download() {
		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "lvlup.env";
		a.click();
		URL.revokeObjectURL(url);
	}
	return (
		<button onClick={download} className="developers-button">
			Download .env
		</button>
	);
}
