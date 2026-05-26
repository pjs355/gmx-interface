import type { RouteLegBridge, SorChain } from "../core/sor-types";
import type { FundingAddressesInput } from "./fundingStableBalances";

/** Collateral slice keys used by {@link readFundingStableBalancesForChains}. */
export type FundingBalanceChainKey = SorChain | "limitlessMakerBase";

const EVM_RE = /^0x[a-fA-F0-9]{40}$/i;

export function hasFundingAddressForChain(
	chain: FundingBalanceChainKey,
	addrs: FundingAddressesInput,
): boolean {
	switch (chain) {
		case "base":
			return Boolean(addrs.baseSmartWallet && EVM_RE.test(addrs.baseSmartWallet));
		case "polygon":
			return Boolean(addrs.polymarketSafe && EVM_RE.test(addrs.polymarketSafe));
		case "bnb":
			return Boolean(addrs.embeddedEoa && EVM_RE.test(addrs.embeddedEoa));
		case "solana":
			return (
				Boolean(addrs.solanaAddress) &&
				addrs.solanaAddress!.length >= 32 &&
				addrs.solanaAddress!.length <= 44
			);
		case "limitlessMakerBase":
			return Boolean(addrs.limitlessMakerBase && EVM_RE.test(addrs.limitlessMakerBase));
	}
}

/**
 * On-chain collateral reads for a single SOR bridge corridor only.
 *
 * Includes `bridge.fromChain`, `bridge.toChain`, and Limitless maker when Base
 * is in the corridor or the destination is Limitless on Base.
 */
export function chainsForBridgeCorridor(opts: {
	bridge: RouteLegBridge;
	limitlessBaseDest: boolean;
}): FundingBalanceChainKey[] {
	const { bridge, limitlessBaseDest } = opts;
	const out = new Set<FundingBalanceChainKey>([bridge.fromChain, bridge.toChain]);
	if (limitlessBaseDest || bridge.fromChain === "base" || bridge.toChain === "base") {
		out.add("limitlessMakerBase");
	}
	return [...out];
}

/** @deprecated Use {@link chainsForBridgeCorridor} for SOR execute. Kept for Transfers/tests. */
export function chainsForBridgePrefund(opts: {
	bridge: RouteLegBridge;
	limitlessBaseDest: boolean;
	fundingAddresses: FundingAddressesInput;
}): FundingBalanceChainKey[] {
	const corridor = chainsForBridgeCorridor({
		bridge: opts.bridge,
		limitlessBaseDest: opts.limitlessBaseDest,
	});
	return corridor.filter((chain) => hasFundingAddressForChain(chain, opts.fundingAddresses));
}

/** All collateral slices — used by {@link readFundingStableBalancesHuman}. */
export function allFundingBalanceChainKeys(): FundingBalanceChainKey[] {
	return ["base", "polygon", "solana", "bnb", "limitlessMakerBase"];
}
