import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ClobClient,
	Chain,
	OrderType,
	SignatureTypeV2,
	type ApiKeyCreds,
	type CreateOrderOptions,
	type Side,
	type SignedOrder,
	type TickSize,
} from "@polymarket/clob-client-v2";
import { usePrivy } from "@privy-io/react-auth";
import { POLYMARKET_BUILDER_CODE } from "./polymarketBuilderCode";
import { ethers5JsonRpcSignerFromEip1193 } from "./ethers5FromEip1193";
import { usePolymarketEoaWalletClient } from "./usePolymarketEoaWalletClient";
import { useAccountOverview } from "@/trading/hooks/useAccountOverview";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useTradingWallets } from "@/trading/useWallets";
import {
	ensurePolymarketClobOrderSuccess,
	summarizeClobResultForLog,
} from "./polymarketClobOrderResult";
import {
	logPolymarketOrderSuccessResponse,
	wrapEip1193ForPolymarketDevLogging,
	type Eip1193Like,
} from "./polymarketOrderDebug";
import type { PolymarketOrderSubmitBody } from "@/types/trading";

/**
 * Coerces a signed order returned by `ClobClient.createOrder` /
 * `createMarketOrder` (typed as `SignedOrderV1 | SignedOrderV2`) into the
 * `Record<string, string | number>` shape the server expects. The server
 * detects V1 vs V2 by presence of `timestamp/metadata/builder`.
 */
function signedOrderToRecord(
	order: SignedOrder,
): Record<string, string | number> {
	const out: Record<string, string | number> = {};
	for (const [key, value] of Object.entries(order as Record<string, unknown>)) {
		if (key === "signature" && value && typeof value === "object") {
			const sig = value as { signature?: unknown } | string;
			if (typeof sig === "string") {
				out[key] = sig;
			} else if (typeof sig === "object" && typeof sig.signature === "string") {
				out[key] = sig.signature;
			}
			continue;
		}
		if (typeof value === "string" || typeof value === "number") {
			out[key] = value;
		} else if (typeof value === "bigint") {
			out[key] = value.toString();
		} else if (value !== undefined && value !== null) {
			out[key] = String(value);
		}
	}
	return out;
}

/**
 * Polymarket CLOB trading session: derives L2 API credentials with the embedded
 * EOA, then builds a `ClobClient` with `POLY_1271` + the user's **deposit
 * wallet** as the funder. The CLOB validates orders via ERC-1271 against the
 * deposit wallet (which is owned by the Privy embedded EOA). See
 * `POLYMARKET_TRADING.md` in this folder for the full wallet, collateral, and
 * Data API model.
 */
const CLOB_HOST =
	import.meta.env.VITE_POLYMARKET_CLOB_PROXY === "true"
		? "/polymarket-clob"
		: "https://clob.polymarket.com";

const DEV = import.meta.env.DEV;

/**
 * Bumped to `:v2` after the deposit-wallet migration so any creds derived
 * against the legacy Safe funder cohort are not reused — the funder address
 * changed for every existing user, which would otherwise cause cred rejection
 * on first order.
 */
const CREDS_STORAGE_PREFIX = "levelup:pm-clob-creds:v2:";

function credsStorageKey(eoa: string, safe: string): string {
	return `${CREDS_STORAGE_PREFIX}${eoa.toLowerCase()}:${safe.toLowerCase()}`;
}

function readStoredCreds(eoa: string, safe: string): ApiKeyCreds | null {
	try {
		const raw = sessionStorage.getItem(credsStorageKey(eoa, safe));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ApiKeyCreds>;
		if (
			typeof parsed.key === "string" &&
			typeof parsed.secret === "string" &&
			typeof parsed.passphrase === "string"
		) {
			return {
				key: parsed.key,
				secret: parsed.secret,
				passphrase: parsed.passphrase,
			};
		}
		return null;
	} catch {
		return null;
	}
}

function writeStoredCreds(eoa: string, safe: string, creds: ApiKeyCreds): void {
	try {
		sessionStorage.setItem(
			credsStorageKey(eoa, safe),
			JSON.stringify(creds)
		);
	} catch {
		/* ignore quota / private mode */
	}
}

function formatBlockedReason(
	requiredNextAction: unknown,
	safe: string | undefined,
	eoaReady: boolean
): string | null {
	if (!eoaReady) {
		return "Sign in and open your embedded wallet to trade on Polymarket.";
	}
	if (!safe) {
		return "Polymarket deposit wallet not found. Open Transfers to finish onboarding it.";
	}
	if (requiredNextAction == null) return null;
	if (typeof requiredNextAction === "string") {
		return requiredNextAction;
	}
	if (typeof requiredNextAction === "object" && requiredNextAction) {
		const o = requiredNextAction as { label?: string; step?: string; detail?: string };
		return o.label || o.step || o.detail || null;
	}
	return null;
}

