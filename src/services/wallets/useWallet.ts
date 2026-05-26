import { useMemo } from "react";
import { base } from "viem/chains";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";

type EthersSigner = any; // Keep loose to avoid introducing new types across the app right now

function findSmartWalletAddress(linkedAccounts: any[] | undefined): string | undefined {
	return (linkedAccounts || []).find((acct: any) => acct?.type === "smart_wallet")?.address as
		| string
		| undefined;
}

async function eip1193ToEthersSigner(eip1193: any): Promise<EthersSigner | undefined> {
	if (!eip1193) return undefined;
	const { ethers } = await import("ethers");
	const provider = new ethers.BrowserProvider(eip1193 as any);
	return provider.getSigner();
}

export default function useWallet() {
	const { authenticated, user } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();

	const smartAddress = useMemo(
		() => findSmartWalletAddress(user?.linkedAccounts),
		[user?.linkedAccounts],
	);

	const externalAddress = useMemo(() => {
		const ext = (privyWallets || []).find(
			(w: any) => w?.type === "wallet" || w?.connectorType !== "privy",
		);
		return ext?.address as string | undefined;
	}, [privyWallets]);

	const embeddedAddress = useMemo(() => {
		const emb = (privyWallets || []).find(
			(w: any) =>
				w?.type === "embedded_wallet" ||
				w?.walletClientType === "privy" ||
				w?.connectorType === "privy",
		);
		return emb?.address as string | undefined;
	}, [privyWallets]);

	// Try to get any wallet address if the specific types don't work
	const anyWalletAddress = useMemo(() => {
		const anyWallet = (privyWallets || []).find((w: any) => w?.address);
		return anyWallet?.address as string | undefined;
	}, [privyWallets]);

	// Fallback to linked accounts if no wallets are found
	const linkedAccountAddress = useMemo(() => {
		if (privyWallets && privyWallets.length > 0) return undefined; // Only use if no wallets found
		const linkedWallet = (user?.linkedAccounts || []).find((acc: any) => acc?.type === "wallet");
		return (linkedWallet as any)?.address as string | undefined;
	}, [user?.linkedAccounts, privyWallets]);

	const hasSmartWallet = Boolean(smartAddress);

	const address = useMemo(() => {
		const resolvedAddress =
			smartAddress ??
			embeddedAddress ??
			externalAddress ??
			anyWalletAddress ??
			linkedAccountAddress ??
			undefined;
		return resolvedAddress;
	}, [smartAddress, embeddedAddress, externalAddress, anyWalletAddress, linkedAccountAddress]);

	const chainId = base.id;
	const isConnected = Boolean(
		authenticated && (address || (privyWallets && privyWallets.length > 0)),
	);

	const shouldUseSmartWallet = () => hasSmartWallet;

	const dataAddress = useMemo(() => {
		// For querying balances/positions:
		// 1) Prefer smart wallet when available
		// 2) Else prefer embedded wallet
		// 3) Else fall back to external
		// 4) Finally fall back to any wallet address or linked account
		return (
			smartAddress ??
			embeddedAddress ??
			externalAddress ??
			anyWalletAddress ??
			linkedAccountAddress ??
			undefined
		);
	}, [smartAddress, embeddedAddress, externalAddress, anyWalletAddress, linkedAccountAddress]);

	const getDataAddress = () => dataAddress;

	const getSmartSigner = async (): Promise<EthersSigner | undefined> => {
		// Prefer a wallet object that represents the smart/embedded wallet
		const smart = (privyWallets || []).find(
			(w: any) =>
				w?.type === "smart_wallet" ||
				w?.type === "embedded_wallet" ||
				w?.walletClientType === "privy",
		);
		if (smart && typeof smart.getEthereumProvider === "function") {
			const eip1193 = await smart.getEthereumProvider();
			return eip1193ToEthersSigner(eip1193);
		}
		return undefined;
	};

	const getExternalSigner = async (): Promise<EthersSigner | undefined> => {
		const ext = (privyWallets || []).find(
			(w: any) => w?.type === "wallet" || w?.connectorType !== "privy",
		);
		if (ext && typeof ext.getEthereumProvider === "function") {
			const eip1193 = await ext.getEthereumProvider();
			return eip1193ToEthersSigner(eip1193);
		}
		return undefined;
	};

	const getAnySigner = async (): Promise<EthersSigner | undefined> => {
		// Fallback to any wallet that has a provider
		const anyWallet = (privyWallets || []).find(
			(w: any) => w?.address && typeof w.getEthereumProvider === "function",
		);
		if (anyWallet) {
			const eip1193 = await anyWallet.getEthereumProvider();
			return eip1193ToEthersSigner(eip1193);
		}
		return undefined;
	};

	const getActiveSigner = async (): Promise<EthersSigner | undefined> => {
		if (shouldUseSmartWallet()) {
			const s = await getSmartSigner();
			if (s) return s;
		}
		const externalSigner = await getExternalSigner();
		if (externalSigner) return externalSigner;
		return getAnySigner();
	};

	/** Trading identity: maker (smart when available), signer address (embedded/external), and signer instance. */
	const getTradingIdentity = async (): Promise<{
		makerAddress?: string;
		signerAddress?: string;
		signer?: EthersSigner;
	}> => {
		const signer = await getActiveSigner();
		let signerAddress: string | undefined;
		try {
			signerAddress = signer ? await (signer as any).getAddress?.() : undefined;
		} catch {}

		// Maker priority: smart -> embedded -> external -> any wallet -> linked account
		const makerAddress =
			smartAddress ??
			embeddedAddress ??
			externalAddress ??
			anyWalletAddress ??
			linkedAccountAddress ??
			undefined;

		return { makerAddress, signerAddress, signer: signer as any };
	};

	// Legacy shape compatibility: expose a sync `signer` as undefined; callers that await should use getActiveSigner()
	const signer: EthersSigner | undefined = undefined;

	return {
		// addresses
		address,
		account: address, // Export account as an alias for address for compatibility
		smartAddress,
		embeddedAddress,
		externalAddress,
		anyWalletAddress,
		linkedAccountAddress,
		dataAddress,
		getDataAddress,

		// connection / chain
		isConnected,
		chainId,

		// preferences
		hasSmartWallet,
		shouldUseSmartWallet,

		// signers
		signer,
		getActiveSigner,
		getSmartSigner,
		getExternalSigner,
		getAnySigner,
		getTradingIdentity,
	};
}
