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
import { CHAIN_LIFI_IDS, VENUE_DISPLAY_NAMES } from "./sor-types";

export interface SmartRouteToggleProps {
	questionId: string | undefined;
	outcome: SorOutcome | undefined;
	amount: number;
	/** Optional; route preview does not use this for sizing (theoretical liquidity on server). */
	walletBalances?: ChainBalance[];
	onExecuteLeg: (leg: RouteLeg) => Promise<{
		filled: boolean;
		filledShares: number;
		txHash?: string;
		error?: string;
	}>;
	onExecuteBridge: (leg: RouteLeg) => Promise<{
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
		walletBalances: undefined,
		enabled,
		polyFeeRate,
		predictFunFeeRateBps,
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
						isStale={sorRoute.isStale}
						onExecute={handleExecute}
						onFallback={() => {
							setEnabled(false);
							onFallbackToSingleVenue();
						}}
						executing={sorExecution.isExecuting}
						executionPhase={sorExecution.executionPhase}
					/>

					{/* Execution result */}
					{sorExecution.execution && !sorExecution.isExecuting && (
						<div
							style={{
								marginTop: 8,
								padding: "8px 12px",
								borderRadius: 6,
								fontSize: 12,
								backgroundColor:
									sorExecution.execution.status === "complete"
										? "rgba(34, 197, 94, 0.08)"
										: sorExecution.execution.status === "partial"
											? "rgba(245, 158, 11, 0.08)"
											: "rgba(239, 68, 68, 0.08)",
								color:
									sorExecution.execution.status === "complete"
										? "#22c55e"
										: sorExecution.execution.status === "partial"
											? "#f59e0b"
											: "#ef4444",
							}}
						>
							{sorExecution.execution.status === "complete" && (
								<>
									Filled: {sorExecution.execution.totalFilledShares} shares
								</>
							)}
							{sorExecution.execution.status === "partial" && (
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<span>
										Partially filled: {sorExecution.execution.totalFilledShares} shares
									</span>
									<div style={{ display: "flex", gap: 8 }}>
										<button
											type="button"
											onClick={() => sorExecution.requestReroute()}
											style={{
												padding: "4px 8px",
												borderRadius: 4,
												border: "1px solid #f59e0b",
												backgroundColor: "transparent",
												color: "#f59e0b",
												fontSize: 11,
												cursor: "pointer",
											}}
										>
											Re-route {sorExecution.remainingBudget != null ? `$${sorExecution.remainingBudget.toFixed(2)}` : "remaining"}
										</button>
										<button
											type="button"
											onClick={() => sorExecution.acceptResult()}
											style={{
												padding: "4px 8px",
												borderRadius: 4,
												border: "1px solid rgba(255,255,255,0.1)",
												backgroundColor: "transparent",
												color: "#9ca3af",
												fontSize: 11,
												cursor: "pointer",
											}}
										>
											Keep as-is
										</button>
									</div>
								</div>
							)}
							{sorExecution.execution.status === "failed" && (
								<>Execution failed. Funds remain in your wallets.</>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Helper to build ChainBalance array from the user's known balances.
 */
export function buildChainBalances(params: {
	baseUsdcBalance: number;
	baseWalletAddress: string;
	polygonUsdcBalance?: number;
	polygonWalletAddress?: string;
	solanaUsdcBalance?: number;
	solanaWalletAddress?: string;
	bnbUsdtBalance?: number;
	bnbWalletAddress?: string;
	/**
	 * When true, include one row per chain whenever that chain's wallet address is set,
	 * even if balance is 0. SOR backends often validate the full cross-chain wallet map.
	 */
	includeZeroBalanceChainsWithAddress?: boolean;
}): ChainBalance[] {
	const balances: ChainBalance[] = [];
	const inc = Boolean(params.includeZeroBalanceChainsWithAddress);

	if (params.baseWalletAddress) {
		const bal = Math.max(0, params.baseUsdcBalance);
		if (bal > 0 || inc) {
			balances.push({
				chain: "base",
				lifiChainId: CHAIN_LIFI_IDS.base,
				balance: bal,
				walletAddress: params.baseWalletAddress,
			});
		}
	}

	const polyBal = Math.max(0, params.polygonUsdcBalance ?? 0);
	if (params.polygonWalletAddress && (polyBal > 0 || inc)) {
		balances.push({
			chain: "polygon",
			lifiChainId: CHAIN_LIFI_IDS.polygon,
			balance: polyBal,
			walletAddress: params.polygonWalletAddress,
		});
	}

	const solBal = Math.max(0, params.solanaUsdcBalance ?? 0);
	if (params.solanaWalletAddress && (solBal > 0 || inc)) {
		balances.push({
			chain: "solana",
			lifiChainId: CHAIN_LIFI_IDS.solana,
			balance: solBal,
			walletAddress: params.solanaWalletAddress,
		});
	}

	const bnbBal = Math.max(0, params.bnbUsdtBalance ?? 0);
	if (params.bnbWalletAddress && (bnbBal > 0 || inc)) {
		balances.push({
			chain: "bnb",
			lifiChainId: CHAIN_LIFI_IDS.bnb,
			balance: bnbBal,
			walletAddress: params.bnbWalletAddress,
		});
	}

	return balances;
}
