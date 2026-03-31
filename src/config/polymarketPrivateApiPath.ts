/**
 * Polymarket private routes (predictions API)
 * -------------------------------------------
 * Server may expose either:
 * - `GET /polymarket/account`
 * - `GET /api/polymarket/account`
 *
 * Env `VITE_POLYMARKET_ACCOUNT_PATH` (optional): absolute path starting with `/`, e.g. `/api/polymarket/account`
 * Default: `/polymarket/account`
 *
 * Other mutations (`/polymarket/account/sync`, etc.) keep fixed paths unless we add matching envs later.
 */
export function getPolymarketAccountApiPath(): string {
	const p = import.meta.env.VITE_POLYMARKET_ACCOUNT_PATH;
	if (typeof p === "string") {
		const t = p.trim();
		if (t.startsWith("/")) return t.replace(/\/$/, "") || "/polymarket/account";
	}
	return "/polymarket/account";
}
