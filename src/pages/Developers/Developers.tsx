import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import useWallet from "../../lib/wallets/useWallet";
import {
  createApiKey,
  deleteApiKey,
  generatePassphrase,
  getMe,
  listApiKeys,
  listApiKeysBySession,
} from "../../lib/lvlup/api";
import type { L2Secrets } from "../../lib/lvlup/hmac";

export default function Developers() {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets: privyWallets } = usePrivyWallets();
  const { account, signer } = useWallet();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [passphrase, setPassphrase] = useState<string>("");
  const [created, setCreated] = useState<{ key: string; secret: string; passphrase: string } | null>(null);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  const [iSaved, setISaved] = useState(false);

  const l2Auth: L2Secrets | null = useMemo(() => {
    if (!created || !createdAddress) return null;
    return { key: created.key, secret: created.secret, passphrase: created.passphrase, address: createdAddress };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div style={{ padding: 24, color: "white" }}>
      <h1>Developers</h1>
      {!authenticated && <div>Please sign in with Privy to manage API keys.</div>}

      <div style={{ marginTop: 16 }}>
        <h2>Your API Keys</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "6px 10px",
              border: "1px solid white",
              borderRadius: 6,
              background: "transparent",
              color: "white",
            }}
          >
            Create API Key
          </button>
          <button
            onClick={loadKeys}
            disabled={!l2Auth || loading}
            style={{
              padding: "6px 10px",
              border: "1px solid white",
              borderRadius: 6,
              background: "transparent",
              color: "white",
            }}
          >
            Refresh
          </button>
          {error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {keys.map((k) => (
            <div
              key={k.key}
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr auto",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{k.key}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>disabled: {String(k.disabled ?? false)}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>created: {k.createdAt}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>last used: {k.lastUsedAt || "—"}</div>
              <div>
                <button
                  onClick={() => onRevoke(k.key)}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                    color: "white",
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
          {keys.length === 0 && <div style={{ opacity: 0.8 }}>No keys yet.</div>}
        </div>
      </div>

      {showCreate && (
        <div style={{ marginTop: 24, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: 16 }}>
          <h3>Create API Key</h3>
          {!created && (
            <>
              <div style={{ margin: "8px 0", fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
                The wallet used to create an API key must be used for authenticated API actions. Operations performed
                against the LVLUP API require access to that wallet’s private key. The embedded Privy wallet shown in
                the UI cannot sign server-side operations on your behalf. Verify you are connected to the intended
                wallet before generating a key. You can view your linked accounts in the profile sidebar.
              </div>
              <div style={{ margin: "8px 0", fontSize: 14, opacity: 0.9 }}>
                Store your passphrase and secret in your .env. Shown once.
              </div>
              <label style={{ display: "grid", gap: 6, maxWidth: 640 }}>
                <span>Passphrase</span>
                <input
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  style={{
                    padding: 8,
                    color: "cyan",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setPassphrase(generatePassphrase())}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                    color: "white",
                  }}
                >
                  Regenerate
                </button>
                <button
                  onClick={onCreate}
                  disabled={!account || loading}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                    color: "white",
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                    color: "white",
                  }}
                >
                  Close
                </button>
              </div>
              {error && <div style={{ color: "#ff6b6b", marginTop: 8 }}>{error}</div>}
            </>
          )}
          {created && (
            <>
              <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
                <ReadOnlyRow label="API Key" value={created.key} />
                <ReadOnlyRow label="API Secret" value={created.secret} secret />
                <ReadOnlyRow label="Passphrase" value={created.passphrase} secret />
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <EnvDownload
                  keyVal={created.key}
                  secret={created.secret}
                  passphrase={created.passphrase}
                  address={account!}
                />
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <input type="checkbox" checked={iSaved} onChange={(e) => setISaved(e.target.checked)} />
                <span>I saved it</span>
              </label>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowCreate(false)}
                  disabled={!iSaved}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid white",
                    borderRadius: 6,
                    background: "transparent",
                    color: "white",
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {created && (
        <div style={{ marginTop: 24 }}>
          <h3>Test L2 (Me)</h3>
          <button
            onClick={loadKeys}
            style={{
              padding: "6px 10px",
              border: "1px solid white",
              borderRadius: 6,
              background: "transparent",
              color: "white",
            }}
          >
            Call /api/auth/me
          </button>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
            Example: send LVLUP headers with HMAC(LVLUP_API_SECRET, method+path+timestamp)
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyRow({ label, value, secret = false }: { label: string; value: string | undefined; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const safe = value ?? "";
  const display = secret ? "•".repeat(Math.min(safe.length, 16)) : safe;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", alignItems: "center", gap: 8 }}>
      <div style={{ opacity: 0.9 }}>{label}</div>
      <input
        readOnly
        value={display}
        style={{ padding: 8, color: "cyan", border: "1px solid white", borderRadius: 6, background: "transparent" }}
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(safe);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        style={{
          padding: "6px 10px",
          border: "1px solid white",
          borderRadius: 6,
          background: "transparent",
          color: "white",
        }}
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
    <button
      onClick={download}
      style={{
        padding: "6px 10px",
        border: "1px solid white",
        borderRadius: 6,
        background: "transparent",
        color: "white",
      }}
    >
      Download .env
    </button>
  );
}
