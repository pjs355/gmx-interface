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
import type { PredictOrderRow } from "@/trading/predict/predictOrdersApi";
import {
	normalizePredictMatchesList,
	type PredictMatchEventRow,
} from "@/trading/predict/predictMatchesApi";
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

// ── DFlow / Kalshi types (narrow; no full OpenAPI mirror) ──────────

export type DflowProofState = {
	solanaWalletAddress: string | null;
	identityVerified: boolean;
	ownershipProofValid: boolean;
	verifiedAt: string | null;
	lastError: string | null;
};

export type DflowAccountResponse = {
	venueRegistered: boolean;
	venueStatus: "active" | "suspended" | "disconnected" | "not_registered";
	proofState: DflowProofState;
};

export type DflowAccountSyncBody = {
	solanaWalletAddress?: string;
	lastError?: string;
};

export type DflowVerifyResponse =
	| { verified: true; solanaWalletAddress: string }
	| {
			verified: false;
			solanaWalletAddress: string;
			proofMessage: string;
			timestamp: number;
			proofRedirectBase: string;
	  };

export type DflowMarketAccountInfo = {
	marketLedger: string;
	yesMint: string;
	noMint: string;
	isInitialized: boolean;
	redemptionStatus?: string | null;
	scalarOutcomePct?: number | null;
};

export type DflowMarketWire = {
	ticker: string;
	eventTicker: string;
	status: string;
	title: string;
	accounts: Record<string, DflowMarketAccountInfo>;
	[key: string]: unknown;
};

export type DflowEventWire = {
	ticker: string;
	seriesTicker: string;
	title: string;
	subtitle: string;
	markets?: DflowMarketWire[] | null;
	[key: string]: unknown;
};

export type DflowEventsResponse = {
	events: DflowEventWire[];
	cursor?: number | null;
};

export type DflowOrderParams = {
	inputMint: string;
	outputMint: string;
	amount: string;
	slippageBps?: string;
	predictionMarketSlippageBps?: string;
	destinationWallet?: string;
	prioritizationFeeLamports?: string;
	predictionMarketInitPayer?: string;
	revertWallet?: string;
	allowSyncExec?: string;
	allowAsyncExec?: string;
};

export type DflowOrderResponse = {
	transaction?: string;
	outAmount?: string;
	minOutAmount?: string;
	code?: string;
	msg?: string;
	[key: string]: unknown;
};

/** Market detail from `POST /api/v1/markets/batch` (DFlow Metadata API). */
export type DflowBatchMarket = {
	ticker: string;
	eventTicker: string;
	title: string;
	subtitle: string;
	yesSubTitle: string;
	noSubTitle: string;
	status: string;
	result: string;
	yesAsk: string | null;
	yesBid: string | null;
	noAsk: string | null;
	noBid: string | null;
	accounts: Record<string, DflowMarketAccountInfo>;
};

/** A single on-chain fill from `GET /api/v1/onchain-trades`. */
export type DflowOnchainTrade = {
	id: number;
	wallet: string;
	inputMint: string;
	outputMint: string;
	inputAmount: number;
	outputAmount: number;
	usdPricePerContract: number | null;
	contracts: number | null;
	side: "yes" | "no" | null;
	marketTicker: string | null;
	transactionSignature: string;
	createdAt: number;
};

function dflowOrderParamsToQuery(params: DflowOrderParams): URLSearchParams {
	const q = new URLSearchParams();
	q.set("inputMint", params.inputMint);
	q.set("outputMint", params.outputMint);
	q.set("amount", params.amount);
	if (params.slippageBps) q.set("slippageBps", params.slippageBps);
	if (params.predictionMarketSlippageBps)
		q.set("predictionMarketSlippageBps", params.predictionMarketSlippageBps);
	if (params.destinationWallet)
		q.set("destinationWallet", params.destinationWallet);
	if (params.prioritizationFeeLamports)
		q.set("prioritizationFeeLamports", params.prioritizationFeeLamports);
	if (params.predictionMarketInitPayer)
		q.set("predictionMarketInitPayer", params.predictionMarketInitPayer);
	if (params.revertWallet) q.set("revertWallet", params.revertWallet);
	if (params.allowSyncExec) q.set("allowSyncExec", params.allowSyncExec);
	if (params.allowAsyncExec) q.set("allowAsyncExec", params.allowAsyncExec);
	return q;
}

