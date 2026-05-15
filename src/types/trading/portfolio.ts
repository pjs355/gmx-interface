/**
 * Server-side cash summary returned by `GET /portfolio/cash-summary`.
 *
 * Mirrors `FundingStableBalancesHuman` on the frontend so
 * `CollateralTokenContext` can adopt the server-side reads without changing
 * its consumer-facing data shape. All values are human-decimal numbers
 * (e.g. `12.34` for $12.34 USDC), and `fetchedAt` is the ISO timestamp the
 * server returned so consumers can stamp optimistic overlays / staleness.
 */
export interface CashSummary {
	base: number;
	polygon: number;
	bnb: number;
	solana: number;
	limitlessMakerBase: number;
	fetchedAt: string;
}

/** Inner `data` from `GET /portfolio/base-smart-wallet-pending-usdc`. */
export type BaseSmartWalletPendingUsdc = {
	makerAddress: string | null;
	pendingUsdcMicro: string;
};
