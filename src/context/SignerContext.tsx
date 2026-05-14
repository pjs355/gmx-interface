import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { DEBUG_ACCOUNT_OVERRIDE_KEY } from "config/localStorage";
import { getCTFAddress, getUSDCAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { fetchNonZeroCtfBalancesRpc } from "@/helpers/fetchNonZeroCtfBalancesRpc";
import { findEvmPrivyEmbeddedWallet, type PrivyWalletListEntry } from "@/trading/polymarket/privyEmbeddedWallet";

type SignerContextValue = {
  authenticated: boolean;
  user: any | null;
  walletType: 'smart' | 'embedded' | 'external' | 'none';
  account: string | undefined; // unified data address for reads (smart -> embedded -> external)
  signer: any | undefined; // ethers signer for embedded/external
  signerAddress: string | undefined; // address tied to signer
  hasSmartWallet: boolean;
  hasEmbeddedWallet: boolean;
  hasExternalWallet: boolean;
  ready: boolean; // true when computed for current auth/wallets state
  /**
   * Surface the most recent signer-resolution failure, if any. Previously
   * `resolveSigner` swallowed every error silently and reported
   * `walletType: 'none'`, which made Privy / EIP-1193 hiccups look identical
   * to "user logged out". UI code should treat a non-null `error` as a
   * recoverable warning (offer "Retry"); a null `error` with `walletType:
   * 'none'` is the genuine logged-out state.
   */
  error: string | null;
  refresh: () => Promise<void>;
  // Debug mode properties
  isDebugMode: boolean; // true when DEBUG_ACCOUNT_OVERRIDE is set
  debugAccount: string | undefined; // the override address (if set)
  realAccount: string | undefined; // the actual logged-in account (even when spoofing)
};

// Helper to get debug account from localStorage
function getDebugAccountOverride(): string | undefined {
  try {
    const override = localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
    if (override && override.startsWith('0x') && override.length === 42) {
      return override;
    }
  } catch (e) {
    // localStorage might be unavailable
  }
  return undefined;
}

const SignerContext = createContext<SignerContextValue | null>(null);

export function SignerProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user } = usePrivy();
  const { wallets } = usePrivyWallets();
  const [signer, setSigner] = useState<any | undefined>(undefined);
  const [signerAddress, setSignerAddress] = useState<string | undefined>(undefined);
  const [account, setAccount] = useState<string | undefined>(undefined);
  const [realAccount, setRealAccount] = useState<string | undefined>(undefined);
  const [walletType, setWalletType] = useState<'smart' | 'embedded' | 'external' | 'none'>('none');
  const [hasSmartWallet, setHasSmartWallet] = useState<boolean>(false);
  const [hasEmbeddedWallet, setHasEmbeddedWallet] = useState<boolean>(false);
  const [hasExternalWallet, setHasExternalWallet] = useState<boolean>(false);
  const [ready, setReady] = useState(false);
  const [signerError, setSignerError] = useState<string | null>(null);
  
  // Debug mode state
  const [debugAccount, setDebugAccount] = useState<string | undefined>(getDebugAccountOverride);
  const isDebugMode = Boolean(debugAccount);

  const resolveSigner = useCallback(async () => {
    // Check for debug override on each resolve
    const currentDebugOverride = getDebugAccountOverride();
    setDebugAccount(currentDebugOverride);
    
    // Single, authoritative resolution based on Privy state
    setSignerError(null);
    try {
      if (!authenticated) {
        setSigner(undefined);
        setSignerAddress(undefined);
        setRealAccount(undefined);
        // In debug mode, still allow viewing data even when not authenticated
        setAccount(currentDebugOverride);
        setWalletType('none');
        setHasSmartWallet(false);
        setHasEmbeddedWallet(false);
        setHasExternalWallet(false);
        setReady(true);
        
        if (currentDebugOverride) {
          console.warn('🔧 DEBUG MODE ACTIVE (unauthenticated): Viewing data for', currentDebugOverride);
        }
        return;
      }

      const smartLinked: any = ((user as any)?.linkedAccounts || []).find((a: any) => a?.type === 'smart_wallet');
      const smartAddress = (smartLinked?.address as string | undefined);
      const embedded = findEvmPrivyEmbeddedWallet(
        (wallets || []) as readonly PrivyWalletListEntry[]
      );
      const external = (wallets || []).find((w: any) => w?.type === 'wallet' || w?.connectorType !== 'privy');

      const hasSmart = Boolean(smartAddress);
      const hasEmb = Boolean(embedded?.address);
      const hasExt = Boolean(external?.address);

      setHasSmartWallet(hasSmart);
      setHasEmbeddedWallet(hasEmb);
      setHasExternalWallet(hasExt);

      // Account (read address) priority: smart -> embedded -> external
      const unifiedAccount = smartAddress || embedded?.address || (!hasSmart ? external?.address : undefined) || undefined;
      setRealAccount(unifiedAccount);
      
      // Apply debug override if present, otherwise use real account
      if (currentDebugOverride) {
        setAccount(currentDebugOverride);
        console.warn('🔧 DEBUG MODE ACTIVE: Spoofing account', currentDebugOverride, '(real account:', unifiedAccount, ')');
      } else {
        setAccount(unifiedAccount);
      }

      // Signer selection:
      // - If smart wallet exists, prefer embedded signer only; do NOT fall back to external
      // - If no smart wallet, allow embedded then external
      const chosenForSigner = hasSmart ? embedded : (embedded || external);
      if (!chosenForSigner || typeof chosenForSigner.getEthereumProvider !== 'function') {
        setSigner(undefined);
        setSignerAddress(undefined);
        setWalletType(hasSmart ? 'smart' : 'none');
        setReady(true);
        return;
      }

      const eip1193 = await chosenForSigner.getEthereumProvider();
      const provider = new ethers.BrowserProvider(eip1193 as any);
      const s = await provider.getSigner();
      const addr = await s.getAddress?.();
      setSigner(s);
      setSignerAddress(addr);
      const nextType: 'smart' | 'embedded' | 'external' | 'none' = hasSmart ? 'smart' : (embedded ? 'embedded' : (external ? 'external' : 'none'));
      setWalletType(nextType);
      setReady(true);
    } catch (err) {
      // Previously a silent `catch {}` — that turned a Privy / EIP-1193
      // hiccup into "walletType: 'none'" which UI couldn't distinguish from
      // an actual logged-out user. Log + surface so callers can react.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SignerContext] resolveSigner failed:', err);
      setSignerError(msg);
      setSigner(undefined);
      setSignerAddress(undefined);
      setWalletType('none');
      setReady(true);
    }
  }, [authenticated, user?.linkedAccounts, wallets]);

  // Minimal signature of wallets to detect real changes without heavy diffs
  const walletsSignature = useMemo(
    () => JSON.stringify((wallets || []).map((w: any) => ({ type: w?.type, address: w?.address, connectorType: w?.connectorType }))),
    [wallets]
  );

  useEffect(() => {
    setReady(false);
    // Resolve immediately on any relevant change; no polling/intervals
    resolveSigner();
    // Re-evaluate when wallets actually change shape or auth/user changes
  }, [authenticated, walletsSignature, user?.linkedAccounts, resolveSigner]);

  const value = useMemo<SignerContextValue>(() => ({
    authenticated: !!authenticated,
    user: user ?? null,
    walletType,
    account,
    signer,
    signerAddress,
    hasSmartWallet,
    hasEmbeddedWallet,
    hasExternalWallet,
    ready,
    error: signerError,
    refresh: resolveSigner,
    // Debug mode properties
    isDebugMode,
    debugAccount,
    realAccount,
  }), [authenticated, user, walletType, account, signer, signerAddress, hasSmartWallet, hasEmbeddedWallet, hasExternalWallet, ready, signerError, resolveSigner, isDebugMode, debugAccount, realAccount]);

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export function useSignerContext(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error("useSignerContext must be used within a SignerProvider");
  return ctx;
}

