/**
 * Account overview HTTP path (predictions private API)
 * ------------------------------------------------------
 * Valid shapes on the Express order-book / private API (Bearer = current user):
 *
 * - `GET /profiles/me/account-overview` — canonical, simplest
 * - `GET /profiles/:profileId/account-overview` — allowed when `:profileId` matches the
 *   logged-in user’s `profile._id` (403 if it’s someone else’s id)
 * - Aliases some deploys use: `/profiles/account-overview`, `/account-overview`, `/api/account-overview`
 *
 * If you see HTML `Cannot GET /…` or 404 on these paths, the process you’re hitting (see
 * `VITE_PRIVATE_API_BASE`) is usually **not** this server build — restart `tsx server.ts` (e.g. :8080).
 *
 * Env `VITE_ACCOUNT_OVERVIEW_PATH` (default **`me`**):
 * - `me` → `/profiles/me/account-overview`
 * - `id` → `/profiles/${profileId}/account-overview` (same as `useCurrentProfile`’s `_id`)
 * - `profiles` | `root` | `api` → literal alias paths above
 *
 * `profileId` is ignored for all modes except `id`.
 */
export type AccountOverviewPathMode = "me" | "profiles" | "root" | "api" | "id";

/** Resolved from `VITE_ACCOUNT_OVERVIEW_PATH` (exposed for dev / support tooling). */
export function getAccountOverviewPathMode(): AccountOverviewPathMode {
	const raw = import.meta.env.VITE_ACCOUNT_OVERVIEW_PATH;
	if (typeof raw !== "string" || !raw.trim()) return "me";
	const m = raw.trim().toLowerCase();
	if (m === "id" || m === "profileid" || m === "legacy") return "id";
	if (m === "profiles" || m === "profiles-literal") return "profiles";
	if (m === "root") return "root";
	if (m === "api" || m === "api-prefix") return "api";
	if (m === "me") return "me";
	return "me";
}

export function getAccountOverviewApiPath(profileId: string): string {
	switch (getAccountOverviewPathMode()) {
		case "me":
			return "/profiles/me/account-overview";
		case "profiles":
			return "/profiles/account-overview";
		case "root":
			return "/account-overview";
		case "api":
			return "/api/account-overview";
		case "id":
			return `/profiles/${encodeURIComponent(profileId)}/account-overview`;
		default:
			return "/profiles/me/account-overview";
	}
}
