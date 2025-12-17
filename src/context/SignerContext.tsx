import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { DEBUG_ACCOUNT_OVERRIDE_KEY } from "config/localStorage";
import { CTF_ADDRESS, USDC_ADDRESS } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { subgraphService, fromMicroUnits } from "@/services/subgraph/subgraphService";

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
  
  // Debug mode state
  const [debugAccount, setDebugAccount] = useState<string | undefined>(getDebugAccountOverride);
  const isDebugMode = Boolean(debugAccount);

  const resolveSigner = useCallback(async () => {
    // Check for debug override on each resolve
    const currentDebugOverride = getDebugAccountOverride();
    setDebugAccount(currentDebugOverride);
    
    // Single, authoritative resolution based on Privy state
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
      const embedded = (wallets || []).find((w: any) => w?.type === 'embedded_wallet' || w?.walletClientType === 'privy' || w?.connectorType === 'privy');
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
    } catch {
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
    refresh: resolveSigner,
    // Debug mode properties
    isDebugMode,
    debugAccount,
    realAccount,
  }), [authenticated, user, walletType, account, signer, signerAddress, hasSmartWallet, hasEmbeddedWallet, hasExternalWallet, ready, resolveSigner, isDebugMode, debugAccount, realAccount]);

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
// BALANCE VERIFICATION DEBUG TOOLS
// =============================================================================

interface BalanceComparison {
  tokenId: string;
  subgraphBalance: string;
  rpcBalance: string;
  match: boolean;
  difference: string;
}

interface BalanceReport {
  address: string;
  timestamp: string;
  usdcSubgraph: string;
  usdcRpc: string;
  usdcMatch: boolean;
  tokenBalances: BalanceComparison[];
  totalTokens: number;
  matchingTokens: number;
  mismatchedTokens: number;
  summary: string;
}

/**
 * Get a read-only JSON RPC provider
 */
function getDebugProvider(): JsonRpcProvider {
  return new JsonRpcProvider(DEFAULT_RPC_URL);
}

/**
 * Fetch a single ERC1155 token balance via RPC
 */
async function fetchTokenBalanceRpc(
  provider: JsonRpcProvider,
  walletAddress: string,
  tokenId: string
): Promise<string> {
  const ctfContract = new Contract(
    CTF_ADDRESS,
    ["function balanceOf(address account, uint256 id) view returns (uint256)"],
    provider
  );
  
  try {
    const balance = await ctfContract.balanceOf(walletAddress, tokenId);
    // Convert from 6 decimals (micro-units) to human readable
    return formatUnits(balance, 6);
  } catch (error) {
    console.error(`Error fetching balance for tokenId ${tokenId}:`, error);
    return "ERROR";
  }
}

/**
 * Fetch USDC balance via RPC
 */
async function fetchUsdcBalanceRpc(
  provider: JsonRpcProvider,
  walletAddress: string
): Promise<string> {
  const usdcContract = new Contract(
    USDC_ADDRESS,
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
  } catch (error) {
    console.error("Error fetching USDC balance:", error);
    return "ERROR";
  }
}

/**
 * Compare balances from Subgraph vs RPC for a given wallet
 * This is the main debug function for verifying data integrity
 */