// =============================================================================
// DEBUG HELPER FUNCTIONS (accessible from browser console)
// =============================================================================

/**
 * Spoof another user's account to view their portfolio (read-only)
 * Usage from browser console: spoofAccount('0x...')
 */
(window as any).spoofAccount = (address: string) => {
  if (!address) {
    console.error('❌ Please provide a wallet address: spoofAccount("0x...")');
    return;
  }
  if (!address.startsWith('0x') || address.length !== 42) {
    console.error('❌ Invalid address format. Must be a 42-character hex address starting with 0x');
    return;
  }
  localStorage.setItem(DEBUG_ACCOUNT_OVERRIDE_KEY, address);
  console.log('✅ Debug account set to:', address);
  console.log('🔄 Refresh the page to view their portfolio (read-only mode)');
  console.log('💡 To clear: clearSpoof()');
};

/**
 * Clear the spoofed account and return to normal mode
 * Usage from browser console: clearSpoof()
 */
(window as any).clearSpoof = () => {
  localStorage.removeItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  console.log('✅ Debug account cleared. Refresh the page to return to your normal account.');
};

/**
 * Check current spoof status
 * Usage from browser console: checkSpoof()
 */
(window as any).checkSpoof = () => {
  const current = localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  if (current) {
    console.log('🔧 DEBUG MODE ACTIVE');
    console.log('   Spoofing account:', current);
    console.log('   To clear: clearSpoof()');
  } else {
    console.log('✅ Normal mode (no account spoofing)');
    console.log('   To spoof: spoofAccount("0x...")');
  }
};

