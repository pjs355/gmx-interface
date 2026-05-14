/**
 * Limitless venue API can return microscopic positive `shares` (rounding / partner
 * noise). Those rows blow up PnL % in Positions and add phantom second legs.
 */
export const LIMITLESS_VENUE_SHARES_MIN_MEANINGFUL = 0.01;

export function isLimitlessVenueSharesMeaningful(shares: number): boolean {
	return Number.isFinite(shares) && shares > LIMITLESS_VENUE_SHARES_MIN_MEANINGFUL;
}
