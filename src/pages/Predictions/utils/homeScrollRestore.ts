const HOME_CATALOG_SCROLL_KEY = "homeCatalogScroll";
const SCROLL_SAVE_DEBOUNCE_MS = 150;
const SCROLL_RESTORE_TOLERANCE_PX = 2;

let suppressScrollSave = false;

function readScrollY(): number | null {
	try {
		const raw = sessionStorage.getItem(HOME_CATALOG_SCROLL_KEY);
		if (raw === null || raw.length === 0) return null;

		const asNumber = Number.parseFloat(raw);
		if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber;

		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return null;
		const o = parsed as Record<string, unknown>;
		const scrollY =
			typeof o.scrollY === "number"
				? o.scrollY
				: typeof o.fallbackY === "number"
					? o.fallbackY
					: Number.parseInt(String(o.scrollY ?? o.fallbackY), 10);
		if (!Number.isFinite(scrollY) || scrollY < 0) return null;
		return scrollY;
	} catch {
		return null;
	}
}

function writeScrollY(scrollY: number): void {
	sessionStorage.setItem(HOME_CATALOG_SCROLL_KEY, String(Math.max(0, scrollY)));
}

function clearStoredScrollY(): void {
	sessionStorage.removeItem(HOME_CATALOG_SCROLL_KEY);
}

/** Persist current window scroll — how the user left the home catalog. */
export function saveHomeCatalogScroll(): void {
	if (suppressScrollSave) return;
	try {
		writeScrollY(window.scrollY);
	} catch {
		/* sessionStorage unavailable — silently no-op */
	}
}

/** Non-destructive — MainRoutes skips scroll-to-top when a restore is pending. */
export function peekHomeCatalogScroll(): number | null {
	return readScrollY();
}

export function hasHomeCatalogScrollPending(): boolean {
	return readScrollY() !== null;
}

export function clearHomeCatalogScroll(): void {
	clearStoredScrollY();
}

/**
 * Restore saved scrollY. Returns true when done (restored or nothing pending).
 * Returns false when the page is not tall enough yet — caller should retry.
 */
export function restoreHomeCatalogScrollIfPending(): boolean {
	const targetY = readScrollY();
	if (targetY === null) return true;

	const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
	const clampedTarget = Math.min(targetY, maxY);

	suppressScrollSave = true;
	try {
		window.scrollTo({ top: clampedTarget, left: 0, behavior: "auto" });
	} finally {
		suppressScrollSave = false;
	}

	if (Math.abs(window.scrollY - clampedTarget) <= SCROLL_RESTORE_TOLERANCE_PX) {
		clearStoredScrollY();
		return true;
	}

	if (maxY + SCROLL_RESTORE_TOLERANCE_PX < targetY) {
		return false;
	}

	clearStoredScrollY();
	return true;
}

/** Keep sessionStorage in sync while the user scrolls the home catalog. */
export function subscribeHomeCatalogScrollSave(): () => void {
	let debounceTimer: number | undefined;

	const flush = () => {
		saveHomeCatalogScroll();
	};

	const onScroll = () => {
		if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(flush, SCROLL_SAVE_DEBOUNCE_MS);
	};

	const onScrollEnd = () => {
		if (debounceTimer !== undefined) {
			window.clearTimeout(debounceTimer);
			debounceTimer = undefined;
		}
		flush();
	};

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("scrollend", onScrollEnd, { passive: true });

	return () => {
		if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
		window.removeEventListener("scroll", onScroll);
		window.removeEventListener("scrollend", onScrollEnd);
	};
}

export const HOME_CATALOG_SCROLL_RETRY_MS = [0, 50, 120, 250, 450, 700, 1000] as const;
