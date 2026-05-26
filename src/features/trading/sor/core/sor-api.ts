import { getPrivateApiRequestUrl } from "@/config/privateApiBase";
import { mapSorApiHttpError, userMessage, SOR_API_INVALID_RESPONSE } from "@/errors";
import type {
	RouteRequest,
	RoutePlan,
	SorRouteResult,
	RouteExecution,
	ExecutionLegStatus,
	SorVenue,
} from "./sor-types";

/**
 * Per-call gate: read-only route previews (`getRoute`) are allowed to ride
 * through anonymously so logged-out users can see hypothetical smart-routing
 * payouts. Every execution / status mutation still requires Privy auth — those
 * paths flip `requireAuth` and we throw early before hitting the network so
 * the caller surfaces the standard "log in" UI instead of leaking a 401.
 */
async function sorFetch(
	path: string,
	getToken: () => Promise<string | null>,
	getIdentityToken: (() => string | undefined) | undefined,
	init: RequestInit & { requireAuth?: boolean } = {},
): Promise<Response> {
	const { requireAuth = true, ...fetchInit } = init;
	const token = await getToken();
	if (!token && requireAuth) {
		throw new Error(mapSorApiHttpError(401, "Not authenticated"));
	}
	const headers = new Headers(fetchInit.headers);
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
		const idTok = getIdentityToken?.();
		if (typeof idTok === "string" && idTok.trim() !== "") {
			headers.set("privy-id-token", idTok.trim());
		}
	}
	if (!headers.has("Content-Type") && fetchInit.body) {
		headers.set("Content-Type", "application/json");
	}
	return fetch(getPrivateApiRequestUrl(path), { ...fetchInit, headers });
}

export interface SorApiClient {
	getRoute(request: RouteRequest, signal?: AbortSignal): Promise<SorRouteResult>;
	startExecution(route: RoutePlan, signal?: AbortSignal): Promise<RouteExecution>;
	updateLeg(
		routeId: string,
		venue: SorVenue,
		status: ExecutionLegStatus,
		extras?: { filledShares?: number; txHash?: string; bridgeTxHash?: string; error?: string },
	): Promise<RouteExecution>;
	getStatus(routeId: string): Promise<RouteExecution>;
	markDone(routeId: string): Promise<RouteExecution>;
	markReroute(routeId: string): Promise<{ execution: RouteExecution; remainingBudget: number }>;
}

export function createSorApiClient(
	getToken: () => Promise<string | null>,
	getIdentityToken?: () => string | undefined,
): SorApiClient {
	const authFetch = (path: string, init?: RequestInit & { requireAuth?: boolean }) =>
		sorFetch(path, getToken, getIdentityToken, init);

	async function readJson<T>(res: Response): Promise<T> {
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(mapSorApiHttpError(res.status, text));
		}
		const text = await res.text();
		try {
			return JSON.parse(text) as T;
		} catch {
			console.error("[SOR API] invalid JSON", { preview: text.slice(0, 500) });
			throw new Error(userMessage(SOR_API_INVALID_RESPONSE));
		}
	}

	return {
		async getRoute(request, signal) {
			// The server returns HTTP 200 with `{success:false, code, error}`
			// for every expected business-logic outcome (EXECUTION_NOT_READY,
			// NO_BOOKS_AVAILABLE, AMOUNT_TOO_SMALL, …). A non-2xx status here
			// means something genuinely went wrong: 401 auth, 429 rate-limit,
			// 400 Zod validation, 500 internal. We still try to parse the
			// body because those paths also return `SorRouteResult` shapes
			// (e.g. RATE_LIMITED) — callers then handle the `code` like any
			// other failure instead of catching a thrown exception.
			//
			// `requireAuth: false` lets logged-out users see hypothetical routes:
			// the request is sent without an `Authorization` header, and the
			// server treats it as a read-only preview (no balances, no execution
			// readiness checks). `useSorRoute` separately silences any 401
			// surface so an unauth backend never leaks into the trade box copy.
			const res = await authFetch("/api/sor/route", {
				method: "POST",
				body: JSON.stringify(request),
				signal,
				requireAuth: false,
			});
			const text = await res.text();
			let body: unknown;
			try {
				body = JSON.parse(text) as unknown;
			} catch {
				throw new Error(mapSorApiHttpError(res.status, text));
			}
			if (
				body &&
				typeof body === "object" &&
				"success" in body &&
				typeof (body as SorRouteResult).success === "boolean"
			) {
				return body as SorRouteResult;
			}
			throw new Error(mapSorApiHttpError(res.status, text));
		},

		async startExecution(route, signal) {
			const res = await authFetch(`/api/sor/execute/${route.routeId}`, {
				method: "POST",
				body: JSON.stringify({ route }),
				signal,
			});
			const data = await readJson<{ execution: RouteExecution }>(res);
			return data.execution;
		},

		async updateLeg(routeId, venue, status, extras) {
			const res = await authFetch(`/api/sor/execute/${routeId}/leg`, {
				method: "POST",
				body: JSON.stringify({ venue, status, ...extras }),
			});
			const data = await readJson<{ execution: RouteExecution }>(res);
			return data.execution;
		},

		async getStatus(routeId) {
			const res = await authFetch(`/api/sor/status/${routeId}`);
			const data = await readJson<{ execution: RouteExecution }>(res);
			return data.execution;
		},

		async markDone(routeId) {
			const res = await authFetch(`/api/sor/execute/${routeId}/done`, {
				method: "POST",
			});
			const data = await readJson<{ execution: RouteExecution }>(res);
			return data.execution;
		},

		async markReroute(routeId) {
			const res = await authFetch(`/api/sor/execute/${routeId}/reroute`, {
				method: "POST",
			});
			return readJson<{ execution: RouteExecution; remainingBudget: number }>(res);
		},
	};
}
