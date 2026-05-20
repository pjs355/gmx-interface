const HOME_GAME_FILTER_KEY = "homeGameFilter";
const HOME_PENDING_GAME_FILTER_KEY = "homePendingGameFilter";

export function getHomeGameFilter(): string | null {
	try {
		const raw = localStorage.getItem(HOME_GAME_FILTER_KEY);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}

export function setHomeGameFilter(value: string | null): void {
	try {
		if (value) {
			localStorage.setItem(HOME_GAME_FILTER_KEY, value);
		} else {
			localStorage.removeItem(HOME_GAME_FILTER_KEY);
		}
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}

export function setHomePendingGameFilter(value: string | null): void {
	try {
		if (value) {
			localStorage.setItem(HOME_PENDING_GAME_FILTER_KEY, value);
		} else {
			localStorage.removeItem(HOME_PENDING_GAME_FILTER_KEY);
		}
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}

/** One-shot filter from trading sidebar → home; removed after read. */
export function consumeHomePendingGameFilter(): string | null {
	try {
		const raw = localStorage.getItem(HOME_PENDING_GAME_FILTER_KEY);
		localStorage.removeItem(HOME_PENDING_GAME_FILTER_KEY);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}
