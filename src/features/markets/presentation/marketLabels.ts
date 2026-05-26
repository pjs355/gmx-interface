// Helper function to truncate market name
export const truncateMarketName = (name: string, maxLength: number = 25) => {
	if (name.length <= maxLength) return name;
	return name.substring(0, maxLength - 3) + "...";
};

/** Compact label for match-winner buttons: first word when multi-word, else truncate with ellipsis. */
export const shortenTeamLabelForButton = (name: string, maxChars: number = 14): string => {
	const trimmed = name.trim();
	if (!trimmed) return trimmed;

	const firstSpace = trimmed.search(/\s/);
	let candidate = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace).trim();
	if (!candidate) candidate = trimmed;

	const ellipsis = "…";
	if (candidate.length > maxChars) {
		const keep = Math.max(1, maxChars - ellipsis.length);
		return candidate.slice(0, keep) + ellipsis;
	}
	return candidate;
};