// ───────────────────────────────────────────────────────────────────

export type GetToken = () => Promise<string | null | undefined>;

/** Sync JWT for `privy-id-token`; helps private API hydrate linked wallets (e.g. Solana for DFlow). */
export type GetIdentityToken = () => string | null | undefined;

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

function isPredictOrderRowShape(x: unknown): x is PredictOrderRow {
	if (!x || typeof x !== "object") return false;
	const r = x as Record<string, unknown>;
	return (
		typeof r.id === "string" &&
		r.order != null &&
		typeof r.order === "object"
	);
}

/** Predict `GET /v1/orders` payloads after optional LevelUp `{ data: … }` unwrap — still may be `{ success, cursor, data: rows }`. */
function normalizePredictOrdersList(raw: unknown): PredictOrderRow[] {
	if (Array.isArray(raw)) {
		if (raw.length === 0) return [];
		if (isPredictOrderRowShape(raw[0])) return raw as PredictOrderRow[];
		return [];
	}
	if (!raw || typeof raw !== "object") return [];
	const o = raw as Record<string, unknown>;
	if (Array.isArray(o.data)) {
		const arr = o.data as unknown[];
		if (arr.length === 0) return [];
		if (isPredictOrderRowShape(arr[0])) return o.data as PredictOrderRow[];
	}
	const inner = o.data;
	if (inner && typeof inner === "object") {
		const mid = inner as Record<string, unknown>;
		if (Array.isArray(mid.data)) return mid.data as PredictOrderRow[];
		if (Array.isArray(mid.orders)) return mid.orders as PredictOrderRow[];
		if (Array.isArray(mid.results)) return mid.results as PredictOrderRow[];
		if (Array.isArray(mid.items)) return mid.items as PredictOrderRow[];
	}
	if (Array.isArray(o.orders)) return o.orders as PredictOrderRow[];
	if (Array.isArray(o.results)) return o.results as PredictOrderRow[];
	if (Array.isArray(o.items)) return o.items as PredictOrderRow[];
	/** Last resort: first nested array whose elements look like order rows */
	const stack: unknown[] = [raw];
	while (stack.length) {
		const cur = stack.pop();
		if (!cur || typeof cur !== "object") continue;
		for (const v of Object.values(cur)) {
			if (Array.isArray(v) && v.length > 0 && isPredictOrderRowShape(v[0])) {
				return v as PredictOrderRow[];
			}
			if (v && typeof v === "object") stack.push(v);
		}
	}
	return [];
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

export function createPrivateApiClient(
	getToken: GetToken,
	getIdentityToken?: GetIdentityToken
) {
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
		const idTok = getIdentityToken?.();
		if (typeof idTok === "string" && idTok.trim() !== "") {
			headers.set("privy-id-token", idTok.trim());
		}
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
			const body = await readJson<unknown>(res);
			const rows = normalizePredictOrdersList(body);
			// Only warn in dev when the wire shape looks wrong — not when API legitimately returns [].
			if (
				import.meta.env.DEV &&
				rows.length === 0 &&
				body != null &&
				!(Array.isArray(body) && body.length === 0)
			) {
				try {
					const s = JSON.stringify(body);
					console.warn(
						"[PrivateApi] getPredictOrders: 0 parsed rows; unexpected shape:",
						s.length > 800 ? `${s.slice(0, 800)}…` : s
					);
				} catch {
					console.warn(
						"[PrivateApi] getPredictOrders: parse yielded 0 rows (unserializable body)"
					);
				}
			}
			return rows;
		},

		/**
		 * Proxies `GET /v1/orders/matches` (API key only server-side).
		 * `signerAddress` must be checksummed if your backend validates it.
		 */
		async getPredictOrderMatches(params: {
			first?: string;
			after?: string;
			signerAddress?: string;
			marketId?: string;
			categoryId?: string;
			minValueUsdtWei?: string;
			isSignerMaker?: "true" | "false";
		}): Promise<PredictMatchEventRow[]> {
			const q = new URLSearchParams();
			if (params.first) q.set("first", params.first);
			if (params.after) q.set("after", params.after);
			if (params.signerAddress) q.set("signerAddress", params.signerAddress);
			if (params.marketId) q.set("marketId", params.marketId);
			if (params.categoryId) q.set("categoryId", params.categoryId);
			if (params.minValueUsdtWei) q.set("minValueUsdtWei", params.minValueUsdtWei);
			if (params.isSignerMaker) q.set("isSignerMaker", params.isSignerMaker);
			const qs = q.toString();
			const rawPath =
				import.meta.env.VITE_PREDICT_ORDER_MATCHES_PATH?.trim() ||
				"/api/predict/orders/matches";
			const matchesPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
			const res = await authorizedFetch(
				`${matchesPath}${qs ? `?${qs}` : ""}`
			);
			if (import.meta.env.DEV && res.status === 404) {
				console.warn(
					"[PrivateApi] getPredictOrderMatches:",
					res.status,
					"— nothing is listening at",
					matchesPath,
					"on your private API. Deploy/register GET /api/predict/orders/matches (or set VITE_PREDICT_ORDER_MATCHES_PATH to your mount)."
				);
			}
			const body = await readJson<unknown>(res);
			return normalizePredictMatchesList(body);
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

		// ── DFlow / Kalshi (Solana via Proof KYC) ──────────────────────

		async getDflowAccount(): Promise<DflowAccountResponse> {
			const res = await authorizedFetch("/api/dflow/account");
			return readJson<DflowAccountResponse>(res);
		},

		async postDflowAccountSync(body: DflowAccountSyncBody): Promise<void> {
			const res = await authorizedFetch("/api/dflow/account/sync", {
				method: "POST",
				body: JSON.stringify(body),
			});
			await readJson<unknown>(res);
		},

		async getDflowVerify(): Promise<DflowVerifyResponse> {
			const res = await authorizedFetch("/api/dflow/verify");
			return readJson<DflowVerifyResponse>(res);
		},

		async getDflowEvents(
			params?: Record<string, string>
		): Promise<DflowEventsResponse> {
			const q = new URLSearchParams(params);
			const res = await authorizedFetch(
				`/api/dflow/events?${q.toString()}`
			);
			return readJson<DflowEventsResponse>(res);
		},

		async getDflowOrderQuote(
			params: DflowOrderParams
		): Promise<DflowOrderResponse> {
			const q = dflowOrderParamsToQuery(params);
			const res = await authorizedFetch(
				`/api/dflow/order/quote?${q.toString()}`
			);
			return readJson<DflowOrderResponse>(res);
		},

		async getDflowOrder(
			params: DflowOrderParams
		): Promise<DflowOrderResponse> {
			const q = dflowOrderParamsToQuery(params);
			const res = await authorizedFetch(
				`/api/dflow/order?${q.toString()}`
			);
			return readJson<DflowOrderResponse>(res);
		},

		async postDflowFilterOutcomeMints(
			addresses: string[]
		): Promise<string[]> {
			const res = await authorizedFetch("/api/dflow/filter_outcome_mints", {
				method: "POST",
				body: JSON.stringify({ addresses }),
			});
			return readJson<string[]>(res);
		},

		async postDflowMarketsBatch(
			mints: string[]
		): Promise<DflowBatchMarket[]> {
			const res = await authorizedFetch("/api/dflow/markets/batch", {
				method: "POST",
				body: JSON.stringify({ mints }),
			});
			return readJson<DflowBatchMarket[]>(res);
		},

		async getDflowOnchainTrades(
			wallet: string
		): Promise<DflowOnchainTrade[]> {
			const q = new URLSearchParams({ wallet });
			const res = await authorizedFetch(
				`/api/dflow/onchain-trades?${q.toString()}`
			);
			return readJson<DflowOnchainTrade[]>(res);
		},
	};
}

export type PrivateApiClient = ReturnType<typeof createPrivateApiClient>;
