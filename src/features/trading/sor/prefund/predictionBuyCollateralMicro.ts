/**
 * Bigint path used by the prediction API in `helpers/orderbook.normalizeMakerTaker`
 * for a buy (USDC from maker).
 */
export function normalizeMakerTakerBuyMakerMicro(price: number, size: number): bigint {
	const ONE = 1_000_000n;
	const sizeMicro = BigInt(Math.max(0, Math.round((Number.isFinite(size) ? size : 0) * 1_000_000)));
	const priceMicro = BigInt(
		Math.max(0, Math.round((Number.isFinite(price) ? price : 0) * 1_000_000)),
	);
	return (priceMicro * sizeMicro) / ONE;
}

/**
 * USDC **micros** for the maker on a **BUY** — MUST match
 * `helpers/orderbook.normalizeMakerTaker` (same formula as prediction `POST /orders`).
 */
export function predictionBuyMakerMicroUsdc(shares: number, price: number): bigint {
	return normalizeMakerTakerBuyMakerMicro(price, shares);
}
