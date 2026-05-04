import type { Jsonish } from "./util";

export type PolymarketRequiredNextAction =
	| string
	| {
			step?: string;
			label?: string;
			detail?: string;
	  };

export type PolymarketAccountState = {
	signerAddress?: string;
	safeWalletAddress?: string;
	integrationMode?: string;
	safeDeployed?: boolean;
	l2CredentialsStored?: boolean;
	[key: string]: unknown;
};

export type PolymarketAccountResponse = {
	polymarketAccount?: PolymarketAccountState;
	builderReadiness?: Record<string, unknown>;
	requiredNextAction?: PolymarketRequiredNextAction | null;
	executionContext?: Jsonish;
	relayerUrl?: string | null;
	/**
	 * Set only by the client when `GET /polymarket/account` returns HTTP 404
	 * (no backend record / route not deployed). Not sent by the server.
	 */
	_clientPolymarketAccountNotFound?: boolean;
	[key: string]: unknown;
};

export type PolymarketSyncBody = Record<string, unknown>;

/**
 * Body for `POST /polymarket/account/l2-credentials`. The server stores
 * these encrypted at rest with `POLYMARKET_L2_CREDS_ENCRYPTION_KEY` and
 * uses them to compute the L2 HMAC headers when forwarding orders to the
 * Polymarket CLOB on the user's behalf. Derived client-side via
 * `ClobClient.createOrDeriveApiKey()` (requires the user's wallet
 * signature; the server cannot derive these).
 */
export type PolymarketL2CredentialsBody = {
	key: string;
	secret: string;
	passphrase: string;
};

export type PolymarketVerifyOnChainBody = Record<string, unknown>;

/**
 * Server input for `POST /polymarket/builder/sign`.
 * **`body` is optional:** Polymarket CLOB sends authenticated GETs with no body; the HMAC
 * must omit the body segment when absent (do not 400 — see `normalizeBuilderSignTimestamp.ts`).
 */
export type PolymarketBuilderSignBody = {
	path: string;
	body?: Jsonish;
	method?: string;
	timestamp?: number;
	[key: string]: unknown;
};

export type PolymarketBuilderSignResponse = {
	signature?: string;
	headers?: Record<string, string>;
	[key: string]: unknown;
};

/**
 * Body for `POST /api/polymarket/orders` — UI signs the order via
 * `ClobClient.createOrder` / `createMarketOrder` (sign-only) then POSTs the
 * signed order here. Server forwards to the Polymarket CLOB with stored L2
 * credentials and persists a `VenueOrder` audit row.
 *
 * `signedOrder` is left intentionally untyped here to avoid coupling to the
 * SDK's union types — the server validates the shape with zod and treats the
 * payload as opaque otherwise.
 */
export type PolymarketOrderSubmitBody = {
	signedOrder: Record<string, string | number>;
	orderType: "GTC" | "GTD" | "FOK" | "FAK";
	postOnly?: boolean;
	deferExec?: boolean;
	marketRef?: {
		externalMarketId?: string;
		tokenId?: string;
		outcome?: string;
	};
	requestedSize?: string;
	requestedPrice?: string;
};
