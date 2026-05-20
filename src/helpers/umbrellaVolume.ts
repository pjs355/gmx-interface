/** Home card label for `umbrella.volume.totalUsd` — rounded up, no decimals; explicit $0 when zero. */
export function formatUmbrellaCrossVenueVolumeLabel(
	totalUsd?: number | null,
): string | null {
	if (totalUsd == null || !Number.isFinite(totalUsd)) {
		return null;
	}
	if (totalUsd <= 0) {
		return "$0 Vol";
	}
	const rounded = Math.ceil(totalUsd);
	return `$${rounded.toLocaleString("en-US", { maximumFractionDigits: 0 })} Vol`;
}
