/**
 * Formatters local to the Traders pages.
 */

/**
 * Full-number USD formatter. Deliberately does NOT abbreviate — big numbers
 * should read big. "$1,250,000" hits harder than "$1.2M" for a discovery/
 * copy-trading product.
 */
export function formatUsdAbbrev(value?: number | null): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "$0";
	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";
	return `${sign}$${Math.round(abs).toLocaleString()}`;
}

/**
 * PnL formatter — always shows an explicit sign so + and - read at a glance.
 * Full number, not abbreviated.
 */
export function formatPnl(value?: number | null): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "$0";
	if (Math.abs(value) < 0.5) return "$0";
	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "+";
	return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatWinRate(rate: number): string {
	if (!Number.isFinite(rate)) return "0%";
	return `${Math.round(rate * 100)}%`;
}

/**
 * "15m ago", "3h ago", "2d ago", "5w ago". Under a minute reads "just now".
 * After 90 days it falls back to a short date so "3mo ago" doesn't feel dead.
 */
export function formatRelativeTime(iso?: string | null): string {
	if (!iso) return "unknown";
	const d = new Date(iso);
	const t = d.getTime();
	if (!Number.isFinite(t)) return "unknown";
	const diff = Date.now() - t;
	if (diff < 60_000) return "just now";
	const min = Math.floor(diff / 60_000);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 48) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day}d ago`;
	const wk = Math.floor(day / 7);
	if (wk < 12) return `${wk}w ago`;
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Signed percent return: 2.3 → "+230%". Input is a ratio (pnl / cost). */
export function formatReturnPct(ratio: number): string {
	if (!Number.isFinite(ratio)) return "";
	const pct = ratio * 100;
	const sign = pct > 0 ? "+" : "";
	if (Math.abs(pct) >= 1000) return `${sign}${Math.round(pct).toLocaleString()}%`;
	return `${sign}${Math.round(pct)}%`;
}

/**
 * Clean up a Polymarket market title so it reads as a statement rather than
 * a question. Strips the classic "Will/Can/Does" prefix, trailing punctuation,
 * and capitalizes.
 *
 *   "Will Real Madrid win the Champions League?" → "Real Madrid win the Champions League"
 *   "Chiefs vs Broncos - Chiefs win"             → "Chiefs vs Broncos - Chiefs win"
 */
export function cleanMarketTitle(title?: string | null): string {
	if (!title) return "";
	let t = title.trim();
	t = t.replace(/^(will|can|does|is|are|do)\s+/i, "");
	// Bettors don't care about the fixture date — the matchup is the context.
	t = t.replace(/\s+on\s+\d{4}-\d{2}-\d{2}/gi, "");
	t = t.replace(/\s*\(?\d{4}-\d{2}-\d{2}\)?\s*$/g, "");
	t = t.replace(/[?.!]\s*$/, "").trim();
	if (!t) return "";
	return t.charAt(0).toUpperCase() + t.slice(1);
}

const OU_TITLE_RE = /\bO\/U\b|\bover\s*\/\s*under\b/i;

/**
 * What the side pill should say for a straight bet.
 *
 * 1. O/U markets never show Yes/No — the side maps to Over / Under. The
 *    market's named outcome wins when present (handles Under-first
 *    books); otherwise the yes side is Over (Polymarket's convention:
 *    outcomes[0] = yes side = Over).
 * 2. A named outcome is shown only when it appears in the market title
 *    ("Sharks vs. Flames" + "Sharks"). A label that ISN'T in the title
 *    (e.g. "Spread: Cavs (-9.5)" + the other team) reads wrong, so it
 *    falls back to Yes/No — "No" on a spread = won't cover.
 */
export function betSideLabel(input: {
	outcome: "yes" | "no";
	outcomeLabel?: string;
	marketTitle?: string | null;
}): string {
	const label = input.outcomeLabel?.trim();
	const title = input.marketTitle ?? "";
	if (label && /^(over|under)$/i.test(label)) {
		return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
	}
	if (OU_TITLE_RE.test(title)) {
		return input.outcome === "yes" ? "Over" : "Under";
	}
	if (label && title.toLowerCase().includes(label.toLowerCase())) {
		return label;
	}
	return input.outcome === "yes" ? "Yes" : "No";
}

/**
 * "Spain vs Portugal" from the market's team pair, when we have one.
 * Returns "" when the matchup isn't derivable so callers can skip it.
 */
export function formatMatchup(teams?: string[] | null): string {
	if (!teams || teams.length < 2) return "";
	const [a, b] = teams;
	if (!a || !b) return "";
	return `${a} vs ${b}`;
}

// ---- avatar helpers (deterministic per wallet) ----

const AVATAR_PALETTE = [
	"#3b82f6",
	"#ec4899",
	"#f59e0b",
	"#10b981",
	"#a855f7",
	"#06b6d4",
	"#ef4444",
	"#84cc16",
	"#f97316",
	"#14b8a6",
];

function hashWallet(wallet: string): number {
	let h = 2166136261;
	for (let i = 0; i < wallet.length; i++) {
		h ^= wallet.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export function getAvatarColor(wallet: string): string {
	if (!wallet) return AVATAR_PALETTE[0];
	return AVATAR_PALETTE[hashWallet(wallet) % AVATAR_PALETTE.length];
}

export function getInitials(displayName: string, wallet: string): string {
	const name = (displayName ?? "").trim();
	if (name && !name.startsWith("0x")) {
		const parts = name.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	}
	if (wallet && wallet.length >= 4) return wallet.slice(2, 4).toUpperCase();
	return "··";
}

/**
 * Pick the best human-readable name for a wallet:
 *   1. polymarketUsername (real handle they picked on Polymarket)
 *   2. displayName, if the backend resolved it to something other than a raw address
 *   3. shortened wallet (`0xabcd…1234`) as a last resort
 */
export function resolveDisplayName(input: {
	displayName?: string;
	polymarketUsername?: string;
	wallet?: string;
}): string {
	const username = input.polymarketUsername?.trim();
	if (username) return username;
	const dn = input.displayName?.trim();
	if (dn && !isWalletLike(dn)) return dn;
	const w = (input.wallet ?? "").trim();
	if (w.length >= 10) return `${w.slice(0, 6)}…${w.slice(-4)}`;
	return w || "Unknown";
}

function isWalletLike(s: string): boolean {
	return /^0x[0-9a-fA-F]{6,}/.test(s) || /^0x[0-9a-fA-F]+…[0-9a-fA-F]+$/.test(s);
}
