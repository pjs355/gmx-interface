import React, { useState, useEffect } from "react";
import type { RoutePlan } from "./sor-types";
import {
	VENUE_DISPLAY_NAMES,
	VENUE_COLORS,
	getExecutionShortfallBannerText,
} from "./sor-types";

interface SorRouteDisplayProps {
	route: RoutePlan | null;
	isLoading: boolean;
	error: string | null;
	isStale: boolean;
	onExecute: () => void;
	onFallback: () => void;
	executing: boolean;
}

function formatCurrency(n: number): string {
	return `$${n.toFixed(2)}`;
}

function formatShares(n: number): string {
	return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function formatPercent(n: number): string {
	return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function formatTime(seconds: number): string {
	if (seconds <= 5) return "Instant";
	if (seconds < 60) return `~${seconds}s`;
	return `~${Math.ceil(seconds / 60)}min`;
}

function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
	const [remaining, setRemaining] = useState(
		Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
	);

	useEffect(() => {
		const timer = setInterval(() => {
			const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
			setRemaining(left);
			if (left <= 0) clearInterval(timer);
		}, 200);
		return () => clearInterval(timer);
	}, [expiresAt]);

	if (remaining <= 0) return <span style={{ color: "#ef4444" }}>Expired</span>;
	return <span style={{ color: remaining <= 2 ? "#f59e0b" : "#9ca3af" }}>Expires {remaining}s</span>;
}

export function SorRouteDisplay({
	route,
	isLoading,
	error,
	isStale,
	onExecute,
	onFallback,
	executing,
}: SorRouteDisplayProps) {
	const [routeExpired, setRouteExpired] = useState(false);
	useEffect(() => {
		if (!route) {
			setRouteExpired(false);
			return;
		}
		const check = () => {
			if (Date.now() > route.expiresAt) setRouteExpired(true);
		};
		check();
		const timer = setInterval(check, 1000);
		return () => clearInterval(timer);
	}, [route]);

	if (error) {
		return (
			<div style={styles.container}>
				<div style={styles.errorBox}>
					<span style={styles.errorIcon}>!</span>
					<span>Route unavailable: {error}</span>
				</div>
				<button type="button" onClick={onFallback} style={styles.fallbackBtn}>
					Trade on LevelUp instead
				</button>
			</div>
		);
	}

	if (!route && isLoading) {
		return null;
	}

	if (!route) return null;

	const hasSavings = route.savingsVsSingleVenue.percentImprovement > 5;
	const shortfallBanner = getExecutionShortfallBannerText(route);

	return (
		<div style={{ ...styles.container, opacity: isStale && !isLoading ? 0.7 : 1 }}>
			{/* Venue allocation bars */}
			<div style={styles.barContainer}>
			{route.legs.map((leg, index) => {
				const widthPct = Math.max(8, (leg.shares / route.totalShares) * 100);
				return (
					<div
						key={`${leg.venue}-${index}`}
						style={{
							...styles.bar,
							width: `${widthPct}%`,
							backgroundColor: VENUE_COLORS[leg.venue],
						}}
						title={`${VENUE_DISPLAY_NAMES[leg.venue]}: ${formatShares(leg.shares)} shares`}
					/>
				);
			})}
			</div>

			{/* Summary */}
			<div style={styles.summary}>
				<div style={styles.summaryMain}>
					<span style={styles.totalShares}>{formatShares(route.totalShares)} shares</span>
					<span style={styles.totalPrice}>
						at {route.totalShares > 0 ? formatCurrency(route.totalCost / route.totalShares) : "--"}/share all-in
					</span>
				</div>
				{hasSavings && (
					<div style={styles.savingsCallout}>
						Smart Route: +{formatShares(route.savingsVsSingleVenue.extraShares)} shares
						({formatPercent(route.savingsVsSingleVenue.percentImprovement)}) vs{" "}
						{VENUE_DISPLAY_NAMES[route.singleVenueBest.venue]} alone
					</div>
				)}
				{shortfallBanner && (
					<div style={styles.shortfallBanner} role="status">
						{shortfallBanner}
					</div>
				)}
			</div>

			{/* Per-leg details */}
			<div style={styles.legsContainer}>
				{route.legs.map((leg, index) => (
				<div key={`${leg.venue}-${index}`} style={styles.legRow}>
					<div style={styles.legVenue}>
						<span
							style={{
								...styles.venueDot,
								backgroundColor: VENUE_COLORS[leg.venue],
							}}
						/>
						{VENUE_DISPLAY_NAMES[leg.venue]}
						</div>
						<div style={styles.legDetails}>
							<span>{formatShares(leg.shares)} @ {(leg.avgPrice * 100).toFixed(0)}¢</span>
							<span style={styles.legFee}>fee {formatCurrency(leg.fee)}</span>
							{leg.bridge && (
								<span style={styles.legBridge}>
									bridge {formatCurrency(leg.bridge.estimatedCost)}
								</span>
							)}
						</div>
						<div style={styles.legChain}>
							{leg.bridge
								? `${formatTime(leg.estimatedTimeSeconds)}`
								: "No bridge"}
						</div>
					</div>
				))}
			</div>

			{/* Footer: fees + time + expiry */}
			<div style={styles.footer}>
				<div style={styles.footerStats}>
					<span>Fees: {formatCurrency(route.totalFees)}</span>
					{route.totalBridgeCost > 0 && (
						<span>Bridge: {formatCurrency(route.totalBridgeCost)}</span>
					)}
					{route.remainder > 0.01 && (
						<span>Dust: {formatCurrency(route.remainder)}</span>
					)}
					<span>Time: {formatTime(route.estimatedExecutionTimeSeconds)}</span>
				</div>
				<ExpiryCountdown expiresAt={route.expiresAt} />
			</div>

			{/* Warnings */}
			{route.insufficientLiquidity && (
				<div style={styles.warning}>
					Insufficient liquidity — only {formatShares(route.totalShares)} shares available
				</div>
			)}

			{/* Execute button */}
			<button
				type="button"
				onClick={onExecute}
				disabled={routeExpired || executing || isLoading}
				style={{
					...styles.executeBtn,
					opacity: routeExpired || executing || isLoading ? 0.5 : 1,
					cursor: routeExpired || executing || isLoading ? "not-allowed" : "pointer",
				}}
			>
				{executing
					? "Executing..."
					: routeExpired
						? "Route Expired — Refreshing..."
						: `Execute Smart Route`}
			</button>

			{isLoading && <div style={styles.refreshIndicator}>Refreshing...</div>}
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		padding: 12,
		borderRadius: 8,
		border: "1px solid rgba(255,255,255,0.1)",
		backgroundColor: "rgba(255,255,255,0.03)",
		transition: "opacity 0.2s",
	},
	barContainer: {
		display: "flex",
		height: 6,
		borderRadius: 3,
		overflow: "hidden",
		gap: 2,
	},
	bar: {
		height: "100%",
		borderRadius: 3,
		transition: "width 0.3s",
	},
	summary: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
	},
	summaryMain: {
		display: "flex",
		alignItems: "baseline",
		gap: 6,
	},
	totalShares: {
		fontSize: 18,
		fontWeight: 600,
		color: "#fff",
	},
	totalPrice: {
		fontSize: 13,
		color: "#9ca3af",
	},
	savingsCallout: {
		fontSize: 12,
		color: "#22c55e",
		fontWeight: 500,
		padding: "4px 8px",
		borderRadius: 4,
		backgroundColor: "rgba(34, 197, 94, 0.1)",
	},
	shortfallBanner: {
		fontSize: 12,
		color: "#93c5fd",
		lineHeight: 1.45,
		padding: "6px 8px",
		borderRadius: 4,
		backgroundColor: "rgba(59, 130, 246, 0.12)",
	},
	legsContainer: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
	},
	legRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		fontSize: 12,
		color: "#d1d5db",
		padding: "4px 0",
	},
	legVenue: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		minWidth: 100,
		fontWeight: 500,
	},
	venueDot: {
		width: 8,
		height: 8,
		borderRadius: "50%",
		flexShrink: 0,
	},
	legDetails: {
		display: "flex",
		gap: 8,
		flex: 1,
		justifyContent: "center",
	},
	legFee: {
		color: "#9ca3af",
	},
	legBridge: {
		color: "#f59e0b",
	},
	legChain: {
		minWidth: 70,
		textAlign: "right" as const,
		color: "#9ca3af",
		fontSize: 11,
	},
	footer: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		fontSize: 11,
		color: "#9ca3af",
		borderTop: "1px solid rgba(255,255,255,0.06)",
		paddingTop: 6,
	},
	footerStats: {
		display: "flex",
		gap: 12,
	},
	warning: {
		fontSize: 11,
		color: "#f59e0b",
		padding: "4px 8px",
		borderRadius: 4,
		backgroundColor: "rgba(245, 158, 11, 0.1)",
	},
	executeBtn: {
		width: "100%",
		padding: "10px 16px",
		borderRadius: 6,
		border: "none",
		backgroundColor: "#6366f1",
		color: "#fff",
		fontSize: 14,
		fontWeight: 600,
		transition: "opacity 0.2s",
	},
	fallbackBtn: {
		width: "100%",
		padding: "8px 12px",
		borderRadius: 6,
		border: "1px solid rgba(255,255,255,0.1)",
		backgroundColor: "transparent",
		color: "#9ca3af",
		fontSize: 13,
		cursor: "pointer",
	},
	errorBox: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		fontSize: 13,
		color: "#ef4444",
		padding: "8px 12px",
		borderRadius: 6,
		backgroundColor: "rgba(239, 68, 68, 0.08)",
	},
	errorIcon: {
		width: 18,
		height: 18,
		borderRadius: "50%",
		backgroundColor: "#ef4444",
		color: "#fff",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 11,
		fontWeight: 700,
		flexShrink: 0,
	},
	refreshIndicator: {
		fontSize: 11,
		color: "#6366f1",
		textAlign: "center" as const,
	},
};
