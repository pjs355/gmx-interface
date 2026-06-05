/**
 * `?format=` query param for umbrella share URLs and OG previews.
 */

import {
	parseOddsDisplayStyle,
	type OddsDisplayStyle,
} from "@/features/odds-display/oddsDisplayFormat";

export const ODDS_FORMAT_QUERY_KEY = "format";

/** Parse `?format=` from the address bar. Accepts `cents` as alias for default (¢). */
export function parseFormatQueryParam(raw: string | null): OddsDisplayStyle {
	if (!raw) return "default";
	const t = raw.trim();
	if (t.length === 0) return "default";
	if (t === "cents") return "default";
	return parseOddsDisplayStyle(t);
}

/** Value for `?format=` when persisting to the URL; `null` means omit (default cents). */
export function formatQueryParamValue(style: OddsDisplayStyle): string | null {
	if (style === "default") return null;
	return style;
}

export function appendFormatQuery(baseUrl: string, style: OddsDisplayStyle): string {
	const param = formatQueryParamValue(style);
	if (param === null) return baseUrl;
	const sep = baseUrl.includes("?") ? "&" : "?";
	return `${baseUrl}${sep}${ODDS_FORMAT_QUERY_KEY}=${encodeURIComponent(param)}`;
}

export function syncFormatInSearchParams(
	params: URLSearchParams,
	style: OddsDisplayStyle,
): URLSearchParams {
	const next = new URLSearchParams(params);
	const param = formatQueryParamValue(style);
	if (param === null) {
		next.delete(ODDS_FORMAT_QUERY_KEY);
	} else {
		next.set(ODDS_FORMAT_QUERY_KEY, param);
	}
	return next;
}

export function searchParamsFormatMatches(
	params: URLSearchParams,
	style: OddsDisplayStyle,
): boolean {
	if (style === "default") return !params.has(ODDS_FORMAT_QUERY_KEY);
	return params.get(ODDS_FORMAT_QUERY_KEY) === formatQueryParamValue(style);
}
