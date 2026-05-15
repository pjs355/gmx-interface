import type { Book } from "@predictdotfun/sdk";
import { getAccountOverviewApiPath } from "@/config/accountOverviewApi";
import { getPolymarketAccountApiPath } from "@/config/polymarketPrivateApiPath";
import {
	getPrivateApiAbsoluteUrl,
	getPrivateApiRequestUrl,
} from "@/config/privateApiBase";
import type { CreateOrderPayload } from "@/trading/predict/predictOrderSubmit";
import type {
	LimitlessEnsureAccountResponse,
	LimitlessSignedOrderSubmit,
	LimitlessVerifyAllowanceResult,
} from "@/trading/limitless/limitlessPrivateApiTypes";
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
import {
	normalizePredictActivityList,
	type PredictActivityEvent,
	type PredictActivityEventName,
} from "@/trading/predict/predictActivityApi";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { UmbrellaExchangeResolveQuery } from "@/trading/umbrellaVenueResolveKey";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	AccountOverview,
	LifiQuoteRequestBody,
	LifiQuoteResponse,
	LifiWithdrawCompositeData,
	LifiWithdrawPlanData,
	LifiWithdrawPlanLeg,
	LifiWithdrawPlanRequestBody,
	LifiStatusParams,
	LifiStatusResponse,
	PolymarketAccountResponse,
	PolymarketBuilderSignBody,
	PolymarketBuilderSignResponse,
	PolymarketL2CredentialsBody,
	PolymarketOrderSubmitBody,
	PolymarketSyncBody,
	PolymarketVerifyOnChainBody,
	CashSummary,
} from "@/types/trading";
import { PrivateApiError } from "./errors";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

/** Browser fetch budget for `POST /api/dflow/orders` — must exceed server order-status poll (~180s). */
export const DFLOW_ORDER_SUBMIT_FETCH_TIMEOUT_MS = 240_000;

function parseWithdrawPlanLeg(value: unknown): LifiWithdrawPlanLeg | null {
	if (!value || typeof value !== "object") return null;
	const mode = (value as Record<string, unknown>).mode;
	if (mode === "direct_transfer" || mode === "lifi") {
		return value as LifiWithdrawPlanLeg;
	}
	return null;
}

// ── Predict.fun venue state (mirrors server `publicPredictState`) ──

export type PredictPublicVenueState = {
	makerAddress?: string | null;
	signerAddress?: string | null;
	tradingEnabled?: boolean | null;
	approvalComplete?: boolean | null;
	jwtExpiresAtSec?: number | null;
	lastError?: string | null;
	hasJwt: boolean;
	jwtExpired: boolean;
};

export type PredictAccountResponse = {
	venueRegistered: boolean;
	venueStatus: "active" | "suspended" | "disconnected" | "not_registered";
	predictAccount: PredictPublicVenueState;
};

export type PredictAccountSyncBody = {
	makerAddress?: string;
	signerAddress?: string;
	tradingEnabled?: boolean;
	approvalComplete?: boolean;
	lastError?: string;
};

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
	/**
	 * From DFlow's `/order` response — the last block height at which the
	 * returned `transaction`'s `recentBlockhash` is valid. Forward to
	 * `POST /api/dflow/orders` (required) — the server polls `/order-status` until
	 * terminal. `GET /api/dflow/order-status` remains available for ad-hoc checks.
	 */
	lastValidBlockHeight?: number;
	code?: string;
	msg?: string;
	[key: string]: unknown;
};

/** Body for `POST /api/dflow/orders` — server submits the user-signed Solana tx. */
export type DflowOrderSubmitBody = {
	signedTx: string;
	inputMint: string;
	outputMint: string;
	amount?: string;
	side?: "BUY" | "SELL";
	outcome?: string;
	/** Mongo Umbrella `_id` — used for post-init `exchangeMatching.dflow` patch. */
	umbrellaId?: string;
	marketRef?: {
		externalMarketId?: string;
		tokenId?: string;
		questionId?: string;
	};
	/** Forwarded from the `/order` response that produced `signedTx` — required by the server for `/order-status` polling. */
	lastValidBlockHeight: number;
	/**
	 * YES/NO outcome mints for this Kalshi leg — lets the API persist `exchangeMatching.dflow`
	 * when DFlow metadata is slow after market init.
	 */
	outcomePairMints?: {
		yesMint: string;
		noMint: string;
	};
};

export type DflowUmbrellaMappingResult = {
	applied: boolean;
	reason?: string;
};

