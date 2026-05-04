import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ClobClient,
	Chain,
	OrderType,
	SignatureTypeV2,
	type ApiKeyCreds,
	type CreateOrderOptions,
	type Side,
	type TickSize,
} from "@polymarket/clob-client-v2";
import { usePrivy } from "@privy-io/react-auth";
import { POLYMARKET_BUILDER_CODE } from "./polymarketBuilderCode";
import { ethers5JsonRpcSignerFromEip1193 } from "./ethers5FromEip1193";
import { usePolymarketEoaWalletClient } from "./usePolymarketEoaWalletClient";
import { useAccountOverview } from "@/trading/hooks/useAccountOverview";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
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
	}, [canInit, eoaAddress, eip1193, safe]);

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
				console.info("[Polymarket CLOB] posting limit order", {
					tokenId: args.tokenId,
					price: args.price,
					size: args.size,
					side: args.side,
					tickSize,
					negRisk,
				});
			}
			const result = await clobClient.createAndPostOrder(
				{
					tokenID: args.tokenId,
					price: args.price,
					size: args.size,
					side: args.side,
				},
				orderOpts,
				OrderType.GTC
			);
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] limit order response", summarizeClobResultForLog(result));
			}
			ensurePolymarketClobOrderSuccess(result, "limit order");
			logPolymarketOrderSuccessResponse(result);
			return result;
		},
		[clobClient]
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
				console.info("[Polymarket CLOB] posting market order", {
					tokenId: args.tokenId,
					amount: args.amount,
					side: args.side,
					orderType: t,
					tickSize,
					negRisk,
				});
			}
			const result = await clobClient.createAndPostMarketOrder(
				{
					tokenID: args.tokenId,
					amount: args.amount,
					side: args.side,
				},
				orderOpts,
				t
			);
			if (DEV) {
				// eslint-disable-next-line no-console
				console.info("[Polymarket CLOB] market order response", summarizeClobResultForLog(result));
			}
			ensurePolymarketClobOrderSuccess(result, "market order");
			logPolymarketOrderSuccessResponse(result);
			return result;
		},
		[clobClient]
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
