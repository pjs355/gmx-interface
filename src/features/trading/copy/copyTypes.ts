/** Wire types for the copy trading API (mirrors `register-copy.ts` on the server). */

export type CopySubscriptionStatus =
	| "activating"
	| "active"
	| "paused"
	| "stopped"
	| "stopped_by_stop_loss"
	| "stopped_by_admin"
	| "failed_activation";

export type CopySubscriptionJson = {
	id: string;
	leaderWallet: string;
	status: CopySubscriptionStatus;
	allocationMode: "usd" | "pct";
	allocationInput: number;
	initialPoolUsd: number;
	scaleFactor: number;
	sportRestriction: string | null;
	slippageTolerance: number;
	stopLossPct: number;
	minLeaderTradeUsd: number;
	reservedUsd: number;
	deployedUsd: number;
	realizedPnlUsd: number;
	lastMarkTotalValueUsd: number | null;
	lastMarkAt: string | null;
	fundingError: string | null;
	activatedAt: string | null;
	stoppedAt: string | null;
	stopReason: string | null;
	createdAt: string;
};

export type CopyOpenPositionJson = {
	conditionId: string;
	outcome: "yes" | "no";
	marketTitle: string;
	sport: string;
	shares: number;
	costUsd: number;
	avgPrice: number;
	mid: number | null;
	markValueUsd: number | null;
	unrealizedPnlUsd: number | null;
};

export type CopyActivityJson = {
	id: string;
	// `redeem` / `resolve_loss` are settlement rows (a resolved market paid out /
	// went to zero); `submitted_unconfirmed` is an order awaiting on-chain
	// confirmation before it books.
	action: "buy" | "sell" | "redeem" | "resolve_loss";
	status: "filled" | "partial" | "skipped" | "failed" | "submitted_unconfirmed";
	skipReason: string | null;
	marketTitle: string;
	sport: string;
	outcome: "yes" | "no";
	leaderPrice: number;
	leaderSizeUsd: number;
	followerPrice: number | null;
	followerFilledSize: number | null;
	followerProceedsUsd: number | null;
	errorMessage: string | null;
	createdAt: string;
};

export type CopyDetailJson = {
	subscription: CopySubscriptionJson;
	currentValueUsd: number;
	unrealizedPnlUsd: number;
	positions: CopyOpenPositionJson[];
	activity: CopyActivityJson[];
};

export type CopySettingsJson = {
	defaultSlippageTolerance: number;
	defaultStopLossPct: number;
	defaultMinLeaderTradeUsd: number;
};

export type CreateCopySubscriptionBody = {
	leaderWallet: string;
	allocationMode: "usd" | "pct";
	allocationInput: number;
	sportRestriction?: string | null;
	slippageTolerance?: number;
	stopLossPct?: number;
	minLeaderTradeUsd?: number;
};

export type StopCopySubscriptionBody = {
	exitPositions: boolean;
};
