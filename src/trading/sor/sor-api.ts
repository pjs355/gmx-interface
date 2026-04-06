import { getPrivateApiRequestUrl } from "@/config/privateApiBase";
import type {
	RouteRequest,
	RoutePlan,
	SorRouteResult,
	RouteExecution,
	ExecutionLegStatus,
	SorVenue,
} from "./sor-types";

async function sorFetch(
	path: string,
	getToken: () => Promise<string | null>,
	getIdentityToken?: () => string | undefined,
	init: RequestInit = {},
): Promise<Response> {
	const token = await getToken();
	if (!token) throw new Error("Not authenticated");
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${token}`);
	const idTok = getIdentityToken?.();
	if (typeof idTok === "string" && idTok.trim() !== "") {
		headers.set("privy-id-token", idTok.trim());
	}
	if (!headers.has("Content-Type") && init.body) {
		headers.set("Content-Type", "application/json");
	}
	return fetch(getPrivateApiRequestUrl(path), { ...init, headers });
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
	const authFetch = (path: string, init?: RequestInit) =>
		sorFetch(path, getToken, getIdentityToken, init);

	async function readJson<T>(res: Response): Promise<T> {
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`SOR API error ${res.status}: ${text.slice(0, 200)}`);
		}
		const text = await res.text();
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
		}
	}

	return {
		async getRoute(request, signal) {
			const res = await authFetch("/api/sor/route", {
				method: "POST",
				body: JSON.stringify(request),
				signal,
			});
			return readJson<SorRouteResult>(res);
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
