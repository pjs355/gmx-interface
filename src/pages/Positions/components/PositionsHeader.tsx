// React import not required with automatic JSX runtime
import type { CSSProperties } from "react";
import { usePositionsPageMetricsGate } from "context/PositionsPageMetricsGateContext";

/** Same as AppHeaderUser / AppHeaderLinks `header-metric` cash skeleton. */
const cashBalanceSkeletonBoxStyle: CSSProperties = {
	display: "inline-block",
	width: 70,
	height: 16,
	borderRadius: 4,
	backgroundColor: "rgba(255, 255, 255, 0.1)",
};

export default function PositionsHeader({
	portfolioTotal,
	positionsTotalValue,
	usdcBalance,
	cashLoading = false,
	positionsLoading = false,
	portfolioLoading = false,
	/** When true (positions page still loading), keep Portfolio & Positions metrics in skeleton. */
	summariesLocked = false,
}: {
	portfolioTotal: number;
	/** Open + unclaimed resolution (same as Winnings in portfolio). */
	positionsTotalValue: number;
	usdcBalance: number;
	cashLoading?: boolean;
	positionsLoading?: boolean;
	portfolioLoading?: boolean;
	summariesLocked?: boolean;
}) {
	const { blockHeaderMetrics } = usePositionsPageMetricsGate();
	const lockAll = summariesLocked === true;
	// Match AppHeaderUser: cash skeleton until Portfolio cash is ready OR page metrics are blocked
	const showCashSkeleton = cashLoading || blockHeaderMetrics;
	const showPositionsSkeleton =
		lockAll ||
		positionsLoading ||
		(positionsTotalValue === 0 && portfolioLoading);
	const showPortfolioSkeleton =
		lockAll ||
		portfolioLoading ||
		(portfolioTotal === 0 && positionsLoading);
	return (
		<div className="mb-36">
			{/* Desktop layout (unchanged) */}
			<div
				style={{ display: "none" }}
				className="md:!flex items-end justify-start"
			>
				<div className="flex items-end gap-32">
					<div>
						<div
							style={{
								color: "#9CA3AF",
								fontSize: 14,
								textTransform: "uppercase",
								letterSpacing: 0.6,
							}}
						>
							Portfolio
						</div>
						<div
							style={{
								color: "#fff",
								fontSize: 36,
								fontWeight: 900,
								minHeight: 44,
								display: "flex",
								alignItems: "center",
							}}
						>
							{showPortfolioSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 160,
										height: 32,
										borderRadius: 6,
									}}
								/>
							) : (
								<>
									$
									{portfolioTotal.toLocaleString("en-US", {
										minimumFractionDigits: 0,
										maximumFractionDigits: 2,
									})}
								</>
							)}
						</div>
					</div>
					<div>
						<div
							style={{
								color: "#9CA3AF",
								fontSize: 12,
								textTransform: "uppercase",
								letterSpacing: 0.6,
							}}
						>
							Positions
						</div>
						<div
							style={{
								color: "#fff",
								fontSize: 20,
								fontWeight: 700,
								minHeight: 28,
								display: "flex",
								alignItems: "center",
							}}
						>
							{showPositionsSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 120,
										height: 22,
										borderRadius: 4,
									}}
								/>
							) : (
								<>
									$
									{positionsTotalValue.toLocaleString(
										"en-US",
										{
											minimumFractionDigits: 0,
											maximumFractionDigits: 2,
										}
									)}
								</>
							)}
						</div>
					</div>
					<div>
						<div
							style={{
								color: "#9CA3AF",
								fontSize: 12,
								textTransform: "uppercase",
								letterSpacing: 0.6,
							}}
						>
							Cash Balance
						</div>
						<div
							style={{
								color: "#fff",
								fontSize: 20,
								fontWeight: 700,
								minHeight: 28,
								display: "flex",
								alignItems: "center",
							}}
						>
							{showCashSkeleton ? (
								<span
									className="skeleton-box"
									style={cashBalanceSkeletonBoxStyle}
								/>
							) : (
								<>
									$
									{Number(usdcBalance || 0).toLocaleString(
										"en-US",
										{
											minimumFractionDigits: 0,
											maximumFractionDigits: 2,
										}
									)}
								</>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Tablet & Mobile layout: Portfolio on top, then Positions and Cash below */}
			<div
				style={{ display: "block", marginTop: "0px" }}
				className="md:!hidden"
			>
				<div>
					<div
						style={{
							color: "#9CA3AF",
							fontSize: 14,
							textTransform: "uppercase",
							letterSpacing: 0.6,
						}}
					>
						Portfolio
					</div>
					<div
						style={{
							color: "#fff",
							fontSize: 36,
							fontWeight: 900,
							minHeight: 44,
							display: "flex",
							alignItems: "center",
						}}
					>
						{showPortfolioSkeleton ? (
							<span
								className="skeleton-box"
								style={{
									display: "inline-block",
									width: 160,
									height: 32,
									borderRadius: 6,
								}}
							/>
						) : (
							<>
								$
								{portfolioTotal.toLocaleString("en-US", {
									minimumFractionDigits: 0,
									maximumFractionDigits: 2,
								})}
							</>
						)}
					</div>
				</div>
				<div className="flex items-end gap-32 mt-16">
					<div>
						<div
							style={{
								color: "#9CA3AF",
								fontSize: 12,
								textTransform: "uppercase",
								letterSpacing: 0.6,
							}}
						>
							Positions
						</div>
						<div
							style={{
								color: "#fff",
								fontSize: 20,
								fontWeight: 700,
								minHeight: 28,
								display: "flex",
								alignItems: "center",
							}}
						>
							{showPositionsSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 120,
										height: 22,
										borderRadius: 4,
									}}
								/>
							) : (
								<>
									$
									{positionsTotalValue.toLocaleString(
										"en-US",
										{
											minimumFractionDigits: 0,
											maximumFractionDigits: 2,
										}
									)}
								</>
							)}
						</div>
					</div>
					<div>
						<div
							style={{
								color: "#9CA3AF",
								fontSize: 12,
								textTransform: "uppercase",
								letterSpacing: 0.6,
							}}
						>
							Cash Balance
						</div>
						<div
							style={{
								color: "#fff",
								fontSize: 20,
								fontWeight: 700,
								minHeight: 28,
								display: "flex",
								alignItems: "center",
							}}
						>
							{showCashSkeleton ? (
								<span
									className="skeleton-box"
									style={cashBalanceSkeletonBoxStyle}
								/>
							) : (
								<>
									$
									{Number(usdcBalance || 0).toLocaleString(
										"en-US",
										{
											minimumFractionDigits: 0,
											maximumFractionDigits: 2,
										}
									)}
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
