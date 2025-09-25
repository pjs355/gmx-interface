import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import useWallet from "lib/wallets/useWallet";

type SignerContextValue = {
  signer: any | undefined;
  signerAddress: string | undefined;
  ready: boolean;
  refresh: () => Promise<void>;
};

const SignerContext = createContext<SignerContextValue | null>(null);

export function SignerProvider({ children }: { children: React.ReactNode }) {
  const { authenticated } = usePrivy();
  const { wallets } = usePrivyWallets();
  const { getActiveSigner } = useWallet();
  const [signer, setSigner] = useState<any | undefined>(undefined);
  const [signerAddress, setSignerAddress] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const resolveSigner = useCallback(async () => {
    try {
      const s = await getActiveSigner();
      if (!s) {
        setSigner(undefined);
        setSignerAddress(undefined);
        setReady(false);
        return;
      }
      const addr = await s.getAddress?.();
      setSigner(s);
      setSignerAddress(addr);
      setReady(Boolean(addr));
    } catch {
      setSigner(undefined);
      setSignerAddress(undefined);
      setReady(false);
    }
  }, [getActiveSigner]);

  const resolvedOnceRef = useRef<boolean>(false);
  // Minimal signature of wallets to detect real changes without heavy diffs
  const walletsSignature = useMemo(
    () => JSON.stringify((wallets || []).map((w: any) => ({ type: w?.type, address: w?.address }))),
    [wallets]
  );

  useEffect(() => {
    setReady(false);
    let slowInterval: any;
    const t = setTimeout(() => {
      if (authenticated) {
        // Resolve once on auth, then only slow-refresh if still missing
        if (!resolvedOnceRef.current) {
          resolvedOnceRef.current = true;
          resolveSigner();
        }
        // If signer not yet available, reattempt every 20s (non-spam)
        slowInterval = setInterval(() => {
          if (!signerAddress) {
            resolveSigner();
          }
        }, 20000);
        // ready is controlled by resolveSigner when authenticated
      } else {
        resolvedOnceRef.current = false;
        setSigner(undefined);
        setSignerAddress(undefined);
        setReady(true);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      if (slowInterval) clearInterval(slowInterval);
    };
    // Re-evaluate when wallets actually change shape
  }, [authenticated, walletsSignature, resolveSigner, signerAddress]);

  const value = useMemo<SignerContextValue>(() => ({ signer, signerAddress, ready, refresh: resolveSigner }), [signer, signerAddress, ready, resolveSigner]);

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export function useSignerContext(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error("useSignerContext must be used within a SignerProvider");
  return ctx;
}


