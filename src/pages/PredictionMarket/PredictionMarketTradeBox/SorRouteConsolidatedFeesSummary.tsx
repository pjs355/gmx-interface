import Tooltip from "components/Tooltip/Tooltip";
import { IoIosInformationCircleOutline } from "react-icons/io";
import type { RoutePlan, RouteLeg, SorVenue } from "@/trading/sor";
import {
	VENUE_DISPLAY_NAMES,
	getSorLifiTransferFeeRowState,
	derivedBridgeUsdForDisplay,
	formatSorFeeUsdDisplay,
} from "@/trading/sor";

export function aggregateFeesByVenue(
	legs: RouteLeg[],
): { venue: SorVenue; fee: number }[] {
	const map = new Map<SorVenue, number>();
	for (const leg of legs) {
		map.set(leg.venue, (map.get(leg.venue) ?? 0) + leg.fee);
	}
	return [...map.entries()]
		.filter(([, fee]) => fee > 0)
		.map(([venue, fee]) => ({ venue, fee }));
}

/** One “Fees $total” row; itemized breakdown is tooltip-only on the word “Fees” (amount is plain text). */
export function SorRouteConsolidatedFeesSummary({
	route,
	variant = "default",
}: {
	route: RoutePlan;
	/** Smart routing drawer: info icon + tooltip styled like the trade box. */
	variant?: "default" | "smart-drawer";
}) {
	const feeByVenue = aggregateFeesByVenue(route.legs);
	const bridgeDerived = derivedBridgeUsdForDisplay(route);
	const lifi = getSorLifiTransferFeeRowState(route);
	const transferUsd =
		route.side === "sell"
			? 0
			: route.totalBridgeCost > 0
				? bridgeDerived.displayUsd
				: bridgeDerived.legSumUsd > 1e-12
					? bridgeDerived.legSumUsd
					: bridgeDerived.displayUsd;
	const venueSum = feeByVenue.reduce((s, { fee }) => s + fee, 0);
	const tradingUsd =
		typeof route.totalFees === "number" &&
		Number.isFinite(route.totalFees) &&
		route.totalFees > 1e-9
			? route.totalFees
			: venueSum;
	const rawTotal = tradingUsd + transferUsd;
	if (rawTotal <= 1e-9) return null;

	const tooltipBody = (
		<div className="sor-details-consolidated-fees__tooltip-body">
			{feeByVenue
				.filter(({ fee }) => fee > 0)
				.map(({ venue, fee }) => (
					<div key={venue}>
						{VENUE_DISPLAY_NAMES[venue]} Fee: $ {formatSorFeeUsdDisplay(fee)}
					</div>
				))}
			{feeByVenue.every(({ fee }) => fee <= 0) && tradingUsd > 0 ? (
				<div>Trading fees: $ {formatSorFeeUsdDisplay(tradingUsd)}</div>
			) : null}
			{lifi.show ? (
				<div>Funds transfer fee (est.): $ {formatSorFeeUsdDisplay(transferUsd)}</div>
			) : null}
		</div>
	);

	return (
		<div className="sor-details-row sor-details-row--fee sor-details-consolidated-fees">
			<Tooltip
				content={tooltipBody}
				position="top"
				withPortal={true}
				disableHandleStyle
				handleClassName={
					variant === "smart-drawer"
						? "sor-details-consolidated-fees__fees-tooltip-handle sor-details-consolidated-fees__fees-tooltip-handle--smart-drawer"
						: "sor-details-consolidated-fees__fees-tooltip-handle"
				}
				tooltipClassName={
					variant === "smart-drawer" ? "sor-fees-tooltip-popup--tradebox" : undefined
				}
			>
				{variant === "smart-drawer" ? (
					<span className="sor-details-consolidated-fees__fees-trigger">
						<span className="sor-details-fee-label sor-details-consolidated-fees__fees-label">
							Fees
						</span>
						<IoIosInformationCircleOutline
							className="sor-details-consolidated-fees__info-icon"
							size={17}
							aria-hidden
						/>
					</span>
				) : (
					<span className="sor-details-fee-label sor-details-consolidated-fees__fees-label">
						Fees
					</span>
				)}
			</Tooltip>
			<span className="sor-details-fee-value sor-details-consolidated-fees__amount">
				$ {formatSorFeeUsdDisplay(rawTotal)}
			</span>
		</div>
	);
}
