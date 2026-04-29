/** Prefix for History batch `clientKey` when resolving by DFlow parent `eventTicker` (see `VenuePosition.dflowEventTicker`). */
export const DFLOW_HISTORY_CLIENT_KEY_PREFIX_EVENT = "dfevt:" as const;

/** Prefix for History batch `clientKey` when resolving by outcome SPL mint only. */
export const DFLOW_HISTORY_CLIENT_KEY_PREFIX_MINT = "df:" as const;

export function venueHistoryDflowEventClientKey(eventTicker: string): string {
	return `${DFLOW_HISTORY_CLIENT_KEY_PREFIX_EVENT}${eventTicker.trim()}`;
}

export function venueHistoryDflowMintClientKey(mint: string): string {
	return `${DFLOW_HISTORY_CLIENT_KEY_PREFIX_MINT}${mint.trim()}`;
}
