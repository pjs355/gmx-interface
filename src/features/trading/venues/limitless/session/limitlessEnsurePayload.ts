/** Reads `warmupMarketSlug` from a Limitless ensure-account payload. */
export function pickWarmupMarketSlugFromEnsureData(data: unknown): string | null {
	if (data == null || typeof data !== "object") return null;
	const w = (data as Record<string, unknown>).warmupMarketSlug;
	return typeof w === "string" && w.trim().length > 0 ? w.trim() : null;
}

/** Reads `limitlessAccount.makerAddress` from an ensure-account payload. */
export function pickLimitlessMakerFromEnsureData(data: unknown): string | null {
	if (data == null || typeof data !== "object") return null;
	const la = (data as Record<string, unknown>).limitlessAccount;
	if (la == null || typeof la !== "object") return null;
	const m = (la as Record<string, unknown>).makerAddress;
	return typeof m === "string" && m.trim().length > 0 ? m.trim() : null;
}
