import React, { useState, useCallback, useMemo } from "react";
import { useSorRoute } from "./useSorRoute";
import { useSorExecution } from "./useSorExecution";
import { SorRouteDisplay } from "./SorRouteDisplay";
import type {
	SorVenue,
	SorOutcome,
	ChainBalance,
	RouteLeg,
} from "./sor-types";
import { VENUE_DISPLAY_NAMES } from "./sor-types";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";

export interface SmartRouteToggleProps {
	questionId: string | undefined;
	outcome: SorOutcome | undefined;
	amount: number;
	/** Optional per-chain USDC/USDT hints; when set, server attaches `bridge` when a venue chain is short. */
	walletBalances?: ChainBalance[];
	onExecuteLeg: (leg: RouteLeg) => Promise<{
		filled: boolean;
		filledShares: number;
		txHash?: string;
		error?: string;
	}>;
	onExecuteBridge: (
		leg: RouteLeg,
		opts?: {
			amountUsdOverride?: number;
			onPrefundProgress?: (p: { current: number; total: number }) => void;
		},
	) => Promise<{
		success: boolean;
		bridgeTxHash?: string;
		error?: string;
	}>;
	onFallbackToSingleVenue: () => void;
	/** Number of available venues for this market (hide toggle if only 1) */
	availableVenueCount: number;
	polyFeeRate?: number;
	predictFunFeeRateBps?: number;
	targetVenue?: SorVenue;
}

export function SmartRouteToggle({
	questionId,
	outcome,
	amount,
	walletBalances,
	onExecuteLeg,
	onExecuteBridge,
	onFallbackToSingleVenue,
	availableVenueCount,
	polyFeeRate,
	predictFunFeeRateBps,
	targetVenue,
}: SmartRouteToggleProps) {
	const [enabled, setEnabled] = useState(false);

	const sorRoute = useSorRoute({
		questionId,
		outcome,
		side: "buy",
		amount,
		walletBalances,
		enabled,
		polyFeeRate,
		predictFunFeeRateBps,
		limitlessFeeRateBps: LIMITLESS_DEFAULT_FEE_RATE_BPS,
		targetVenue,
	});

	const sorExecution = useSorExecution({
		executeLeg: onExecuteLeg,
		executeBridge: onExecuteBridge,
	});

	const handleExecute = useCallback(() => {
		if (sorRoute.route) {
			sorExecution.execute(sorRoute.route);
		}
	}, [sorRoute.route, sorExecution.execute]);

	if (availableVenueCount <= 1 && !targetVenue) return null;

	return (
		<div style={{ marginTop: 8 }}>
			{/* Toggle */}
			<button
				type="button"
				onClick={() => setEnabled(!enabled)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 10px",
					borderRadius: 6,
					border: `1px solid ${enabled ? "#6366f1" : "rgba(255,255,255,0.1)"}`,
					backgroundColor: enabled ? "rgba(99, 102, 241, 0.08)" : "transparent",
					color: enabled ? "#a5b4fc" : "#9ca3af",
					fontSize: 12,
					fontWeight: 500,
					cursor: "pointer",
					transition: "all 0.2s",
					width: "100%",
					justifyContent: "center",
				}}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
				</svg>
				{enabled
				? targetVenue
					? `Auto-bridge to ${VENUE_DISPLAY_NAMES[targetVenue]} Active`
					: "Smart Route Active"
				: targetVenue
					? `Auto-bridge to ${VENUE_DISPLAY_NAMES[targetVenue]}`
					: "Enable Smart Route"}
			</button>

			{/* Route display when enabled */}
			{enabled && (
				<div style={{ marginTop: 8 }}>
					<SorRouteDisplay
						route={sorRoute.route}
						isLoading={sorRoute.isLoading}
						error={sorRoute.error}
						routeErrorCode={sorRoute.routeErrorCode}
						isStale={sorRoute.isStale}
						onExecute={handleExecute}
						onFallback={() => {
							setEnabled(false);
							onFallbackToSingleVenue();
						}}
						executing={sorExecution.isExecuting}
						executionPhase={sorExecution.executionPhase}
						prefundLegProgress={sorExecution.prefundLegProgress}
					/>
				</div>
			)}
		</div>
	);
}
