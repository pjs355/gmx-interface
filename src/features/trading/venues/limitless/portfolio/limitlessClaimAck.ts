import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * All keys we register in `claimedMarkets` after a successful claim so Winnings
 * can hide the row even if `_id` vs `questionId` / `conditionId` diverge in the UI pipeline.
 *
 * For Limitless rows we store both `lx-win-…` and `limitless:0x…` so acks
 * match regardless of which id `handleClaimSuccess` received first.
 */
export function claimAckKeysFromMarket(market: PredictionMarket): string[] {
	const keys: string[] = [];
	const id = String(market._id ?? "").trim();
	if (id) keys.push(id);
	const venue = String((market as { _venue?: string })._venue ?? "").trim();
	if (venue === "limitless") {
		const cid = String(market.conditionId ?? "")
			.trim()
			.toLowerCase();
		if (cid.startsWith("0x") && cid.length === 66) {
			keys.push(`limitless:${cid}`);
		}
	}
	return keys;
}

export function isMarketClaimAcked(
	market: PredictionMarket,
	claimedMarkets: ReadonlySet<string>,
): boolean {
	for (const k of claimAckKeysFromMarket(market)) {
		if (claimedMarkets.has(k)) return true;
	}
	return false;
}

/**
 * Partner `redeemable: false` referred to **HTTP** portfolio redeem (server-wallet flow).
 * EOA winnings are redeemed **on-chain** from the maker wallet, so we no longer disable
 * the Winnings Claim control from this flag alone.
 */
export function isLimitlessWinningsTabClaimBlocked(_market: PredictionMarket): boolean {
	return false;
}

/** Every row in this merged Winnings group is Limitless with partner `redeemable: false`. */
export function allWinningsMarketsAreLimitlessSettlementBlocked(
	rows: Array<{ market: PredictionMarket }>,
): boolean {
	if (rows.length === 0) return false;
	return rows.every(({ market }) => isLimitlessWinningsTabClaimBlocked(market));
}

/** Hover copy when legacy partner rows still carry `redeemable: false` (HTTP redeem hint only). */
export const LIMITLESS_WINNINGS_CLAIM_BLOCKED_TOOLTIP =
	"Limitless sent `redeemable: false` on this row (legacy server-wallet HTTP redeem hint). EOA accounts redeem on Base from your Limitless maker wallet; if Claim fails, try https://limitless.exchange or wait for on-chain CTF settlement.";
