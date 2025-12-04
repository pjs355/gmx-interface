import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { DEBUG_ACCOUNT_OVERRIDE_KEY } from "config/localStorage";

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

// Log available debug commands on load
console.log('🛠️ Debug commands available:');
console.log('   spoofAccount("0x...") - View another user\'s portfolio (read-only)');
console.log('   clearSpoof() - Return to normal mode');
console.log('   checkSpoof() - Check current spoof status');


