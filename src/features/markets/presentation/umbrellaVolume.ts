/** Home card label for `umbrella.volume.totalUsd` — rounded up, no decimals; explicit $0 when zero. */
export function formatUmbrellaCrossVenueVolumeLabel(totalUsd?: number | null): string | null {
	if (totalUsd == null || !Number.isFinite(totalUsd)) {
		return null;
	}
	if (totalUsd <= 0) {
		return "$0 Vol";
	}
	const rounded = Math.ceil(totalUsd);
	return `$${rounded.toLocaleString("en-US", { maximumFractionDigits: 0 })} Vol`;
}

/** Same volume row as esports match-winner cards; also World Cup games, groups, futures, awards. */
export function shouldShowHomeCardUmbrellaVolume(input: {
	useEsportsMatchWinnerCard: boolean;
	displayChildrenCount: number;
	isWorldCupListing: boolean;
}): boolean {
	if (input.useEsportsMatchWinnerCard) return true;
	if (input.displayChildrenCount === 1) return true;
	if (input.isWorldCupListing) return true;
	return false;
}
