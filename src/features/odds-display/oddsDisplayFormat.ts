/**
 * Display-only odds formatting. Internal prices remain implied probability in [0, 1].
 * Surfaces should use `formatOddsPrice` / `formatAvgOddsValue` only.
 */

export type OddsDisplayStyle =
	| "default"
	| "american"
	| "decimal"
	| "multiplier"
	| "fractional"
	| "percentage"
	| "indonesian"
	| "hong_kong"
	| "malaysian";

export type OddsPriceLayout = "cell" | "dualWithCents";

const VALID_STYLES_LIST: OddsDisplayStyle[] = [
	"default",
	"american",
	"decimal",
	"multiplier",
	"fractional",
	"percentage",
	"indonesian",
	"hong_kong",
	"malaysian",
];

export const VALID_ODDS_DISPLAY_STYLES = new Set<OddsDisplayStyle>(VALID_STYLES_LIST);

const ODDS_DISPLAY_LABELS: Record<OddsDisplayStyle, string> = {
	default: "Price (¢)",
	american: "American",
	decimal: "Decimal (European)",
	multiplier: "Multiplier",
	fractional: "Fractional",
	percentage: "Percentage",
	hong_kong: "Hong Kong",
	indonesian: "Indonesian",
	malaysian: "Malaysian",
};

/** Profile / home picker — order matches storage union. */
export const ODDS_DISPLAY_SELECT_OPTIONS: ReadonlyArray<{
	value: OddsDisplayStyle;
	label: string;
}> = VALID_STYLES_LIST.map((value) => ({
	value,
	label: ODDS_DISPLAY_LABELS[value],
}));

/** Open-interval gate for ratio-based odds (decimal, HK, Indo, Malay, fractional, multiplier, percentage cell). */
const EPS_PROB = 1e-12;
const EPS_HK = 1e-12;

export function parseOddsDisplayStyle(raw: string | null): OddsDisplayStyle {
	if (!raw) return "default";
	const t = raw.trim() as OddsDisplayStyle;
	return VALID_ODDS_DISPLAY_STYLES.has(t) ? t : "default";
}

/**
 * Returns implied probability suitable for ratio odds display, or `null` when out of range / degenerate.
 */
export function parseProbForOdds(p: number | null | undefined): number | null {
	if (p === undefined || p === null || !Number.isFinite(p)) return null;
	if (p <= EPS_PROB || p >= 1 - EPS_PROB) return null;
	return p;
}

export function ratioOddsInputs(
	p: number | null | undefined,
): { p: number; hk: number; d: number } | null {
	const pp = parseProbForOdds(p);
	if (pp === null) return null;
	const hk = (1 - pp) / pp;
	const d = 1 / pp;
	if (hk < EPS_HK) return null;
	return { p: pp, hk, d };
}

export function impliedProbToAmericanOdds(p: number): number | null {
	if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
	if (p === 0.5) return 100;
	if (p > 0.5) return -Math.round((100 * p) / (1 - p));
	return Math.round((100 * (1 - p)) / p);
}

function gcd(a: number, b: number): number {
	let x = Math.abs(Math.round(a));
	let y = Math.abs(Math.round(b));
	while (y !== 0) {
		const t = y;
		y = x % y;
		x = t;
	}
	return x || 1;
}

/** Best rational approximator with bounded denominator; HK > 0. */
function hkToReducedFraction(
	hk: number,
	maxDenom = 1000,
): {
	num: number;
	den: number;
} | null {
	if (!Number.isFinite(hk) || hk <= 0) return null;
	let bestNum = 1;
	let bestDen = 1;
	let bestErr = Infinity;
	const cap = Math.min(maxDenom, 50_000);
	for (let den = 1; den <= cap; den++) {
		const num = Math.round(hk * den);
		if (num < 1) continue;
		const err = Math.abs(num / den - hk);
		if (err < bestErr) {
			bestErr = err;
			bestNum = num;
			bestDen = den;
			if (err < 1e-12) break;
		}
	}
	const g = gcd(bestNum, bestDen);
	const num = Math.round(bestNum / g);
	const den = Math.round(bestDen / g);
	if (num > 1_000_000 || den > 1_000_000) return null;
	return { num, den };
}

/** Trim trailing zeros after fixed decimals. */
function formatOddsDecimal(x: number): string {
	if (!Number.isFinite(x)) return "--";
	const ax = Math.abs(x);
	const places = ax >= 100 ? 2 : ax >= 10 ? 3 : 4;
	let s = x.toFixed(places).replace(/\.?0+$/, "");
	if (s === "-0") s = "0";
	return s;
}

/** Multiplier uses decimal odds rounded to exactly two fractional digits. */
function formatMultiplierPrefix(d: number): string {
	if (!Number.isFinite(d)) return "--";
	const rounded = Math.round(d * 100) / 100;
	return `×${rounded.toFixed(2)}`;
}

function formatHongKongLabel(hk: number): string {
	return formatOddsDecimal(hk);
}

function formatIndonesianLabel(hk: number): string {
	if (hk >= 1) return `+${formatOddsDecimal(hk)}`;
	return formatOddsDecimal(-1 / hk);
}

function formatMalaysianLabel(hk: number): string {
	if (hk >= 1) return `+${formatOddsDecimal(hk)}`;
	return formatOddsDecimal(-hk);
}

function formatFractionalLabel(hk: number): string | null {
	const fr = hkToReducedFraction(hk);
	if (!fr) return null;
	return `${fr.num}/${fr.den}`;
}

