import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

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
};

const SignerContext = createContext<SignerContextValue | null>(null);

export function SignerProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user } = usePrivy();
  const { wallets } = usePrivyWallets();
  const [signer, setSigner] = useState<any | undefined>(undefined);
  const [signerAddress, setSignerAddress] = useState<string | undefined>(undefined);
  const [account, setAccount] = useState<string | undefined>(undefined);
  const [walletType, setWalletType] = useState<'smart' | 'embedded' | 'external' | 'none'>('none');
  const [hasSmartWallet, setHasSmartWallet] = useState<boolean>(false);
  const [hasEmbeddedWallet, setHasEmbeddedWallet] = useState<boolean>(false);
  const [hasExternalWallet, setHasExternalWallet] = useState<boolean>(false);
  const [ready, setReady] = useState(false);

  const resolveSigner = useCallback(async () => {
    // Single, authoritative resolution based on Privy state
    try {
      if (!authenticated) {
        setSigner(undefined);
        setSignerAddress(undefined);
        setAccount(undefined);
        setWalletType('none');
        setHasSmartWallet(false);
        setHasEmbeddedWallet(false);
        setHasExternalWallet(false);
        setReady(true);
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
      setAccount(unifiedAccount);

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
    refresh: resolveSigner
  }), [authenticated, user, walletType, account, signer, signerAddress, hasSmartWallet, hasEmbeddedWallet, hasExternalWallet, ready, resolveSigner]);

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export function useSignerContext(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error("useSignerContext must be used within a SignerProvider");
  return ctx;
}


