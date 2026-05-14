import { ethers } from "ethers";

export function normalizeLimitlessEvmAddress(
	raw: string | undefined | null,
): string | null {
	const t = typeof raw === "string" ? raw.trim() : "";
	if (!t) return null;
	try {
		return ethers.getAddress(t);
	} catch {
		return null;
	}
}

function collectUserLimitlessEvmAddresses(input: {
	fundTarget?: string;
	signerAddress?: string;
	account?: string;
	embeddedEoa?: string;
}): Set<string> {
	const s = new Set<string>();
	for (const k of [
		input.fundTarget,
		input.signerAddress,
		input.account,
		input.embeddedEoa,
	] as const) {
		const n = normalizeLimitlessEvmAddress(k ?? undefined);
		if (n) s.add(n.toLowerCase());
	}
	return s;
}

/**
 * Resolves the Limitless EIP-712 `maker` for this browser session and whether
 * the venue row still describes a partner-managed server wallet (deprecated).
 *
 * - When the API maker matches any user-controlled Base identity → EOA path.
 * - When it does not, but the browser signer (or embedded / fund target) is a
 *   known user wallet → treat the venue maker as **stale** and use the first
 *   preferred signing identity as `effectiveMaker` (must match `signer.getAddress()`).
 * - Otherwise → delegated server sub-account (approvals + collateral live on
 *   Limitless-managed maker only).
 */
export function classifyLimitlessClientMaker(input: {
	venueMakerFromApi: string;
	fundTarget?: string;
	signerAddress?: string;
	account?: string;
	embeddedEoa?: string;
}): {
	effectiveMaker: string;
	isDelegatedServerWalletSubAccount: boolean;
} {
	const vm = normalizeLimitlessEvmAddress(input.venueMakerFromApi);
	if (!vm) {
		throw new Error("Limitless maker missing or invalid.");
	}
	const userAddrs = collectUserLimitlessEvmAddresses({
		fundTarget: input.fundTarget,
		signerAddress: input.signerAddress,
		account: input.account,
		embeddedEoa: input.embeddedEoa,
	});
	if (userAddrs.size === 0) {
		return {
			effectiveMaker: vm,
			isDelegatedServerWalletSubAccount: false,
		};
	}
	if (userAddrs.has(vm.toLowerCase())) {
		return {
			effectiveMaker: vm,
			isDelegatedServerWalletSubAccount: false,
		};
	}
	for (const pick of [
		input.signerAddress,
		input.embeddedEoa,
		input.fundTarget,
		input.account,
	] as const) {
		const n = normalizeLimitlessEvmAddress(pick);
		if (n && userAddrs.has(n.toLowerCase())) {
			return {
				effectiveMaker: n,
				isDelegatedServerWalletSubAccount: false,
			};
		}
	}
	return {
		effectiveMaker: vm,
		isDelegatedServerWalletSubAccount: true,
	};
}
