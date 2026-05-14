import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * All keys we register in `claimedMarkets` after a successful claim so Winnings
 * can hide the row even if `_id` vs `questionId` / `conditionId` diverge in the UI pipeline.
 *
 * For Limitless delegated rows we store both `lx-win-…` and `limitless:0x…` so acks
 * match regardless of which id `handleClaimSuccess` received first.
 */
export function claimAckKeysFromMarket(market: PredictionMarket): string[] {
	const keys: string[] = [];
	const id = String(market._id ?? "").trim();
	if (id) keys.push(id);
	const venue = String((market as { _venue?: string })._venue ?? "").trim();
	if (venue === "limitless") {
		const cid = String(market.conditionId ?? "").trim().toLowerCase();
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
 * In-app Limitless Claim disabled only when the partner explicitly sent `redeemable: false`
 * (`_limitlessPartnerRedeemableSignal === "false"`). `omit` means the flag was missing upstream
 * — we allow Claim so users are not stuck when Limitless resolves the market but omits the field.
 */
export function isLimitlessWinningsTabClaimBlocked(market: PredictionMarket): boolean {
	const m = market as {
		_venue?: string;
		_limitlessPartnerRedeemableSignal?: string;
	};
	if (m._venue !== "limitless") return false;
	return m._limitlessPartnerRedeemableSignal === "false";
}

/** Every row in this merged Winnings group is Limitless with partner `redeemable: false`. */
export function allWinningsMarketsAreLimitlessSettlementBlocked(
	rows: Array<{ market: PredictionMarket }>,
): boolean {
	if (rows.length === 0) return false;
	return rows.every(({ market }) => isLimitlessWinningsTabClaimBlocked(market));
}

/** Hover copy when partner explicitly says this delegated position is not redeemable. */
export const LIMITLESS_WINNINGS_CLAIM_BLOCKED_TOOLTIP =
	"Limitless marked this server-wallet position as not redeemable (`redeemable: false`). If that looks wrong, try redeem on https://limitless.exchange or contact support — the outcome can still be resolved while redeem stays off in the API.";
