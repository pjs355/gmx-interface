import { ethers } from "ethers";

export function normalizeLimitlessEvmAddress(raw: string | undefined | null): string | null {
	const t = typeof raw === "string" ? raw.trim() : "";
	if (!t) return null;
	try {
		return ethers.getAddress(t);
	} catch {
		return null;
	}
}