/** Strip trailing zeros after a fixed-point string (display only). */
function trimTrailingZerosFixed(s: string): string {
	return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/**
 * Implied probability (0–1) as a **¢** label where 100¢ = 100% implied.
 * Polymarket often quotes &lt;1¢ (e.g. 0.3¢); rounding to whole cents showed **0¢**.
 */
export function formatImpliedProbabilityAsCents(p: number | null | undefined): string {
	if (p === undefined || p === null || !Number.isFinite(p)) return "--";
	const clamped = Math.max(0, Math.min(1, p));
	const cents = clamped * 100;
	if (cents <= 0) return "0¢";
	if (cents < 1) {
		/** ≥0.01¢: cap at two decimals (portfolio / UI float noise e.g. 0.990331205¢ → 0.99¢). Below: keep finer precision so tiny quotes are not rounded to 0¢. */
		const maxFractionDigits = cents >= 0.01 ? 2 : 10;
		const formatted = new Intl.NumberFormat("en-US", {
			maximumFractionDigits: maxFractionDigits,
			minimumFractionDigits: 0,
		}).format(cents);
		const n = Number.parseFloat(formatted.replace(/,/g, ""));
		if (!Number.isFinite(n) || n <= 0) {
			return maxFractionDigits === 2 ? "<0.01¢" : "<0.0000000001¢";
		}
		return `${formatted}¢`;
	}
	return `${Math.round(cents)}¢`;
}

function appendDualWithCents(primary: string, p: number | null | undefined): string {
	if (primary === "--") return "--";
	if (p === undefined || p === null || !Number.isFinite(p)) return "--";
	const cents = formatImpliedProbabilityAsCents(Math.max(0, Math.min(1, p)));
	return `${primary} (${cents})`;
}

/** Same semantics as legacy `formatCentsLabel` — now preserves sub-cent implied quotes. */
export function formatCentsLabel(p: number | null | undefined): string {
	return formatImpliedProbabilityAsCents(p);
}

export function formatAmericanLabel(p: number | null | undefined): string {
	const n =
		p !== undefined && p !== null && Number.isFinite(p)
			? impliedProbToAmericanOdds(Math.max(0, Math.min(1, p)))
			: null;
	if (n === null) return "--";
	return n > 0 ? `+${n}` : `${n}`;
}

export function formatAmericanWithCentsParen(p: number | null | undefined): string {
	if (p === undefined || p === null || !Number.isFinite(p)) return "--";
	const clamped = Math.max(0, Math.min(1, p));
	const cents = formatImpliedProbabilityAsCents(clamped);
	const am = formatAmericanLabel(clamped);
	if (am === "--") return "--";
	return `${am} (${cents})`;
}

function formatRatioStyleCell(style: OddsDisplayStyle, p: number | null | undefined): string {
	const core = ratioOddsInputs(p);
	if (!core) return "--";
	switch (style) {
		case "decimal":
			return formatOddsDecimal(core.d);
		case "multiplier":
			return formatMultiplierPrefix(core.d);
		case "hong_kong":
			return formatHongKongLabel(core.hk);
		case "indonesian":
			return formatIndonesianLabel(core.hk);
		case "malaysian":
			return formatMalaysianLabel(core.hk);
		case "fractional": {
			const fr = formatFractionalLabel(core.hk);
			return fr ?? "--";
		}
		case "percentage": {
			const pct = core.p * 100;
			if (pct <= 0) return "0%";
			if (pct < 1) return `${trimTrailingZerosFixed(pct.toFixed(2))}%`;
			return `${Math.round(pct)}%`;
		}
		default:
			return "--";
	}
}

/**
 * Layout for secondary lines (order book ladder, SOR details): dual cents when not price-only.
 */
export function oddsDualLayoutForStyle(style: OddsDisplayStyle): OddsPriceLayout {
	return style === "default" ? "cell" : "dualWithCents";
}

/**
 * Primary dispatcher for outcome prices. Use from UI; never for order math.
 */
export function formatOddsPrice(
	p: number | null | undefined,
	style: OddsDisplayStyle,
	layout: OddsPriceLayout = "cell",
): string {
	switch (style) {
		case "default":
			return formatCentsLabel(p);
		case "american":
			return layout === "dualWithCents" ? formatAmericanWithCentsParen(p) : formatAmericanLabel(p);
		case "decimal":
		case "multiplier":
		case "fractional":
		case "percentage":
		case "indonesian":
		case "hong_kong":
		case "malaysian": {
			const cell = formatRatioStyleCell(style, p);
			if (layout === "dualWithCents") return appendDualWithCents(cell, p);
			return cell;
		}
		default:
			return "--";
	}
}

/** Subtext after "Avg. odds " — matches selected style (no dual cents). */
export function formatAvgOddsValue(p: number | null | undefined, style: OddsDisplayStyle): string {
	if (p === undefined || p === null || !Number.isFinite(p)) return "--";

	switch (style) {
		case "default": {
			const clamped = Math.max(0, Math.min(1, p));
			const pct = clamped * 100;
			if (pct <= 0) return "0%";
			if (pct < 0.01) return "<0.01%";
			if (pct < 1) return `${trimTrailingZerosFixed(pct.toFixed(2))}%`;
			return `${Math.round(pct)}%`;
		}
		case "american":
			return formatAmericanLabel(Math.max(0, Math.min(1, p)));
		case "decimal":
		case "multiplier":
		case "fractional":
		case "percentage":
		case "indonesian":
		case "hong_kong":
		case "malaysian":
			return formatRatioStyleCell(style, p);
		default:
			return "--";
	}
}

/** Polymarket / CLOB resting size can be fractional; avoid rounding tiny positives to **0**. */
export function formatOrderbookLevelShares(size: number): string {
	if (!Number.isFinite(size) || size <= 0) return "0";
	const rounded = Math.round(size);
	if (Math.abs(size - rounded) < 1e-9) return String(rounded);
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: 6,
		minimumFractionDigits: 0,
	}).format(size);
}
