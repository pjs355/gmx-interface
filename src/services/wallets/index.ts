import { CHAIN_ID } from "config/chains";
type ChainId = typeof CHAIN_ID;
import { SELECTED_NETWORK_LOCAL_STORAGE_KEY } from "config/localStorage";
import { UncheckedJsonRpcSigner } from "@/services/rpc/UncheckedJsonRpcSigner";
import { base } from "viem/chains";

export type NetworkMetadata = {
	chainId: string;
	chainName: string;
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
	rpcUrls: string[];
	blockExplorerUrls: string[];
};

export type WalletSigner = UncheckedJsonRpcSigner & {
	address: string;
};

export async function switchNetwork(
	chainId: number,
	active: boolean
): Promise<void> {
	const targetChainId = base.id as unknown as ChainId;
	if (chainId !== (targetChainId as unknown as number)) {
		// Enforce Base only
		// eslint-disable-next-line no-console
		console.warn("Only Base network is supported. Forcing Base chain.");
	}

	// Persist forced chain selection
	localStorage.setItem(
		SELECTED_NETWORK_LOCAL_STORAGE_KEY,
		String(targetChainId)
	);

	// With Privy-only flow, we do not programmatically switch via RainbowKit/wagmi.
	// If a reload is expected by callers when inactive, keep behavior.
	if (!active) {
		document.location.reload();
	}
}

export function shortenAddressOrEns(address: string, length: number) {
	if (!length) {
		return "";
	}
	if (!address) {
		return address;
	}
	if (address.length < 10 || address.length < length) {
		return address;
	}
	let left = address.includes(".")
		? address.split(".")[1].length
		: Math.floor((length - 3) / 2) + 1;
	return (
		address.substring(0, left) +
		"..." +
		address.substring(
			address.length - (length - (left + 3)),
			address.length
		)
	);
}
