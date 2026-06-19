import { isAddress } from "viem";
import type { VenueAddressChainMap } from "@/context/accountWallets";
import {
	BSC_MAINNET_USDT_ADDRESS,
	SOLANA_USDC_MINT,
	USDC_ADDRESS,
} from "@/config/addresses";

export type DepositDestinationId = "base-usdc" | "solana-usdc" | "bnb-usdt";

export const BASE_CAIP2 = "eip155:8453" as const;
export const BNB_CAIP2 = "eip155:56" as const;
/** Solana mainnet CAIP-2 for Privy deposit addresses (not `solana:mainnet`). */
export const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;

export type ResolvedDepositTarget = {
	id: DepositDestinationId;
	label: string;
	chainCaip2: string;
	tokenAddress: string;
	address: string;
};

export const DEPOSIT_DESTINATIONS: readonly {
	id: DepositDestinationId;
	label: string;
	chainCaip2: string;
	tokenAddress: string;
	vacmVenue: keyof VenueAddressChainMap;
	vacmAddressField: "walletAddress" | "signerAddress";
}[] = [
	{
		id: "base-usdc",
		label: "Base USDC",
		chainCaip2: BASE_CAIP2,
		tokenAddress: USDC_ADDRESS,
		vacmVenue: "levelup",
		vacmAddressField: "walletAddress",
	},
	{
		id: "solana-usdc",
		label: "Solana USDC",
		chainCaip2: SOLANA_CAIP2,
		tokenAddress: SOLANA_USDC_MINT,
		vacmVenue: "dflow",
		vacmAddressField: "walletAddress",
	},
	{
		id: "bnb-usdt",
		label: "BNB USDT",
		chainCaip2: BNB_CAIP2,
		tokenAddress: BSC_MAINNET_USDT_ADDRESS,
		vacmVenue: "predictfun",
		vacmAddressField: "signerAddress",
	},
];

function isValidSolanaAddress(addr: string): boolean {
	const t = addr.trim();
	return t.length >= 32 && t.length <= 44;
}

function isValidDepositAddress(id: DepositDestinationId, addr: string): boolean {
	if (id === "solana-usdc") return isValidSolanaAddress(addr);
	return isAddress(addr as `0x${string}`);
}

export function resolveDepositTarget(
	id: DepositDestinationId,
	vacm: VenueAddressChainMap | null,
): ResolvedDepositTarget | null {
	if (!vacm) return null;

	const dest = DEPOSIT_DESTINATIONS.find((d) => d.id === id);
	if (!dest) return null;

	const entry = vacm[dest.vacmVenue];
	const raw = entry[dest.vacmAddressField];
	if (!raw?.trim() || !isValidDepositAddress(id, raw)) return null;

	return {
		id: dest.id,
		label: dest.label,
		chainCaip2: dest.chainCaip2,
		tokenAddress: dest.tokenAddress,
		address: raw.trim(),
	};
}

export function resolveBaseFiatTarget(
	vacm: VenueAddressChainMap | null,
): ResolvedDepositTarget | null {
	return resolveDepositTarget("base-usdc", vacm);
}