// =============================================================================
// BALANCE VERIFICATION DEBUG TOOLS (RPC-only — LevelUp subgraph removed)
// =============================================================================

interface RpcTokenRow {
  tokenId: string;
  rpcBalance: string;
}

interface BalanceReport {
  address: string;
  timestamp: string;
  usdcRpc: string;
  rpcTokens: RpcTokenRow[];
  tokenCountChecked: number;
  summary: string;
}

function getDebugProvider(): JsonRpcProvider {
  return new JsonRpcProvider(DEFAULT_RPC_URL);
}

async function fetchTokenBalanceRpc(
  provider: JsonRpcProvider,
  walletAddress: string,
  tokenId: string
): Promise<string> {
  const ctfContract = new Contract(
    getCTFAddress(),
    ["function balanceOf(address account, uint256 id) view returns (uint256)"],
    provider
  );

  try {
    const balance = await ctfContract.balanceOf(walletAddress, tokenId);
    return formatUnits(balance, 6);
  } catch (err) {
    console.error("error", err);
    return "ERROR";
  }
}

async function fetchUsdcBalanceRpc(
  provider: JsonRpcProvider,
  walletAddress: string
): Promise<string> {
  const usdcContract = new Contract(
    getUSDCAddress(),
    [
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)"
    ],
    provider
  );

  try {
    const [balance, decimals] = await Promise.all([
      usdcContract.balanceOf(walletAddress),
      usdcContract.decimals()
    ]);
    return formatUnits(balance, decimals);
  } catch (err) {
    console.error("error", err);
    return "ERROR";
  }
}

function resolveDebugAddress(explicit?: string): string | null {
  const fromArg = typeof explicit === "string" ? explicit.trim() : "";
  if (fromArg.startsWith("0x") && fromArg.length === 42) return fromArg;
  const spoof = localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  if (spoof && spoof.startsWith("0x") && spoof.length === 42) return spoof;
  return null;
}

/**
 * USDC plus optional CTF outcome balances for specific token IDs (must be supplied —
 * subgraph listing is gone). Examples:
 *   compareBalances()
 *   compareBalances(undefined, ["123...", "..."])
 *   compareBalances("0xabc...", tokenIdsFromApp)
 */
