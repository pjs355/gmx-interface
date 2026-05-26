import type { SorErrorCode } from "@/features/trading/sor";

export interface TradeBoxAllMarketsRouteErrorProps {
	displayError: string | null;
	displayErrorCode: SorErrorCode | null;
	displayRoute: unknown;
	displayLoading: boolean;
	globalSetupInProgress: boolean;
}

export default function TradeBoxAllMarketsRouteError({
	displayError,
	displayErrorCode,
	displayRoute,
	displayLoading,
	globalSetupInProgress,
}: TradeBoxAllMarketsRouteErrorProps) {
	const isSetupErrorSuppressed =
		displayErrorCode === "EXECUTION_NOT_READY" && globalSetupInProgress;
	const hasError = Boolean(
		displayError && !displayRoute && !displayLoading && !isSetupErrorSuppressed,
	);

	if (!hasError) return null;

	const rawErr = displayError ?? "";
	const isWholeShareContractHint =
		displayErrorCode === "WHOLE_SHARES_ONLY" || rawErr.includes("Fractional share amounts");
	const isNoLiquidityHint =
		displayErrorCode === "NO_BOOKS_AVAILABLE" || displayErrorCode === "NO_MARKET_FOUND";
	const displayErr = rawErr.replace(/^\s*Route unavailable:\s*/i, "").trim();

	return (
		<div className="bet-size-section">
			<div className="bet-size-info">
				<div className="bet-size-main-row">
					<span
						style={
							isWholeShareContractHint
								? {
										fontSize: 12,
										fontWeight: 500,
										color: "#f59e0b",
										lineHeight: 1.35,
									}
								: { color: "#ef4444", fontSize: 12 }
						}
					>
						{displayErrorCode === "EXECUTION_NOT_READY"
							? "Trading setup required: "
							: isWholeShareContractHint || isNoLiquidityHint
								? ""
								: "Route unavailable: "}
						{displayErr}
					</span>
				</div>
			</div>
		</div>
	);
}