async function compareBalances(address?: string): Promise<BalanceReport> {
  // Get address from localStorage override or parameter
  const targetAddress = address || localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  
  if (!targetAddress) {
    throw new Error("No address provided. Use compareBalances('0x...') or spoof an account first.");
  }
  
  const normalizedAddress = targetAddress.toLowerCase();
  console.log(`\n🔍 Comparing balances for: ${targetAddress}`);
  console.log("=".repeat(60));
  
  const provider = getDebugProvider();
  
  // Step 1: Fetch from Subgraph
  console.log("\n📊 Step 1: Fetching from Subgraph...");
  const subgraphAccount = await subgraphService.getUserAccount(normalizedAddress);
  
  if (!subgraphAccount) {
    console.log("⚠️  No subgraph account found for this address");
    return {
      address: targetAddress,
      timestamp: new Date().toISOString(),
      usdcSubgraph: "0",
      usdcRpc: await fetchUsdcBalanceRpc(provider, targetAddress),
      usdcMatch: false,
      tokenBalances: [],
      totalTokens: 0,
      matchingTokens: 0,
      mismatchedTokens: 0,
      summary: "No subgraph account found"
    };
  }
  
  const subgraphUsdc = fromMicroUnits(subgraphAccount.usdcBalance);
  console.log(`   USDC (Subgraph): ${subgraphUsdc}`);
  console.log(`   Token positions: ${subgraphAccount.tokenBalances.length}`);
  
  // Step 2: Fetch USDC from RPC
  console.log("\n🔗 Step 2: Fetching USDC from RPC...");
  const rpcUsdc = await fetchUsdcBalanceRpc(provider, targetAddress);
  console.log(`   USDC (RPC): ${rpcUsdc}`);
  
  // Step 3: Compare each token balance
  console.log("\n🔗 Step 3: Fetching token balances from RPC...");
  const tokenComparisons: BalanceComparison[] = [];
  
  // Filter to only tokens with non-zero balance in subgraph
  const nonZeroTokens = subgraphAccount.tokenBalances.filter(
    tb => BigInt(tb.balance) > 0n
  );
  
  console.log(`   Checking ${nonZeroTokens.length} non-zero token positions...`);
  
  // Batch RPC calls (fetch in parallel, but limit concurrency)
  const batchSize = 10;
  for (let i = 0; i < nonZeroTokens.length; i += batchSize) {
    const batch = nonZeroTokens.slice(i, i + batchSize);
    const batchPromises = batch.map(async (tb) => {
      const subgraphBal = fromMicroUnits(tb.balance);
      const rpcBal = await fetchTokenBalanceRpc(provider, targetAddress, tb.tokenId);
      
      // Compare as numbers for proper floating point comparison
      const subgraphNum = parseFloat(subgraphBal);
      const rpcNum = parseFloat(rpcBal);
      const match = Math.abs(subgraphNum - rpcNum) < 0.000001; // Allow tiny floating point differences
      
      return {
        tokenId: tb.tokenId,
        subgraphBalance: subgraphBal,
        rpcBalance: rpcBal,
        match,
        difference: (rpcNum - subgraphNum).toFixed(6)
      };
    });
    
    const results = await Promise.all(batchPromises);
    tokenComparisons.push(...results);
    
    // Progress indicator
    console.log(`   Checked ${Math.min(i + batchSize, nonZeroTokens.length)}/${nonZeroTokens.length} tokens...`);
  }
  
  // Step 4: Analyze results
  const matchingTokens = tokenComparisons.filter(t => t.match).length;
  const mismatchedTokens = tokenComparisons.filter(t => !t.match).length;
  const usdcMatch = Math.abs(parseFloat(subgraphUsdc) - parseFloat(rpcUsdc)) < 0.000001;
  
  // Print results
  console.log("\n" + "=".repeat(60));
  console.log("📋 BALANCE COMPARISON REPORT");
  console.log("=".repeat(60));
  
  // USDC comparison
  console.log("\n💵 USDC Balance:");
  console.log(`   Subgraph: ${subgraphUsdc}`);
  console.log(`   RPC:      ${rpcUsdc}`);
  console.log(`   Match:    ${usdcMatch ? "✅ YES" : "❌ NO"}`);
  
  // Token comparison summary
  console.log("\n🎟️  Token Balances:");
  console.log(`   Total tokens with balance: ${nonZeroTokens.length}`);
  console.log(`   Matching: ${matchingTokens} ✅`);
  console.log(`   Mismatched: ${mismatchedTokens} ${mismatchedTokens > 0 ? "❌" : ""}`);
  
  // Show mismatches in detail
  if (mismatchedTokens > 0) {
    console.log("\n⚠️  MISMATCHED TOKENS:");
    console.log("-".repeat(60));
    tokenComparisons
      .filter(t => !t.match)
      .forEach(t => {
        console.log(`   TokenId: ${t.tokenId}`);
        console.log(`      Subgraph: ${t.subgraphBalance}`);
        console.log(`      RPC:      ${t.rpcBalance}`);
        console.log(`      Diff:     ${t.difference}`);
        console.log("");
      });
  }
  
  // Summary
  const allMatch = usdcMatch && mismatchedTokens === 0;
  const summary = allMatch
    ? `✅ All balances match! (USDC + ${matchingTokens} tokens)`
    : `⚠️ Found ${mismatchedTokens} token mismatches${!usdcMatch ? " + USDC mismatch" : ""}`;
  
  console.log("\n" + "=".repeat(60));
  console.log(summary);
  console.log("=".repeat(60) + "\n");
  
  const report: BalanceReport = {
    address: targetAddress,
    timestamp: new Date().toISOString(),
    usdcSubgraph: subgraphUsdc,
    usdcRpc: rpcUsdc,
    usdcMatch,
    tokenBalances: tokenComparisons,
    totalTokens: nonZeroTokens.length,
    matchingTokens,
    mismatchedTokens,
    summary
  };
  
  // Store report in window for later inspection
  (window as any).__lastBalanceReport = report;
  console.log("💡 Full report stored in window.__lastBalanceReport");
  
  return report;
}