export type DflowOrderSubmitResponse = {
	success: true;
	signature: string;
	confirmationStatus: string;
	/**
	 * Echoed from the submit request — same window DFlow used while polling
	 * `/order-status` server-side until `closed`.
	 */
	lastValidBlockHeight: number;
	/** True when the tx initialized a new prediction market (multi-signer init-payer path). */
	initializedMarket: boolean;
	/** Terminal DFlow `/order-status` payload — server returns 200 only when `status === "closed"`. */
	orderStatus: DflowOrderStatusResponse;
	/** Present when init mapping was attempted; omitted on older servers. */
	umbrellaMapping?: DflowUmbrellaMappingResult;
};

/**
 * Response from `GET /api/dflow/order-status` — mirrors DFlow's
 * `OrderStatusResponse` 1:1. Terminal statuses are `closed` (success),
 * `failed`, and `expired`. For prediction-market orders the lifecycle runs
 * `pending` → `open` → `pendingClose` → terminal as DFlow's settlement
 * authority routes the order through Kalshi off-chain and settles back
 * on-chain (typically 1-2 minutes end-to-end).
 */
export type DflowOrderStatusResponse = {
	status: "pending" | "open" | "pendingClose" | "closed" | "failed" | "expired";
	inAmount: string;
	outAmount: string;
	fills?: Array<{
		signature: string;
		inputMint: string;
		inAmount: string;
		outputMint: string;
		outAmount: string;
	}>;
	reverts?: Array<{
		signature: string;
		mint: string;
		amount: string;
	}>;
	code?: string;
	msg?: string;
};

/** Structured DFlow terminal fields echoed on submit failures (predictions API). */
export type DflowOrderSubmitErrorDflow = {
	status: string;
	code?: string;
	msg?: string;
	reverts?: DflowOrderStatusResponse["reverts"];
	fills?: unknown[];
};

/** JSON body for failed `POST /api/dflow/orders` (422 / 502 / 504, etc.). */
export type DflowOrderSubmitErrorBody = {
	error: string;
	dflow?: DflowOrderSubmitErrorDflow;
	signature?: string;
};

export const DFLOW_ORDER_STATUS_TERMINAL = ["closed", "failed", "expired"] as const;
export type DflowTerminalOrderStatus = (typeof DFLOW_ORDER_STATUS_TERMINAL)[number];

export function isDflowOrderStatusTerminal(
	status: DflowOrderStatusResponse["status"],
): status is DflowTerminalOrderStatus {
	return (DFLOW_ORDER_STATUS_TERMINAL as readonly string[]).includes(status);
}

/** Market detail from `POST /api/v1/markets/batch` (DFlow Metadata API). */
export type DflowBatchMarket = {
	ticker: string;
	/** Nested Kalshi/DFlow event id when upstream sends snake_case (matches matcher / Mongo). */
	event_ticker?: string;
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

/**
 * `/api/dflow/onchain-trades` may return a bare array or a paged object. Call on the
 * inner JSON after `{ data: ... }` envelope unwrapping.
 */
function extractDflowOnchainTradesPayload(payload: unknown): {
	trades: DflowOnchainTrade[];
	cursor: string | null;
} {
	if (Array.isArray(payload)) {
		return { trades: payload as DflowOnchainTrade[], cursor: null };
	}
	if (!payload || typeof payload !== "object") {
		return { trades: [], cursor: null };
	}
	const o = payload as Record<string, unknown>;
	const raw =
		Array.isArray(o.trades)
			? o.trades
			: Array.isArray(o.results)
				? o.results
				: Array.isArray(o.items)
					? o.items
					: Array.isArray(o.data)
						? o.data
						: [];
	const trades = raw as DflowOnchainTrade[];
	const cursorRaw = o.cursor ?? o.nextCursor ?? o.next_cursor;
	let cursor: string | null = null;
	if (typeof cursorRaw === "string" && cursorRaw.trim()) cursor = cursorRaw.trim();
	const nestedPag =
		o.pagination && typeof o.pagination === "object"
			? (o.pagination as Record<string, unknown>).cursor
			: undefined;
	if (
		!cursor &&
		typeof nestedPag === "string" &&
		nestedPag.trim()
	) {
		cursor = nestedPag.trim();
	}
	return { trades, cursor };
}

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
		const envelope = raw as Record<string, unknown>;
		const inner = envelope.data;
		if (
			(inner === null || inner === undefined) &&
			envelope.success === true
		) {
			throw new PrivateApiError(
				"Private API returned success with null or missing `data` in the envelope.",
				502,
				raw,
			);
		}
		return inner as T;
	}
	return raw as T;
}

export type UmbrellaResolveExchangeKeysPayload = {
	byClientKey: Record<string, { umbrellaId?: string; displayName?: string }>;
	umbrellasById?: Record<string, Umbrella>;
};

