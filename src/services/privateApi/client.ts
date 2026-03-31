import type { Book } from "@predictdotfun/sdk";
import { getAccountOverviewApiPath } from "@/config/accountOverviewApi";
import { getPolymarketAccountApiPath } from "@/config/polymarketPrivateApiPath";
import { getPrivateApiRequestUrl } from "@/config/privateApiBase";
import type { CreateOrderPayload } from "@/trading/predict/predictOrderSubmit";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import {
	mapPredictPositionRows,
	type PredictPositionRow,
} from "@/trading/predict/predictPositionsApi";
import type {
	PredictOrderRow,
	PredictOrdersResponse,
} from "@/trading/predict/predictOrdersApi";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	AccountOverview,
	LifiQuoteRequestBody,
	LifiQuoteResponse,
	LifiStatusParams,
	LifiStatusResponse,
	PolymarketAccountResponse,
	PolymarketBuilderSignBody,
	PolymarketBuilderSignResponse,
	PolymarketL2CredentialsBody,
	PolymarketSyncBody,
	PolymarketVerifyOnChainBody,
} from "@/types/trading";
import { PrivateApiError } from "./errors";

export type GetToken = () => Promise<string | null | undefined>;

async function parseJsonSafe(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function unwrapEnvelope<T>(raw: unknown): T {
	if (raw && typeof raw === "object" && "data" in raw) {
		return (raw as { data: T }).data;
	}
	return raw as T;
}

/** Best-effort message from LevelUp / Express / Nest / Predict-shaped error bodies. */
function privateApiHttpErrorMessage(body: unknown, status: number): string {
	if (body == null || body === "") return `HTTP ${status}`;
	if (typeof body === "string") {
		const t = body.trim();
		return t || `HTTP ${status}`;
	}
	if (typeof body !== "object") return `HTTP ${status}`;
	const o = body as Record<string, unknown>;
	const tryStr = (v: unknown) =>
		typeof v === "string" && v.trim() ? v.trim() : null;
	if (tryStr(o.error)) return tryStr(o.error)!;
	if (tryStr(o.message)) return tryStr(o.message)!;
	if (tryStr(o.detail)) return tryStr(o.detail)!;
	if (Array.isArray(o.message)) {
		const parts = o.message
			.filter((x): x is string => typeof x === "string")
			.map((x) => x.trim())
			.filter(Boolean);
		if (parts.length) return parts.join("; ");
	}
	const nested = o.data;
	if (nested && typeof nested === "object") {
		const d = nested as Record<string, unknown>;
		if (tryStr(d.error)) return tryStr(d.error)!;
		if (tryStr(d.message)) return tryStr(d.message)!;
		if (tryStr(d.detail)) return tryStr(d.detail)!;
	}
	try {
		const s = JSON.stringify(body);
		if (s && s !== "{}") {
			return s.length > 600 ? `${s.slice(0, 600)}…` : s;
		}
	} catch {
		/* noop */
	}
	return `HTTP ${status}`;
}

function pickPredictOrderFields(unwrapped: unknown): {
	orderId?: string;
	orderHash: string;
} | null {
	if (!unwrapped || typeof unwrapped !== "object") return null;
	const o = unwrapped as Record<string, unknown>;
	if (typeof o.orderHash === "string") {
		return {
			orderId: typeof o.orderId === "string" ? o.orderId : undefined,
			orderHash: o.orderHash,
		};
	}
	const inner = o.data;
	if (inner && typeof inner === "object") {
		const d = inner as Record<string, unknown>;
		if (typeof d.orderHash === "string") {
			return {
				orderId: typeof d.orderId === "string" ? d.orderId : undefined,
				orderHash: d.orderHash,
			};
		}
	}
	return null;
}

function pickPredictAuthMessage(unwrapped: unknown): string | null {
	if (!unwrapped || typeof unwrapped !== "object") return null;
	const o = unwrapped as Record<string, unknown>;
	if (typeof o.message === "string") return o.message;
	const inner = o.data;
	if (inner && typeof inner === "object") {
		const d = inner as Record<string, unknown>;
		if (typeof d.message === "string") return d.message;
	}
	return null;
}

export function createPrivateApiClient(getToken: GetToken) {
	async function authorizedFetch(
		path: string,
		init: RequestInit = {}
	): Promise<Response> {
		const token = await getToken();
		if (!token) {
			throw new PrivateApiError("Not authenticated", 401, null);
		}
		const headers = new Headers(init.headers);
		headers.set("Authorization", `Bearer ${token}`);
		if (!headers.has("Content-Type") && init.body) {
			headers.set("Content-Type", "application/json");
		}
		return fetch(getPrivateApiRequestUrl(path), { ...init, headers });
	}

	async function readJson<T>(response: Response): Promise<T> {
		const body = await parseJsonSafe(response);
		if (!response.ok) {
			const msg = privateApiHttpErrorMessage(body, response.status);
			throw new PrivateApiError(msg, response.status, body);
		}
		return unwrapEnvelope<T>(body);
	}

	return {
		async getAccountOverview(profileId: string): Promise<AccountOverview> {
			const path = getAccountOverviewApiPath(profileId);
			const res = await authorizedFetch(path);
			return readJson<AccountOverview>(res);
		},

		async getPolymarketAccount(): Promise<PolymarketAccountResponse> {
			const res = await authorizedFetch(getPolymarketAccountApiPath());
			return readJson<PolymarketAccountResponse>(res);
		},

		async postPolymarketSync(body: PolymarketSyncBody): Promise<unknown> {
			const res = await authorizedFetch("/polymarket/account/sync", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<unknown>(res);
		},

		async postPolymarketL2Credentials(
			body: PolymarketL2CredentialsBody
		): Promise<unknown> {
			const res = await authorizedFetch("/polymarket/account/l2-credentials", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<unknown>(res);
		},

		async postPolymarketVerifyOnChain(
			body: PolymarketVerifyOnChainBody = {}
		): Promise<unknown> {
			const res = await authorizedFetch(
				"/polymarket/account/verify-on-chain",
				{
					method: "POST",
					body: JSON.stringify(body),
				}
			);
			return readJson<unknown>(res);
		},

		async postPolymarketBuilderSign(
			body: PolymarketBuilderSignBody
		): Promise<PolymarketBuilderSignResponse> {
			const res = await authorizedFetch("/polymarket/builder/sign", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<PolymarketBuilderSignResponse>(res);
		},

		async postFundingLifiQuote(
			body: LifiQuoteRequestBody
		): Promise<LifiQuoteResponse> {
			const res = await authorizedFetch("/funding/lifi/quote", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<LifiQuoteResponse>(res);
		},

		async getFundingLifiStatus(
			params: LifiStatusParams
		): Promise<LifiStatusResponse> {
			const q = new URLSearchParams();
			q.set("txHash", params.txHash);
			if (params.tool != null) q.set("tool", params.tool);
			if (params.fromChain != null)
				q.set("fromChain", String(params.fromChain));
			if (params.toChain != null) q.set("toChain", String(params.toChain));
			const res = await authorizedFetch(`/funding/lifi/status?${q.toString()}`);
			return readJson<LifiStatusResponse>(res);
		},

		/** Proxies to Predict.fun with server-side `x-api-key` (browser sends Bearer only). */
		async getPredictMarket(marketId: number): Promise<PredictMarketDetail> {
			const res = await authorizedFetch(`/api/predict/markets/${marketId}`);
			return readJson<PredictMarketDetail>(res);
		},

		async getPredictOrderbook(marketId: number): Promise<Book> {
			const res = await authorizedFetch(
				`/api/predict/markets/${marketId}/orderbook`
			);
			return readJson<Book>(res);
		},

		async getPredictPositions(address: string): Promise<VenuePosition[]> {
			const path = `/api/predict/positions/${encodeURIComponent(address)}?first=200`;
			const res = await authorizedFetch(path);
			const rows = await readJson<PredictPositionRow[]>(res);
			return mapPredictPositionRows(rows);
		},

		async getPredictAuthMessage(): Promise<{ message: string }> {
			const res = await authorizedFetch("/api/predict/auth/message", {
				headers: { Accept: "application/json" },
			});
			const raw = await readJson<unknown>(res);
			const message = pickPredictAuthMessage(raw);
			if (!message) {
				throw new PrivateApiError(
					"Predict auth: no message in response",
					res.status,
					raw
				);
			}
			return { message };
		},

		async completePredictAuth(body: {
			signer: string;
			message: string;
			signature: string;
		}): Promise<void> {
			const res = await authorizedFetch("/api/predict/auth/complete", {
				method: "POST",
				body: JSON.stringify(body),
			});
			await readJson<unknown>(res);
		},

		async getPredictOrders(
			status?: "FILLED" | "OPEN"
		): Promise<PredictOrderRow[]> {
			const params = new URLSearchParams();
			if (status) params.set("status", status);
			params.set("first", "200");
			const qs = params.toString();
			const res = await authorizedFetch(`/api/predict/orders?${qs}`);
			const body = await readJson<PredictOrdersResponse>(res);
			return Array.isArray(body) ? body : (body as any)?.data ?? body ?? [];
		},

		async removePredictOrders(
			body: unknown
		): Promise<unknown> {
			const res = await authorizedFetch("/api/predict/orders/remove", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<unknown>(res);
		},

		async postPredictOrder(
			body: CreateOrderPayload
		): Promise<{ orderId: string; orderHash: string }> {
			const res = await authorizedFetch("/api/predict/orders", {
				method: "POST",
				body: JSON.stringify(body),
			});
			const unwrapped = await readJson<unknown>(res);
			const data = pickPredictOrderFields(unwrapped);
			if (!data?.orderHash) {
				throw new PrivateApiError(
					"Predict order: missing orderHash in response",
					res.status,
					unwrapped
				);
			}
			return { orderId: data.orderId ?? "", orderHash: data.orderHash };
		},
	};
}

export type PrivateApiClient = ReturnType<typeof createPrivateApiClient>;
