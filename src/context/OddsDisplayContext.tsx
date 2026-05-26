import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
	formatAvgOddsValue,
	formatOddsPrice,
	parseOddsDisplayStyle,
	type OddsDisplayStyle,
	type OddsPriceLayout,
} from "@/features/odds-display/oddsDisplayFormat";
import { ODDS_DISPLAY_STYLE_STORAGE_KEY } from "@/config/localStorage";

type OddsDisplayContextValue = {
	oddsDisplayStyle: OddsDisplayStyle;
	setOddsDisplayStyle: (style: OddsDisplayStyle) => void;
	/** Convenience for Profile toggle (V1). */
	setAmericanOddsEnabled: (enabled: boolean) => void;
	formatPrice: (p: number | null | undefined, layout?: OddsPriceLayout) => string;
	formatAvgOdds: (p: number | null | undefined) => string;
};

const OddsDisplayContext = createContext<OddsDisplayContextValue | null>(null);

function readStoredStyle(): OddsDisplayStyle {
	if (typeof window === "undefined") return "default";
	try {
		const raw = localStorage.getItem(ODDS_DISPLAY_STYLE_STORAGE_KEY);
		return parseOddsDisplayStyle(raw);
	} catch {
		return "default";
	}
}

export function OddsDisplayProvider({ children }: { children: React.ReactNode }) {
	const [oddsDisplayStyle, setStyleState] = useState<OddsDisplayStyle>(readStoredStyle);

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key !== ODDS_DISPLAY_STYLE_STORAGE_KEY || e.newValue == null) return;
			setStyleState(parseOddsDisplayStyle(e.newValue));
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const setOddsDisplayStyle = useCallback((style: OddsDisplayStyle) => {
		setStyleState(style);
		try {
			localStorage.setItem(ODDS_DISPLAY_STYLE_STORAGE_KEY, style);
		} catch {
			/* ignore */
		}
	}, []);

	const setAmericanOddsEnabled = useCallback(
		(enabled: boolean) => {
			setOddsDisplayStyle(enabled ? "american" : "default");
		},
		[setOddsDisplayStyle],
	);

	const formatPrice = useCallback(
		(p: number | null | undefined, layout: OddsPriceLayout = "cell") =>
			formatOddsPrice(p, oddsDisplayStyle, layout),
		[oddsDisplayStyle],
	);

	const formatAvgOdds = useCallback(
		(p: number | null | undefined) => formatAvgOddsValue(p, oddsDisplayStyle),
		[oddsDisplayStyle],
	);

	const value = useMemo(
		(): OddsDisplayContextValue => ({
			oddsDisplayStyle,
			setOddsDisplayStyle,
			setAmericanOddsEnabled,
			formatPrice,
			formatAvgOdds,
		}),
		[oddsDisplayStyle, setOddsDisplayStyle, setAmericanOddsEnabled, formatPrice, formatAvgOdds],
	);

	return <OddsDisplayContext.Provider value={value}>{children}</OddsDisplayContext.Provider>;
}

export function useOddsDisplay(): OddsDisplayContextValue {
	const ctx = useContext(OddsDisplayContext);
	if (!ctx) {
		throw new Error("useOddsDisplay must be used within OddsDisplayProvider");
	}
	return ctx;
}

/** Safe when provider is missing (e.g. tests); falls back to default formatting. */
export function useOddsDisplayOptional(): OddsDisplayContextValue {
	const ctx = useContext(OddsDisplayContext);
	return (
		ctx ?? {
			oddsDisplayStyle: "default" as const,
			setOddsDisplayStyle: () => {},
			setAmericanOddsEnabled: () => {},
			formatPrice: (p, layout = "cell") => formatOddsPrice(p, "default", layout),
			formatAvgOdds: (p) => formatAvgOddsValue(p, "default"),
		}
	);
}