/**
 * Quick check for a specific token ID
 */
async function checkTokenBalance(tokenId: string, address?: string): Promise<void> {
  const targetAddress = address || localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  
  if (!targetAddress) {
    console.error("No address provided. Use checkTokenBalance('tokenId', '0x...') or spoof an account first.");
    return;
  }
  
  console.log(`\n🔍 Checking token ${tokenId} for ${targetAddress}`);
  
  const provider = getDebugProvider();
  
  // Get from subgraph
  const subgraphAccount = await subgraphService.getUserAccount(targetAddress.toLowerCase());
  const subgraphToken = subgraphAccount?.tokenBalances.find(t => t.tokenId === tokenId);
  const subgraphBal = subgraphToken ? fromMicroUnits(subgraphToken.balance) : "0.000000";
  
  // Get from RPC
  const rpcBal = await fetchTokenBalanceRpc(provider, targetAddress, tokenId);
  
  console.log(`   Subgraph: ${subgraphBal}`);
  console.log(`   RPC:      ${rpcBal}`);
  
  const match = Math.abs(parseFloat(subgraphBal) - parseFloat(rpcBal)) < 0.000001;
  console.log(`   Match:    ${match ? "✅ YES" : "❌ NO"}`);
}

/**
 * List all token positions from subgraph for an address
 */
async function listPositions(address?: string): Promise<void> {
  const targetAddress = address || localStorage.getItem(DEBUG_ACCOUNT_OVERRIDE_KEY);
  
  if (!targetAddress) {
    console.error("No address provided. Use listPositions('0x...') or spoof an account first.");
    return;
  }
  
  console.log(`\n📊 Token positions for ${targetAddress}`);
  console.log("=".repeat(60));
  
  const subgraphAccount = await subgraphService.getUserAccount(targetAddress.toLowerCase());
  
  if (!subgraphAccount) {
    console.log("No account found in subgraph.");
    return;
  }
  
  console.log(`USDC Balance: ${fromMicroUnits(subgraphAccount.usdcBalance)}`);
  console.log(`\nToken Balances (${subgraphAccount.tokenBalances.length} total):`);
  
  // Only show non-zero
  const nonZero = subgraphAccount.tokenBalances.filter(t => BigInt(t.balance) > 0n);
  console.log(`Non-zero positions: ${nonZero.length}`);
  console.log("-".repeat(60));
  
  nonZero.forEach((t, i) => {
    console.log(`${i + 1}. TokenId: ${t.tokenId}`);
    console.log(`   Balance: ${fromMicroUnits(t.balance)}`);
  });
  
  console.log("=".repeat(60));
}

/**
 * Clear subgraph cache to force fresh data
 */
function clearCache(): void {
  subgraphService.clearSubgraphCache();
  console.log("✅ Subgraph cache cleared. Next query will fetch fresh data.");
}

// Expose debug functions to window
(window as any).compareBalances = compareBalances;
(window as any).checkTokenBalance = checkTokenBalance;
(window as any).listPositions = listPositions;
(window as any).clearCache = clearCache;

// Log available debug commands on load
console.log('🛠️ Debug commands available:');
console.log('   spoofAccount("0x...") - View another user\'s portfolio (read-only)');
console.log('   clearSpoof() - Return to normal mode');
console.log('   checkSpoof() - Check current spoof status');
console.log('');
console.log('📊 Balance verification commands:');
console.log('   compareBalances("0x...") - Compare subgraph vs RPC balances');
console.log('   listPositions("0x...") - List all token positions from subgraph');
console.log('   checkTokenBalance("tokenId", "0x...") - Check specific token balance');
console.log('   clearCache() - Clear subgraph cache for fresh data');


