// React import not required with automatic JSX runtime

export default function PositionsHeader({
	portfolioTotal,
	positionsTotalValue,
	usdcBalance,
	cashLoading = false,
	positionsLoading = false,
	portfolioLoading = false,
}: {
	portfolioTotal: number;
	positionsTotalValue: number;
	usdcBalance: number;
	cashLoading?: boolean;
	positionsLoading?: boolean;
	portfolioLoading?: boolean;
}) {
	// Show skeleton if explicitly loading OR if value is 0 during initial load
	// This prevents showing misleading "$0" before data arrives
	const showCashSkeleton =
		cashLoading || (usdcBalance === 0 && portfolioLoading);
	const showPositionsSkeleton =
		positionsLoading || (positionsTotalValue === 0 && portfolioLoading);
	const showPortfolioSkeleton =
		portfolioLoading || (portfolioTotal === 0 && positionsLoading);
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
							}}
						>
							{showPortfolioSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 160,
										height: 28,
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
							}}
						>
							{showPositionsSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 120,
										height: 18,
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
							}}
						>
							{showCashSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 100,
										height: 18,
										borderRadius: 4,
									}}
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
						style={{ color: "#fff", fontSize: 36, fontWeight: 900 }}
					>
						{showPortfolioSkeleton ? (
							<span
								className="skeleton-box"
								style={{
									display: "inline-block",
									width: 160,
									height: 28,
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
							}}
						>
							{showPositionsSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 120,
										height: 18,
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
							}}
						>
							{showCashSkeleton ? (
								<span
									className="skeleton-box"
									style={{
										display: "inline-block",
										width: 100,
										height: 18,
										borderRadius: 4,
									}}
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
