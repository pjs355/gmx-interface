const HOME_GAME_FILTER_KEY = "homeGameFilter";
const HOME_PENDING_GAME_FILTER_KEY = "homePendingGameFilter";
const HOME_PENDING_WORLD_CUP_SECTION_KEY = "homePendingWorldCupSection";

export type HomeWorldCupSection = "games" | "groups" | "futures" | "awards";

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

/**
 * Side-effect-free peek of the pending filter. Use this in render / useState
 * initializers — `consume*` mutates localStorage and races with React 18
 * Strict Mode's double-mount (first mount removes, second mount sees null and
 * falls back to the default, which strands the user on the wrong list filter
 * after navigating back from the trading page).
 */
export function peekHomePendingGameFilter(): string | null {
	try {
		const raw = localStorage.getItem(HOME_PENDING_GAME_FILTER_KEY);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}

export function clearHomePendingGameFilter(): void {
	try {
		localStorage.removeItem(HOME_PENDING_GAME_FILTER_KEY);
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}

export function setHomePendingWorldCupSection(section: HomeWorldCupSection | null): void {
	try {
		if (section) {
			localStorage.setItem(HOME_PENDING_WORLD_CUP_SECTION_KEY, section);
		} else {
			localStorage.removeItem(HOME_PENDING_WORLD_CUP_SECTION_KEY);
		}
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}

/** One-shot World Cup Games/Groups from trading sidebar → home. */
export function consumeHomePendingWorldCupSection(): HomeWorldCupSection | null {
	try {
		const raw = localStorage.getItem(HOME_PENDING_WORLD_CUP_SECTION_KEY);
		localStorage.removeItem(HOME_PENDING_WORLD_CUP_SECTION_KEY);
		if (raw === "games" || raw === "groups") return raw;
		return null;
	} catch {
		return null;
	}
}

/** Side-effect-free peek of the pending World Cup section (see `peekHomePendingGameFilter`). */
export function peekHomePendingWorldCupSection(): HomeWorldCupSection | null {
	try {
		const raw = localStorage.getItem(HOME_PENDING_WORLD_CUP_SECTION_KEY);
		if (raw === "games" || raw === "groups") return raw;
		return null;
	} catch {
		return null;
	}
}

export function clearHomePendingWorldCupSection(): void {
	try {
		localStorage.removeItem(HOME_PENDING_WORLD_CUP_SECTION_KEY);
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}
