import { useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { useEffect, useState } from "react";

import { UncheckedJsonRpcSigner } from "lib/rpc/UncheckedJsonRpcSigner";
import type { WalletSigner } from ".";

/** Hook to provide an ethers.js Signer from Privy wallets (no wagmi). */
export function useEthersSigner(): WalletSigner | undefined {
  const { wallets: privyWallets } = usePrivyWallets();
  const [signer, setSigner] = useState<WalletSigner | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function resolveSigner() {
      try {
        // Prefer embedded/smart wallet first
        const smart = (privyWallets || []).find(
          (w: any) => w?.type === "smart_wallet" || w?.type === "embedded_wallet" || w?.walletClientType === "privy"
        );
        const ext = (privyWallets || []).find((w: any) => w?.type === "wallet" || w?.connectorType !== "privy");
        const chosen = smart || ext;

        if (!chosen || typeof chosen.getEthereumProvider !== "function") {
          if (!cancelled) setSigner(undefined);
          return;
        }

        const eip1193 = await chosen.getEthereumProvider();
        const provider = new ethers.BrowserProvider(eip1193 as any);
        const ethersSigner = await provider.getSigner();
        const unchecked = new UncheckedJsonRpcSigner(provider as any, await ethersSigner.getAddress());
        if (!(unchecked as any).address) {
          (unchecked as any).address = await ethersSigner.getAddress();
        }
        if (!cancelled) setSigner(unchecked as unknown as WalletSigner);
      } catch (e) {
        if (!cancelled) setSigner(undefined);
      }
    }

    resolveSigner();
    return () => {
      cancelled = true;
    };
  }, [privyWallets]);

  return signer;
}