async function compareBalances(address?: string, tokenIds?: string[]): Promise<BalanceReport> {
  const targetAddress = resolveDebugAddress(address);

  if (!targetAddress) {
    throw new Error("No wallet address — pass compareBalances('0x...') or spoof an account first.");
  }

  const provider = getDebugProvider();
  const rpcUsdc = await fetchUsdcBalanceRpc(provider, targetAddress);

  console.log("\nRPC balance snapshot for", targetAddress);
  console.log("USDC (RPC):", rpcUsdc);

  const ids = Array.isArray(tokenIds)
    ? tokenIds.map((id) => String(id).trim()).filter((id) => id.length > 0)
    : [];

  let rpcTokens: RpcTokenRow[] = [];
  if (ids.length === 0) {
    console.log(
      "No token IDs supplied — skipping CTF scan. Pass a second argument: compareBalances(undefined, tokenIdArray)."
    );
  } else {
    const raw = await fetchNonZeroCtfBalancesRpc(provider, targetAddress, ids);
    rpcTokens = raw.map((r) => ({
      tokenId: r.tokenId,
      rpcBalance: formatUnits(r.balance, 6),
    }));
    rpcTokens.forEach((row, i) => {
      console.log(`${i + 1}. tokenId=${row.tokenId} balance=${row.rpcBalance}`);
    });
    console.log(`Non-zero CTF balances among ${ids.length} token ID(s): ${rpcTokens.length}`);
  }

  const summary =
    ids.length === 0
      ? "USDC (RPC only); pass tokenIds for CTF rows"
      : `USDC RPC + ${rpcTokens.length} non-zero outcome token balance(s)`;

  const report: BalanceReport = {
    address: targetAddress,
    timestamp: new Date().toISOString(),
    usdcRpc: rpcUsdc,
    rpcTokens,
    tokenCountChecked: ids.length,
    summary,
  };
  (window as any).__lastBalanceReport = report;
  console.log("Report stored on window.__lastBalanceReport:", summary);

  return report;
}

async function checkTokenBalance(tokenId: string, address?: string): Promise<void> {
  const targetAddress = resolveDebugAddress(address);

  if (!targetAddress) {
    console.error("No address — use checkTokenBalance('tokenId', '0x...') or spoof an account first.");
    return;
  }

  console.log("\nChecking CTF outcome balance for token", tokenId, "wallet", targetAddress);

  const provider = getDebugProvider();
  const rpcBal = await fetchTokenBalanceRpc(provider, targetAddress, tokenId);

  console.log("RPC:", rpcBal);
}

/**
 * Prints non-zero RPC balances among the given ERC1155 token IDs.
 * Usage: listPositions(['id1','id2'], '0x...') — address optional when spoof is set.
 */
async function listPositions(tokenIds: string[], address?: string): Promise<void> {
  const targetAddress = resolveDebugAddress(address);

  if (!targetAddress) {
    console.error("No address — use listPositions(ids, '0x...') or spoof an account first.");
    return;
  }

  if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
    console.error("Pass an array of token IDs: listPositions(['...'], optionalAddress)");
    return;
  }

  const provider = getDebugProvider();
  const nz = await fetchNonZeroCtfBalancesRpc(provider, targetAddress, tokenIds);

  console.log(`\nNon-zero CTF balances for ${targetAddress}`);
  nz.forEach((row, i) => {
    console.log(`${i + 1}. ${row.tokenId} → ${formatUnits(row.balance, 6)}`);
  });
  console.log(`${nz.length} non-zero row(s)`);
}

function clearCache(): void {
  console.warn(
    "[SignerContext] LevelUp subgraph was removed; there is no client-side subgraph cache to clear."
  );
}

(window as any).compareBalances = compareBalances;
(window as any).checkTokenBalance = checkTokenBalance;
(window as any).listPositions = listPositions;
(window as any).clearCache = clearCache;

