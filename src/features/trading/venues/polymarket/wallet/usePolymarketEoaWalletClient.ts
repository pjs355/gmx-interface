import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { polygon } from "viem/chains";

import type { Eip1193Like } from "./ethers5FromEip1193";
import {
	findEvmPrivyEmbeddedWallet,
	type PrivyWalletListEntry,
} from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";

export type PolymarketEoaClientState = {
	ready: boolean;
	address: `0x${string}` | undefined;
	walletClient: WalletClient | null;
	eip1193Provider: Eip1193Like | null;
	error: string | null;
	refresh: () => void;
};

/**
 * Viem WalletClient on Polygon for the Privy **embedded EOA** (Polymarket signer).
 * Stabilized: only re-creates the wallet client when the embedded wallet address changes,
 * not on every Privy `wallets` array re-render.
 */
export function usePolymarketEoaWalletClient(): PolymarketEoaClientState {
	const { authenticated, ready: privyReady } = usePrivy();
	const { wallets } = useWallets();
	const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
	const [eip1193Provider, setEip1193Provider] = useState<Eip1193Like | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [nonce, setNonce] = useState(0);

	const embedded =
		findEvmPrivyEmbeddedWallet((wallets || []) as readonly PrivyWalletListEntry[]) ?? null;
	const address = embedded?.address as `0x${string}` | undefined;

	// Stable ref to the wallet object — avoid re-triggering effect on array identity changes
	const embeddedRef = useRef(embedded);
	embeddedRef.current = embedded;

	const refresh = useCallback(() => setNonce((n) => n + 1), []);

	useEffect(() => {
		let cancelled = false;
		if (!privyReady || !authenticated || !address) {
			setWalletClient(null);
			setEip1193Provider(null);
			setError(null);
			return;
		}

		(async () => {
			try {
				const wallet = embeddedRef.current;
				if (!wallet || typeof wallet.getEthereumProvider !== "function") {
					setError("Embedded wallet has no Ethereum provider");
					setWalletClient(null);
					setEip1193Provider(null);
					return;
				}
				const provider = await wallet.getEthereumProvider();
				if (cancelled) return;
				const client = createWalletClient({
					account: address,
					chain: polygon,
					transport: custom(provider as import("viem").EIP1193Provider),
				});
				setWalletClient(client);
				setEip1193Provider(provider as Eip1193Like);
				setError(null);
			} catch (e) {
				if (!cancelled) {
					setWalletClient(null);
					setEip1193Provider(null);
					setError(e instanceof Error ? e.message : "Wallet client error");
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [privyReady, authenticated, address, nonce]);

	return {
		ready: Boolean(privyReady && authenticated && walletClient),
		address,
		walletClient,
		eip1193Provider,
		error,
		refresh,
	};
}