export type UsePolymarketClobTradingSessionOptions = {
	enabled?: boolean;
	profileId?: string;
};

export type PlaceClobLimitOrderArgs = {
	tokenId: string;
	price: number;
	size: number;
	side: Side;
	/** When omitted, resolved from the CLOB for this token. */
	tickStyle?: TickSize;
	/** When omitted, resolved from the CLOB for this token. */
	negRisk?: boolean;
};

export type PlaceClobMarketOrderArgs = {
	tokenId: string;
	/** BUY: USDC to spend; SELL: shares to sell */
	amount: number;
	side: Side;
	tickStyle?: TickSize;
	negRisk?: boolean;
	orderType?: OrderType.FOK | OrderType.FAK;
};

export function usePolymarketClobTradingSession(
	options: UsePolymarketClobTradingSessionOptions = {}
) {
	const { enabled = true, profileId: profileIdOpt } = options;
	const { authenticated, ready: privyReady } = usePrivy();
	const profileQuery = useCurrentProfile({
		enabled: enabled && authenticated,
	});
	const profileId = profileIdOpt ?? profileQuery.data?._id;
	const overviewQuery = useAccountOverview(profileId);
	const poly = usePolymarketBuilder({
		enabled: enabled && authenticated,
		profileId,
	});
	/** Same resolution as Transfers (`useFundingAddresses`): overview venue + polymarket account. */
	const wallets = useTradingWallets(overviewQuery.data, poly.data);
	const eoa = usePolymarketEoaWalletClient();
	const privateApi = usePrivateApiClient();

	const eip1193ForSigner = eoa.eip1193Provider;
	const eip1193 = useMemo(
		() =>
			eip1193ForSigner
				? wrapEip1193ForPolymarketDevLogging(
						eip1193ForSigner as Eip1193Like
					)
				: null,
		[eip1193ForSigner]
	);
	const eoaAddress = eoa.address;
	// `wallets.polymarketSafe` is the historical name; after the deposit-wallet
	// migration this value is the deposit wallet address (used as the CLOB
	// funder under `SignatureTypeV2.POLY_1271`).
	const safe = wallets.polymarketSafe;

	const blockedReason = useMemo(() => {
		if (!enabled) return null;
		if (!privyReady || !authenticated) return "Sign in to trade.";
		if (authenticated && poly.isFetching && !poly.isFetched) {
			return "Loading Polymarket account…";
		}
		if (profileId && overviewQuery.isLoading && !safe) {
			return "Loading Polymarket account…";
		}
		/* Once Safe + signer match Transfers, try CLOB — don’t block on stale requiredNextAction. */
		if (safe && eoa.ready) {
			return null;
		}
		return formatBlockedReason(poly.requiredNextAction, safe, Boolean(eoa.ready));
	}, [
		enabled,
		privyReady,
		authenticated,
		poly.isFetching,
		poly.isFetched,
		poly.requiredNextAction,
		safe,
		eoa.ready,
		profileId,
		overviewQuery.isLoading,
	]);

	const canInit = Boolean(
		enabled &&
			privyReady &&
			authenticated &&
			poly.isFetched &&
			eoaAddress &&
			eip1193 &&
			safe &&
			!eoa.error
	);

	const [clobClient, setClobClient] = useState<ClobClient | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const genRef = useRef(0);

	const refresh = useCallback(() => {
		setClobClient(null);
		setError(null);
		eoa.refresh();
		void poly.refetch();
	}, [eoa, poly]);

	useEffect(() => {
		if (!canInit || !eoaAddress || !eip1193 || !safe) {
			setClobClient(null);
			setLoading(false);
			setError(null);
			return;
		}

		const gen = ++genRef.current;
		let cancelled = false;

		(async () => {
			setLoading(true);
			setError(null);
			try {
				const signer = ethers5JsonRpcSignerFromEip1193(
					eip1193 as Eip1193Like,
					eoaAddress
				);

				let creds = readStoredCreds(eoaAddress, safe);
				const credsClient = new ClobClient({
					host: CLOB_HOST,
					chain: Chain.POLYGON,
					signer,
				});
				if (!creds) {
					creds = await credsClient.createOrDeriveApiKey();
					writeStoredCreds(eoaAddress, safe, creds);
				}

				// Sync L2 creds to server-side at-rest store so
				// `POST /api/polymarket/orders` can compute the L2 HMAC
				// when forwarding to Polymarket. The endpoint encrypts
				// with `POLYMARKET_L2_CREDS_ENCRYPTION_KEY` (AES-256-GCM)
				// and upserts via `mergePolymarketState`, so this is
				// idempotent — we run it on every session init to handle
				// fresh devices, sessionStorage clears, and DB state
				// drift. The server cannot derive these (no wallet);
				// only the UI can produce them.
				await privateApi.postPolymarketL2Credentials({
					key: creds.key,
					secret: creds.secret,
					passphrase: creds.passphrase,
				});

				const tradingClient = new ClobClient({
					host: CLOB_HOST,
					chain: Chain.POLYGON,
					signer,
					creds,
					signatureType: SignatureTypeV2.POLY_1271,
					funderAddress: safe,
					builderConfig: { builderCode: POLYMARKET_BUILDER_CODE },
				});

				if (cancelled || gen !== genRef.current) return;
				setClobClient(tradingClient);
				setError(null);
			} catch (e) {
				if (cancelled || gen !== genRef.current) return;
				setClobClient(null);
				if (DEV) {
					// eslint-disable-next-line no-console
					console.error(
						"[Polymarket CLOB] session init failed — check L2 API derivation, wallet, and network",
						e
					);
				}
				setError(e instanceof Error ? e.message : "CLOB session error");
			} finally {
				if (!cancelled && gen === genRef.current) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [canInit, eoaAddress, eip1193, safe, privateApi]);

	const placeLimitOrder = useCallback(
		async (args: PlaceClobLimitOrderArgs) => {
			if (!clobClient) {
				throw new Error("CLOB client is not ready.");
			}
			const tickSize =
				args.tickStyle ??
				((await clobClient.getTickSize(args.tokenId)) as TickSize);
			const negRisk =
				args.negRisk ?? (await clobClient.getNegRisk(args.tokenId));
			const orderOpts: CreateOrderOptions = { tickSize, negRisk };
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] signing limit order (server will post)", {
					tokenId: args.tokenId,
					price: args.price,
					size: args.size,
					side: args.side,
					tickSize,
					negRisk,
				});
			}
			const signedOrder = await clobClient.createOrder(
				{
					tokenID: args.tokenId,
					price: args.price,
					size: args.size,
					side: args.side,
				},
				orderOpts
			);
			const submitBody: PolymarketOrderSubmitBody = {
				signedOrder: signedOrderToRecord(signedOrder),
				orderType: OrderType.GTC,
				marketRef: { tokenId: args.tokenId },
				requestedSize: String(args.size),
				requestedPrice: String(args.price),
			};
			const result = await privateApi.postPolymarketOrder(submitBody);
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] limit order response", summarizeClobResultForLog(result));
			}
			ensurePolymarketClobOrderSuccess(result, "limit order");
			logPolymarketOrderSuccessResponse(result);
			return result;
		},
		[clobClient, privateApi]
	);

	const placeMarketOrder = useCallback(
		async (args: PlaceClobMarketOrderArgs) => {
			if (!clobClient) {
				throw new Error("CLOB client is not ready.");
			}
			const tickSize =
				args.tickStyle ??
				((await clobClient.getTickSize(args.tokenId)) as TickSize);
			const negRisk =
				args.negRisk ?? (await clobClient.getNegRisk(args.tokenId));
			const orderOpts: CreateOrderOptions = { tickSize, negRisk };
			const t = args.orderType ?? OrderType.FOK;
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] signing market order (server will post)", {
					tokenId: args.tokenId,
					amount: args.amount,
					side: args.side,
					orderType: t,
					tickSize,
					negRisk,
				});
			}
			const signedOrder = await clobClient.createMarketOrder(
				{
					tokenID: args.tokenId,
					amount: args.amount,
					side: args.side,
				},
				orderOpts
			);
			const submitBody: PolymarketOrderSubmitBody = {
				signedOrder: signedOrderToRecord(signedOrder),
				orderType: t,
				marketRef: { tokenId: args.tokenId },
				requestedSize: String(args.amount),
			};
			const result = await privateApi.postPolymarketOrder(submitBody);
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] market order response", summarizeClobResultForLog(result));
			}
			ensurePolymarketClobOrderSuccess(result, "market order");
			logPolymarketOrderSuccessResponse(result);
			return result;
		},
		[clobClient, privateApi]
	);

	const ready = Boolean(clobClient && !loading && !error);

	return {
		clobClient,
		loading,
		error,
		blockedReason: blockedReason || (eoa.error as string | null),
		ready,
		safeAddress: safe,
		eoaAddress,
		refresh,
		placeLimitOrder,
		placeMarketOrder,
		polyAccountLoading: poly.isLoading,
	};
}
