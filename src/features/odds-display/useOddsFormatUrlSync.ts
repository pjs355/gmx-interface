import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import {
	ODDS_FORMAT_QUERY_KEY,
	parseFormatQueryParam,
	searchParamsFormatMatches,
	syncFormatInSearchParams,
} from "@/features/odds-display/oddsFormatQuery";

/**
 * Keeps umbrella page `?format=` in sync with OddsDisplayContext (share links + OG PNG).
 */
export function useOddsFormatUrlSync(): void {
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();
	const [searchParams, setSearchParams] = useSearchParams();
	const urlToContextRef = useRef(false);
	const contextToUrlRef = useRef(false);
	const bootstrappedRef = useRef(false);
	const oddsDisplayStyleRef = useRef(oddsDisplayStyle);
	oddsDisplayStyleRef.current = oddsDisplayStyle;

	// URL → context (shared link or back/forward only — not when the menu changes context)
	useEffect(() => {
		if (contextToUrlRef.current) {
			contextToUrlRef.current = false;
			return;
		}
		if (!searchParams.has(ODDS_FORMAT_QUERY_KEY)) return;
		const fromUrl = parseFormatQueryParam(searchParams.get(ODDS_FORMAT_QUERY_KEY));
		if (fromUrl === oddsDisplayStyleRef.current) return;
		urlToContextRef.current = true;
		setOddsDisplayStyle(fromUrl);
	}, [searchParams, setOddsDisplayStyle]);

	// Context → URL (odds menu / profile preference on this page)
	useEffect(() => {
		if (urlToContextRef.current) {
			urlToContextRef.current = false;
			return;
		}
		if (searchParamsFormatMatches(searchParams, oddsDisplayStyle)) return;
		contextToUrlRef.current = true;
		setSearchParams((prev) => syncFormatInSearchParams(prev, oddsDisplayStyle), {
			replace: true,
		});
	}, [oddsDisplayStyle, searchParams, setSearchParams]);

	// First paint: reflect stored non-default preference in the address bar for shareable URLs
	useEffect(() => {
		if (bootstrappedRef.current) return;
		bootstrappedRef.current = true;
		if (searchParams.has(ODDS_FORMAT_QUERY_KEY)) return;
		if (oddsDisplayStyle === "default") return;
		contextToUrlRef.current = true;
		setSearchParams((prev) => syncFormatInSearchParams(prev, oddsDisplayStyle), {
			replace: true,
		});
	}, [oddsDisplayStyle, searchParams, setSearchParams]);
}