/**
 * `readJson` unwraps `{ success, data }` → inner `data`. Umbrella resolve handlers
 * expect `{ success, data: { byClientKey, umbrellasById? } }` — re-wrap when the
 * payload is already the inner shape.
 */
function normalizeUmbrellaResolveExchangeKeysResponse(
	afterReadJson: unknown,
): { success: boolean; data?: UmbrellaResolveExchangeKeysPayload } {
	if (!afterReadJson || typeof afterReadJson !== "object") {
		return { success: false };
	}
	const o = afterReadJson as Record<string, unknown>;
	if ("success" in o && o.data != null && typeof o.data === "object") {
		const d = o.data as Record<string, unknown>;
		const byClientKey = d.byClientKey;
		if (byClientKey != null && typeof byClientKey === "object") {
			return {
				success: o.success === true,
				data: {
					byClientKey: byClientKey as UmbrellaResolveExchangeKeysPayload["byClientKey"],
					...(d.umbrellasById != null && typeof d.umbrellasById === "object"
						? {
								umbrellasById: d.umbrellasById as Record<string, Umbrella>,
							}
						: {}),
				},
			};
		}
	}
	if ("byClientKey" in o && o.byClientKey != null && typeof o.byClientKey === "object") {
		return {
			success: true,
			data: {
				byClientKey: o.byClientKey as UmbrellaResolveExchangeKeysPayload["byClientKey"],
				...(o.umbrellasById != null && typeof o.umbrellasById === "object"
					? { umbrellasById: o.umbrellasById as Record<string, Umbrella> }
					: {}),
			},
		};
	}
	return { success: false };
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

function appendDflowOrderSubmitDetailMessage(
	primary: string,
	body: Record<string, unknown>,
): string {
	const dflow = body.dflow;
	if (!dflow || typeof dflow !== "object") return primary;
	const msg = (dflow as Record<string, unknown>).msg;
	if (typeof msg !== "string") return primary;
	const t = msg.trim();
	if (!t || primary.includes(t)) return primary;
	return `${primary} — ${t}`;
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
	const errCode = tryStr(o.error);
	const errDetail = tryStr(o.detail);
	if (errCode) {
		if (errDetail && !errCode.includes(errDetail)) {
			return appendDflowOrderSubmitDetailMessage(
				`${errCode}: ${errDetail}`,
				o,
			);
		}
		return appendDflowOrderSubmitDetailMessage(errCode, o);
	}
	if (tryStr(o.message))
		return appendDflowOrderSubmitDetailMessage(tryStr(o.message)!, o);
	if (tryStr(o.detail))
		return appendDflowOrderSubmitDetailMessage(tryStr(o.detail)!, o);
	if (Array.isArray(o.message)) {
		const parts = o.message
			.filter((x): x is string => typeof x === "string")
			.map((x) => x.trim())
			.filter(Boolean);
		if (parts.length)
			return appendDflowOrderSubmitDetailMessage(parts.join("; "), o);
	}
	const nested = o.data;
	if (nested && typeof nested === "object") {
		const d = nested as Record<string, unknown>;
		if (tryStr(d.error))
			return appendDflowOrderSubmitDetailMessage(tryStr(d.error)!, o);
		if (tryStr(d.message))
			return appendDflowOrderSubmitDetailMessage(tryStr(d.message)!, o);
		if (tryStr(d.detail))
			return appendDflowOrderSubmitDetailMessage(tryStr(d.detail)!, o);
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

		/**
		 * Server-side replacement for the old per-client `Promise.all` of
		 * Base/Polygon/BSC/Solana RPC reads. The server resolves the user's
		 * five wallet roles from Privy + venue accounts, dials its private
		 * RPCs in parallel, and returns the human-decimal snapshot used by
		 * `CollateralTokenContext`.
		 */
		async getCashSummary(): Promise<CashSummary> {
			const res = await authorizedFetch("/portfolio/cash-summary");
			return readJson<CashSummary>(res);
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

		/**
		 * Server-mediated Polymarket order placement: UI signs locally via the
		 * SDK's create-only path (`createOrder` / `createMarketOrder`), then
		 * POSTs the signed order here. Server uses the user's stored L2 API
		 * credentials to forward the order to the Polymarket CLOB and persists
		 * a `VenueOrder` audit row.
		 */
		async postPolymarketOrder(
			body: PolymarketOrderSubmitBody
		): Promise<unknown> {
			const res = await authorizedFetch("/api/polymarket/orders", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson<unknown>(res);
		},

		async postFundingLifiQuote(
			body: LifiQuoteRequestBody
		): Promise<LifiQuoteResponse> {
			const res = await authorizedFetch("/funding/lifi/quote", {
				method: "POST",
				body: JSON.stringify(body),
			});
			const out = await readJson<LifiQuoteResponse>(res);
			if (
				typeof import.meta.env !== "undefined" &&
				(import.meta.env.DEV === true ||
					import.meta.env.VITE_DEBUG_TRADING === "true")
			) {
				try {
					console.debug(
						"[PrivateApi][LifiQuote] data.quote_raw_json",
						out?.quote != null
							? JSON.stringify(out.quote)
							: "(no quote)",
					);
				} catch (e) {
					console.error("error", e);
				}
			}
			return out;
		},

		async postFundingLifiWithdrawPlan(
			body: LifiWithdrawPlanRequestBody
		): Promise<LifiWithdrawPlanData> {
			const res = await authorizedFetch("/funding/lifi/withdraw/plan", {
				method: "POST",
				body: JSON.stringify(body),
			});
			const raw = await parseJsonSafe(res);
			if (!res.ok) {
				const msg = privateApiHttpErrorMessage(raw, res.status);
				throw new PrivateApiError(msg, res.status, raw);
			}
			if (!raw || typeof raw !== "object") {
				throw new PrivateApiError(
					"Withdraw plan: empty response",
					res.status,
					raw
				);
			}
			const obj = raw as Record<string, unknown>;
			const inner =
				obj.success === true &&
				obj.data != null &&
				typeof obj.data === "object"
					? (obj.data as Record<string, unknown>)
					: (raw as Record<string, unknown>);
			if (inner.mode === "composite") {
				const legsRaw = inner.legs;
				const totalAmountHuman = inner.totalAmountHuman;
				const toChain = inner.toChain;
				const toAsset = inner.toAsset;
				const toAddress = inner.toAddress;
				if (
					typeof totalAmountHuman !== "string" ||
					typeof toAddress !== "string" ||
					typeof toChain !== "number" ||
					(toAsset !== "USDC" && toAsset !== "USDT") ||
					!Array.isArray(legsRaw) ||
					legsRaw.length < 2
				) {
					throw new PrivateApiError(
						"Withdraw plan: invalid composite response",
						res.status,
						raw
					);
				}
				const legs: LifiWithdrawPlanLeg[] = [];
				for (const leg of legsRaw) {
					const parsed = parseWithdrawPlanLeg(leg);
					if (!parsed) {
						throw new PrivateApiError(
							"Withdraw plan: invalid leg in composite response",
							res.status,
							raw
						);
					}
					legs.push(parsed);
				}
				const composite: LifiWithdrawCompositeData = {
					mode: "composite",
					totalAmountHuman,
					toChain,
					toAsset,
					toAddress,
					legs,
				};
				return composite;
			}
			if (inner.mode !== "lifi" && inner.mode !== "direct_transfer") {
				const errMsg =
					typeof obj.error === "string" && obj.error.trim()
						? obj.error.trim()
						: "Withdraw plan: unexpected response";
				throw new PrivateApiError(errMsg, res.status, raw);
			}
			return inner as LifiWithdrawPlanData;
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

		async getPredictAccount(): Promise<PredictAccountResponse> {
			const res = await authorizedFetch("/api/predict/account");
			return readJson<PredictAccountResponse>(res);
		},

		async postPredictAccountSync(body: PredictAccountSyncBody): Promise<void> {
			const res = await authorizedFetch("/api/predict/account/sync", {
				method: "POST",
				body: JSON.stringify(body),
			});
			await readJson<unknown>(res);
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
			// Dev-only: unexpected wire shape (not a user-facing warning).
			if (
				import.meta.env.DEV &&
				rows.length === 0 &&
				body != null &&
				!(Array.isArray(body) && body.length === 0)
			) {
				try {
					const s = JSON.stringify(body);
					console.debug(
						"[PrivateApi] getPredictOrders: 0 parsed rows; unexpected shape:",
						s.length > 800 ? `${s.slice(0, 800)}…` : s
					);
				} catch {
					console.debug(
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
				console.debug(
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

		/**
		 * Proxies `GET /v1/account/activity` (JWT, per-user). Returns the user's full trading
		 * activity feed — `MATCH_SUCCESS` (fills) and `REDEEM` (claims) included — so the
		 * History tab keeps showing claimed/redeemed Predict winners after their ERC1155
		 * tokens are burned and disappear from `/v1/positions/{address}`.
		 */
		async getPredictAccountActivity(params?: {
			first?: number;
			after?: string;
			eventTypes?: PredictActivityEventName[];
		}): Promise<PredictActivityEvent[]> {
			const q = new URLSearchParams();
			q.set("first", String(params?.first ?? 200));
			if (params?.after) q.set("after", params.after);
			if (params?.eventTypes?.length) {
				q.set("eventTypes", params.eventTypes.join(","));
			}
			const res = await authorizedFetch(
				`/api/predict/account/activity?${q.toString()}`
			);
			if (import.meta.env.DEV && res.status === 404) {
				console.debug(
					"[PrivateApi] getPredictAccountActivity:",
					res.status,
					"— nothing is listening at /api/predict/account/activity on your private API.",
					"Deploy/register GET /api/predict/account/activity (proxy of GET /v1/account/activity)."
				);
			}
			const body = await readJson<unknown>(res);
			return normalizePredictActivityList(body);
		},

		/** Batch-resolve venue keys to LevelUp umbrella id + displayName (Mongo `exchangeMatching`). */
		async postUmbrellaResolveExchangeKeys(body: {
			queries: UmbrellaExchangeResolveQuery[];
			/** When true, response includes `umbrellasById` (full lean rows + children) for resolved hits. */
			includeUmbrellaPayloads?: boolean;
		}): Promise<{
			success: boolean;
			data?: UmbrellaResolveExchangeKeysPayload;
		}> {
			const res = await authorizedFetch("/api/umbrellas/resolve-exchange-keys", {
				method: "POST",
				body: JSON.stringify(body),
			});
			const inner = await readJson<unknown>(res);
			return normalizeUmbrellaResolveExchangeKeysResponse(inner);
		},

		/** History-only batch resolve: same `queries` as resolve-exchange-keys; always returns `umbrellasById` for hits. */
		async postUmbrellaResolveVenueHistory(body: {
			queries: UmbrellaExchangeResolveQuery[];
		}): Promise<{
			success: boolean;
			data?: UmbrellaResolveExchangeKeysPayload;
		}> {
			const res = await authorizedFetch("/api/umbrellas/resolve-venue-history", {
				method: "POST",
				body: JSON.stringify(body),
			});
			const inner = await readJson<unknown>(res);
			return normalizeUmbrellaResolveExchangeKeysResponse(inner);
		},

		/** Resolve a single Polymarket CTF `conditionId` to a lean umbrella + children (same rules as batch Poly resolve). */
		async postUmbrellaResolvePolymarketCondition(body: {
			conditionId: string;
		}): Promise<{
			success: boolean;
			data?: { conditionId: string; umbrella: Umbrella | null };
		}> {
			const res = await authorizedFetch("/api/umbrellas/resolve-polymarket-condition", {
				method: "POST",
				body: JSON.stringify(body),
			});
			return readJson(res);
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

		/**
		 * Server submits the signed tx, polls DFlow `/order-status` until `closed`,
		 * then returns 200 with `orderStatus`. Non-2xx carries DFlow failure (`error`, optional `dflow`).
		 */
		async postDflowOrder(
			body: DflowOrderSubmitBody
		): Promise<DflowOrderSubmitResponse> {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort();
			}, DFLOW_ORDER_SUBMIT_FETCH_TIMEOUT_MS);
			try {
				const res = await authorizedFetch("/api/dflow/orders", {
					method: "POST",
					body: JSON.stringify(body),
					signal: controller.signal,
				});
				return readJson<DflowOrderSubmitResponse>(res);
			} catch (e: unknown) {
				if (
					e instanceof Error &&
					e.name === "AbortError"
				) {
					throw new PrivateApiError(
						"Kalshi order confirmation timed out waiting for the server. Check Positions or try again.",
						504,
						null,
					);
				}
				throw e;
			} finally {
				clearTimeout(timer);
			}
		},

		/**
		 * DFlow claim / redeem — same body and response as `postDflowOrder`, but POSTs
		 * `/api/claims/dflow` so winnings use the dedicated claims namespace on the API.
		 */
		async postClaimDflow(
			body: DflowOrderSubmitBody
		): Promise<DflowOrderSubmitResponse> {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort();
			}, DFLOW_ORDER_SUBMIT_FETCH_TIMEOUT_MS);
			try {
				const res = await authorizedFetch("/api/claims/dflow", {
					method: "POST",
					body: JSON.stringify(body),
					signal: controller.signal,
				});
				return readJson<DflowOrderSubmitResponse>(res);
			} catch (e: unknown) {
				if (
					e instanceof Error &&
					e.name === "AbortError"
				) {
					throw new PrivateApiError(
						"Kalshi claim confirmation timed out waiting for the server. Check Positions or try again.",
						504,
						null,
					);
				}
				throw e;
			} finally {
				clearTimeout(timer);
			}
		},

		/**
		 * Lifecycle status for a previously-submitted DFlow prediction-market
		 * order. Poll until `status` is one of `closed | failed | expired`
		 * (use `isDflowOrderStatusTerminal`). Returns the actual `inAmount` /
		 * `outAmount` filled and any `fills` / `reverts` once terminal.
		 */
		async getDflowOrderStatus(
			signature: string,
			lastValidBlockHeight?: number,
		): Promise<DflowOrderStatusResponse> {
			const q = new URLSearchParams({ signature });
			if (
				typeof lastValidBlockHeight === "number" &&
				Number.isInteger(lastValidBlockHeight) &&
				lastValidBlockHeight > 0
			) {
				q.set("lastValidBlockHeight", String(lastValidBlockHeight));
			}
			const res = await authorizedFetch(
				`/api/dflow/order-status?${q.toString()}`
			);
			return readJson<DflowOrderStatusResponse>(res);
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

		async postDflowTokenBalances(
			wallet: string,
			mints: string[],
		): Promise<
			Array<{ mint: string; balance: number; decimals: number }>
		> {
			const res = await authorizedFetch("/api/dflow/token-balances", {
				method: "POST",
				body: JSON.stringify({
					wallet: wallet.trim(),
					mints,
				}),
			});
			return readJson<
				Array<{ mint: string; balance: number; decimals: number }>
			>(res);
		},

		async getDflowOnchainTrades(
			wallet: string
		): Promise<DflowOnchainTrade[]> {
			const walletTrim = wallet.trim();
			const merged: DflowOnchainTrade[] = [];
			const dedupeKeys = new Set<string>();
			let cursor: string | undefined;
			const limit = 250;
			const maxPages = 80;

			for (let page = 0; page < maxPages; page++) {
				const q = new URLSearchParams({ wallet: walletTrim });
				q.set("limit", String(limit));
				if (cursor) q.set("cursor", cursor);

				const res = await authorizedFetch(
					`/api/dflow/onchain-trades?${q.toString()}`
				);
				const body = await parseJsonSafe(res);
				if (!res.ok) {
					throw new PrivateApiError(
						privateApiHttpErrorMessage(body, res.status),
						res.status,
						body,
					);
				}
				const inner = unwrapEnvelope(body);
				const { trades, cursor: nextCursor } =
					extractDflowOnchainTradesPayload(inner);
				for (const t of trades) {
					const k = `${t.transactionSignature}:${t.id}`;
					if (dedupeKeys.has(k)) continue;
					dedupeKeys.add(k);
					merged.push(t);
				}

				const nc =
					typeof nextCursor === "string" && nextCursor.trim()
						? nextCursor.trim()
						: null;
				if (!nc || trades.length === 0) break;
				if (nc === cursor) break;
				cursor = nc;
				if (trades.length < limit) break;
			}

			return merged;
		},

		// ── Limitless (Base) ───────────────────────────────────────────

		async getLimitlessAuthSigningMessage(): Promise<string> {
			const res = await authorizedFetch("/api/limitless/auth/signing-message");
			if (!res.ok) {
				const errBody = await res.text().catch(() => "");
				throw new PrivateApiError(
					`Limitless signing-message request failed (${res.status}).`,
					res.status,
					errBody,
				);
			}
			return (await res.text()).trimEnd();
		},

		async getLimitlessMarketBySlug(slug: string): Promise<unknown> {
			const s = encodeURIComponent(slug.trim());
			if (!s) {
				throw new PrivateApiError("Limitless market slug is empty.", 400, null);
			}
			const res = await authorizedFetch(`/api/limitless/markets/${s}`);
			return readJson<unknown>(res);
		},

		async postLimitlessEnsureAccount(
			body?: Record<string, unknown>,
		): Promise<LimitlessEnsureAccountResponse> {
			const res = await authorizedFetch("/api/limitless/ensure-account", {
				method: "POST",
				body: JSON.stringify(body ?? {}),
			});
			const data = await readJson<LimitlessEnsureAccountResponse>(res);
			if (
				import.meta.env.DEV &&
				isTradingDebugLoggingEnabled() &&
				data?.canonicalSlugMissing
			) {
				console.info("[Limitless/API]", "ensure-account", {
					canonicalSlugMissing: true,
					note: "Warmup allowance probe skipped — configure an active Umbrella with exchangeMatching.limitless.slug for server-side spender snapshot.",
				});
			}
			return data;
		},

		async postLimitlessVerifyAllowance(
			marketSlug: string,
			opts?: { tokenId?: string },
		): Promise<LimitlessVerifyAllowanceResult> {
			const slug = marketSlug.trim();
			const tokenId = opts?.tokenId?.trim();
			if (import.meta.env.DEV && isTradingDebugLoggingEnabled()) {
				console.info("[Limitless/API]", "POST verify-allowance", {
					marketSlug: slug,
					tokenId: tokenId ? `${tokenId.slice(0, 14)}…` : undefined,
				});
			}
			const res = await authorizedFetch("/api/limitless/account/verify-allowance", {
				method: "POST",
				body: JSON.stringify(
					tokenId ? { marketSlug: slug, tokenId } : { marketSlug: slug },
				),
			});
			const out = await readJson<LimitlessVerifyAllowanceResult>(res);
			if (
				import.meta.env.DEV &&
				isTradingDebugLoggingEnabled() &&
				out &&
				typeof out === "object"
			) {
				const o = out as Record<string, unknown>;
				const clip = (s: unknown, n = 12) =>
					typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s;
				console.info("[Limitless/API]", "verify-allowance response", {
					marketSlug: o.marketSlug,
					declaredMarketSlug: o.declaredMarketSlug,
					effectiveMarketSlug: o.effectiveMarketSlug,
					hasMinimumAllowance: o.hasMinimumAllowance,
					spender: clip(o.spender, 12),
					usdcSpendersCount: Array.isArray(o.usdcSpenders)
						? (o.usdcSpenders as unknown[]).length
						: 0,
					hasCtfAddress: typeof o.ctfAddress === "string" && Boolean((o.ctfAddress as string).trim()),
					hasVenueAdapter: o.venueAdapter != null && String(o.venueAdapter).trim() !== "",
					partnerAllowanceOwnerId: o.partnerAllowanceOwnerId,
					limitlessPartnerAllowanceType: o.limitlessPartnerAllowanceType,
					limitlessCheckedAddress: clip(o.limitlessCheckedAddress, 14),
					limitlessAllowanceRaw: clip(o.limitlessAllowanceRaw, 24),
				});
			}
			if (!out || typeof out !== "object") {
				throw new PrivateApiError(
					"verify-allowance returned an invalid payload.",
					502,
					out,
				);
			}
			const o = out as Record<string, unknown>;
			if (typeof o.marketSlug !== "string" || !o.marketSlug.trim()) {
				throw new PrivateApiError(
					"verify-allowance response missing marketSlug.",
					502,
					out,
				);
			}
			if (typeof o.spender !== "string" || !o.spender.trim()) {
				throw new PrivateApiError(
					"verify-allowance response missing spender (venue exchange).",
					502,
					out,
				);
			}
			return out;
		},

		async postLimitlessOrder(body: LimitlessSignedOrderSubmit): Promise<unknown> {
			if (import.meta.env.DEV && isTradingDebugLoggingEnabled()) {
				const ord = body.order;
				const sideLabel = ord.side === 0 ? "BUY" : ord.side === 1 ? "SELL" : "?";
				console.info("[Limitless/API]", "POST orders (submit)", {
					marketSlug: body.marketSlug,
					orderType: body.orderType,
					side: sideLabel,
					tokenId: `${ord.tokenId?.toString?.().slice(0, 14) ?? "?"}…`,
				});
			}
			const res = await authorizedFetch("/api/limitless/orders", {
				method: "POST",
				body: JSON.stringify(body),
			});
			try {
				const parsed = await readJson<unknown>(res);
				if (import.meta.env.DEV && isTradingDebugLoggingEnabled()) {
					const po = parsed as Record<string, unknown> | null;
					const meta =
						po && typeof po === "object" && "_meta" in po
							? (po._meta as { effectiveMarketSlug?: string; declaredMarketSlug?: string })
							: undefined;
					const keysWithoutMeta =
						po && typeof po === "object"
							? Object.keys(po).filter((k) => k !== "_meta").slice(0, 20)
							: [];
					console.info("[Limitless/API]", "POST orders OK", {
						requestMarketSlug: body.marketSlug,
						effectiveMarketSlugFromApi: meta?.effectiveMarketSlug,
						declaredMarketSlugFromApi: meta?.declaredMarketSlug,
						responseKeys: keysWithoutMeta.length ? keysWithoutMeta : typeof parsed,
					});
				}
				return parsed;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (import.meta.env.DEV && err instanceof PrivateApiError) {
					const b = err.body;
					if (b && typeof b === "object") {
						const o = b as Record<string, unknown>;
						const diag = o._diagnostic;
						const details = o.details;
						let detailsForLog: unknown = details;
						if (details !== undefined) {
							try {
								const s = JSON.stringify(details);
								detailsForLog =
									s.length > 4000 ? `${s.slice(0, 4000)}…` : details;
							} catch {
								detailsForLog = "(unserializable details)";
							}
						}
						console.error("[Limitless/API]", "POST orders failed", {
							marketSlug: body.marketSlug,
							orderType: body.orderType,
							message: msg,
							httpStatus: err.status,
							diagnostic: diag,
							details: detailsForLog,
							hint:
								msg.includes("null or missing `data`") ||
								msg.includes("reading 'data')")
									? "If message mentions envelope `data`, the private API returned `{ success, data: null }`. If it mentions reading 'data' from null, that is usually Privy embedded RPC, not this HTTP response."
									: undefined,
						});
					} else {
						console.error("[Limitless/API]", "POST orders failed", {
							marketSlug: body.marketSlug,
							orderType: body.orderType,
							message: msg,
							httpStatus: err.status,
							hint:
								msg.includes("null or missing `data`") ||
								msg.includes("reading 'data')")
									? "If message mentions envelope `data`, the private API returned `{ success, data: null }`. If it mentions reading 'data' from null, that is usually Privy embedded RPC, not this HTTP response."
									: undefined,
						});
					}
				} else {
					console.error("[Limitless/API]", "POST orders failed", {
						marketSlug: body.marketSlug,
						orderType: body.orderType,
						message: msg,
						hint:
							msg.includes("null or missing `data`") ||
							msg.includes("reading 'data')")
								? "If message mentions envelope `data`, the private API returned `{ success, data: null }`. If it mentions reading 'data' from null, that is usually Privy embedded RPC, not this HTTP response."
								: undefined,
					});
				}
				throw err;
			}
		},

		async getLimitlessPositions(): Promise<unknown> {
			const res = await authorizedFetch("/api/limitless/positions");
			return readJson<unknown>(res);
		},

		async getLimitlessPortfolioPositionsVenue(): Promise<unknown> {
			const res = await authorizedFetch("/api/limitless/portfolio/positions-venue");
			return readJson<unknown>(res);
		},

		async getLimitlessOpenOrders(): Promise<unknown> {
			const res = await authorizedFetch("/api/limitless/orders/open");
			return readJson<unknown>(res);
		},

		async getLimitlessPortfolioHistory(q: {
			limit: number;
			/** Opaque cursor from previous response `nextCursor` (Limitless OpenAPI). */
			cursor?: string | null;
		}): Promise<unknown> {
			const p = new URLSearchParams({ limit: String(q.limit) });
			const c = q.cursor?.trim();
			if (c) p.set("cursor", c);
			const res = await authorizedFetch(
				`/api/limitless/portfolio/history?${p.toString()}`,
			);
			return readJson<unknown>(res);
		},

		async deleteLimitlessOrder(orderId: string): Promise<unknown> {
			const enc = encodeURIComponent(orderId.trim());
			const res = await authorizedFetch(`/api/limitless/orders/${enc}`, {
				method: "DELETE",
			});
			return readJson<unknown>(res);
		},

		/**
		 * Partner-signed withdrawal from the Limitless server-wallet sub-account to the
		 * user’s Base smart wallet (must match profile `smart_wallet` on the API).
		 */
		async postLimitlessPortfolioWithdraw(input: {
			amountHuman: number;
			destination: string;
		}): Promise<unknown> {
			const res = await authorizedFetch("/api/limitless/portfolio/withdraw", {
				method: "POST",
				body: JSON.stringify({
					amountHuman: input.amountHuman,
					destination: input.destination.trim(),
				}),
			});
			return readJson<unknown>(res);
		},

		/**
		 * Marks the post-signup setup modal flow as complete on the server.
		 * Returns the canonical `onboardingCompletedAt` timestamp (which may
		 * be earlier than this call if the field was already set by a
		 * concurrent tab — the server uses an atomic "only set if missing"
		 * write so retries are safe). Always called BEFORE triggering Privy
		 * `fundWallet`: the deposit step has no completion signal, so we
		 * commit the flag first to guarantee the user never sees the modal
		 * again, even if they dismiss the deposit popup.
		 */
		async postOnboardingComplete(): Promise<{
			onboardingCompletedAt: string | null;
		}> {
			const res = await authorizedFetch(
				"/profiles/me/onboarding/complete",
				{ method: "POST" },
			);
			const data = (await readJson<{
				success?: boolean;
				data?: { onboardingCompletedAt?: string | null };
			}>(res)) ?? {};
			const ts = data?.data?.onboardingCompletedAt ?? null;
			return { onboardingCompletedAt: ts };
		},
	};
}

export type PrivateApiClient = ReturnType<typeof createPrivateApiClient>;
