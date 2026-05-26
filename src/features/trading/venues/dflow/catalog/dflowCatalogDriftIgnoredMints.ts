/**
 * Legacy DFlow outcome mints that still have wallet balance but were never wired on
 * umbrella `exchangeMatching.dflow` (old trades / pre-catalog code). Suppress dev
 * catalog-drift warnings for these only; new drift mints still warn.
 */
const DFLOW_CATALOG_DRIFT_IGNORED_MINTS = new Set<string>([
	"2RtwfdAyfsNmEd2yZZwcqvWzUhPbBFffB9QSZbPeWZVu",
	"444eqN6L3mfZbKjUNCK9H9ahAUZhCK1iLAg7HGN88uw9",
	"4yqetMiVKnzdm5scszUP2ntKHBQ5MAmw6TgFU1N9FLx1",
	"8YBzQf8PFeHJ5UKnfEweUpfCsfj34UCht1DxGqy5Whem",
	"B1DX2XEkHQydFZGP7Nt8AYR6BfjtxVCc1QTNevmToyZu",
	"CMAfVxSfDqJy6qmdiKwSCxu5XVKBHeWECYSKx5HD93so",
	"DVCCuGgXeu9r1sCs6YwhNKPFdRcXqFCfywrRNbE9955S",
]);

export function isDflowCatalogDriftIgnoredMint(mint: string): boolean {
	const key = mint.trim();
	return key.length > 0 && DFLOW_CATALOG_DRIFT_IGNORED_MINTS.has(key);
}
