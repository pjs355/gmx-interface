function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
	let cleaned = hex.trim().replace("#", "");
	if (cleaned.length === 3) {
		cleaned = cleaned
			.split("")
			.map((c) => c + c)
			.join("");
	}
	if (cleaned.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
	return {
		r: parseInt(cleaned.substring(0, 2), 16),
		g: parseInt(cleaned.substring(2, 4), 16),
		b: parseInt(cleaned.substring(4, 6), 16),
	};
}

/** RGBA string from hex; invalid hex falls back to black with the given alpha. */
export function hexToRgba(hex?: string, alpha: number = 0.3): string {
	if (!hex) return `rgba(0,0,0,${alpha})`;
	const rgb = parseHexToRgb(hex);
	if (!rgb) return `rgba(0,0,0,${alpha})`;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** `alpha * teamRGB` on black (for estimating perceived fill behind text). */
export function mixHexOnBlack(hex: string, alpha: number): string {
	const rgb = parseHexToRgb(hex);
	if (!rgb) return "#000000";
	const r = Math.round(rgb.r * alpha);
	const g = Math.round(rgb.g * alpha);
	const b = Math.round(rgb.b * alpha);
	const h = (n: number) => n.toString(16).padStart(2, "0");
	return `#${h(r)}${h(g)}${h(b)}`;
}

/** Black or white text for legibility on a solid or near-solid team color (WCAG-style luminance). */
export function getContrastingTextColor(hex?: string | null): string {
	if (!hex) return "#ffffff";
	const rgb = parseHexToRgb(hex);
	if (!rgb) return "#ffffff";
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance > 0.6 ? "#000000" : "#ffffff";
}

/**
 * Outline for a selected team button when the fill is the team color (vs-single markets).
 * Matches trading UI: pure black/white fills get the opposite outline; mid-tones use luminance.
 */
export function getBorderColorForSelected(backgroundColor: string): string {
	if (!backgroundColor) return "#ffffff";
	const lower = backgroundColor.trim().toLowerCase();
	const cleaned = lower.replace("#", "");
	if (cleaned === "000000" || cleaned === "000" || lower === "rgb(0, 0, 0)" || lower === "black") {
		return "#ffffff";
	}
	if (
		cleaned === "ffffff" ||
		cleaned === "fff" ||
		lower === "rgb(255, 255, 255)" ||
		lower === "white"
	) {
		return "#000000";
	}
	const full =
		cleaned.length === 3
			? cleaned
					.split("")
					.map((c) => c + c)
					.join("")
			: cleaned;
	const r = parseInt(full.substring(0, 2), 16) || 0;
	const g = parseInt(full.substring(2, 4), 16) || 0;
	const b = parseInt(full.substring(4, 6), 16) || 0;
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness < 128 ? "#ffffff" : "#000000";
}

const channelToHex = (n: number) =>
	Math.max(0, Math.min(255, Math.round(n)))
		.toString(16)
		.padStart(2, "0");

/**
 * Stroke/fill color for team lines on a near-black chart (#000).
 * Uses the same linear luminance components as getContrastingTextColor, but a lower threshold:
 * only colors that are too dark to read on black (e.g. black, dark grey) are mixed toward white.
 * Brighter team colors (reds, greens, purples) are left unchanged.
 */
export function getChartStrokeColorForDarkBg(hex?: string | null, fallback = "#e8e8e8"): string {
	if (!hex) return fallback;
	const rgb = parseHexToRgb(hex.trim());
	if (!rgb) return fallback;
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	// ~0.22: pure/near black and dark grey fail; typical saturated primaries stay above this on black.
	if (luminance >= 0.22) {
		return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`;
	}
	for (let t = 0.25; t <= 1.001; t += 0.06) {
		const nr = rgb.r + (255 - rgb.r) * t;
		const ng = rgb.g + (255 - rgb.g) * t;
		const nb = rgb.b + (255 - rgb.b) * t;
		const nl = 0.2126 * (nr / 255) + 0.7152 * (ng / 255) + 0.0722 * (nb / 255);
		if (nl >= 0.52) {
			return `#${channelToHex(nr)}${channelToHex(ng)}${channelToHex(nb)}`;
		}
	}
	return fallback;
}
