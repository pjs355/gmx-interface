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

export type PolymarketL2CredentialsBody = Record<string, unknown>;

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
