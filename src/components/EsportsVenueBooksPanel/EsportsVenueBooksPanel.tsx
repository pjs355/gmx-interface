import { useCallback, useEffect, useMemo } from "react";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import type {
	TradingPagePrices,
	VenueRowModel,
} from "@/features/markets/pricing/useTradingPagePrices";
import {
	askCellClass,
	formatAskCell,
	indicesAtBestAsk,
} from "@/features/markets/pricing/venueBooksCells";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import { resolveMarketLogo } from "@/features/markets/assets/marketLogoResolver";
import "./EsportsVenueBooksPanel.scss";

/** Both price cells show exactly “No shares” (used to pin those rows to the bottom of the Basic table). */
function rowShowsNoSharesBothColumns(
	row: VenueRowModel,
	formatProbDisplay: (p: number) => string,
): boolean {
	return (
		formatAskCell(row.linked, row.askA, row.statusA, row.id, formatProbDisplay) === "No shares" &&
		formatAskCell(row.linked, row.askB, row.statusB, row.id, formatProbDisplay) === "No shares"
	);
}

function sortVenueRowsNoSharesLast(
	rows: VenueRowModel[],
	formatProbDisplay: (p: number) => string,
): VenueRowModel[] {
	if (rows.length <= 1) return rows;
	return [...rows].sort((a, b) => {
		const aBottom = rowShowsNoSharesBothColumns(a, formatProbDisplay);
		const bBottom = rowShowsNoSharesBothColumns(b, formatProbDisplay);
		if (aBottom && !bBottom) return 1;
		if (!aBottom && bBottom) return -1;
		return 0;
	});
}

type Props = {
	tradingPagePrices: TradingPagePrices;
	/** Override YES column header (e.g. active NegRisk leg label). */
	teamAOverride?: string;
	/** Override NO column header. */
	teamBOverride?: string;
};

export function EsportsVenueBooksPanel({
	tradingPagePrices,
	teamAOverride,
	teamBOverride,
}: Props) {
	const { formatPrice } = useOddsDisplay();
	const formatProbDisplay = useCallback((p: number) => formatPrice(p), [formatPrice]);

	const {
		venueRows,
		bestYesPrice,
		bestNoPrice,
		teamA: teamAFromPrices,
		teamB: teamBFromPrices,
		source,
		wsEnabled,
		wsConnected,
		isLoading,
		restError,
		matched,
		appState,
	} = tradingPagePrices;
	const teamA = teamAOverride?.trim() || teamAFromPrices;
	const teamB = teamBOverride?.trim() || teamBFromPrices;

	const orderedVenueRows = useMemo(
		() => sortVenueRowsNoSharesLast(venueRows, formatProbDisplay),
		[venueRows, formatProbDisplay],
	);

	const bestAIndices = useMemo(
		() => indicesAtBestAsk(orderedVenueRows, (r) => r.askA),
		[orderedVenueRows],
	);
	const bestBIndices = useMemo(
		() => indicesAtBestAsk(orderedVenueRows, (r) => r.askB),
		[orderedVenueRows],
	);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("EsportsVenueBooksPanel (Basic tab render)", {
			source,
			wsEnabled,
			wsConnected,
			isLoading,
			restError,
			teamA,
			teamB,
			bestAIndices: [...bestAIndices],
			bestBIndices: [...bestBIndices],
			bestYesPrice,
			bestNoPrice,
			venueRows: orderedVenueRows.map((r) => ({
				id: r.id,
				linked: r.linked,
				askA: r.askA,
				askB: r.askB,
			})),
			matchedPandaId: matched?.pandaMatchId ?? null,
		});
	}, [
		source,
		wsEnabled,
		wsConnected,
		isLoading,
		restError,
		teamA,
		teamB,
		bestAIndices,
		bestBIndices,
		bestYesPrice,
		bestNoPrice,
		orderedVenueRows,
		matched,
	]);

	if (!wsEnabled) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__muted">
					Cross-venue odds are not configured. Set <code>VITE_ODDS_WS_BASE</code> to override the
					venue-prices WebSocket URL if needed, then restart the dev server.
				</p>
			</div>
		);
	}

	if (venueRows.length === 0) {
		if (isLoading) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__status">Loading venue prices…</p>
				</div>
			);
		}
		if (restError && !wsConnected) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__muted">
						Couldn&apos;t load cross-venue prices: the odds WebSocket is disconnected and the backup
						odds API request failed. Check your network, VPN, or odds service config (
						<code>VITE_ODDS_WS_BASE</code> / private API), then refresh.
					</p>
				</div>
			);
		}
		if (wsConnected && !matched) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__muted">
						No monitor row for this match. The match may not be linked on the odds server yet.
					</p>
				</div>
			);
		}
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__status">Loading venue prices…</p>
			</div>
		);
	}

	const dh = appState?.dflowHealth ?? appState?.kalshiHealth;
	const lh = appState?.limitlessHealth;
	const pf = appState?.predictFunHealth;

	return (
		<div className="esports-venue-books">
			{dh?.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Kalshi</strong> — {dh.lastError}
				</p>
			) : null}
			{lh?.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Limitless</strong> — {lh.lastError}
				</p>
			) : null}
			{pf?.enabled && pf.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Predict</strong> — {pf.lastError}
				</p>
			) : null}

			<div className="esports-venue-books__table-wrap">
				<table className="esports-venue-books__table">
					<thead>
						<tr>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--venue esports-venue-books__th--chart-title"
							>
								Prediction Markets
							</th>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--team"
								title={teamA}
							>
								<span className="esports-venue-books__th-text">{teamA}</span>
							</th>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--team"
								title={teamB}
							>
								<span className="esports-venue-books__th-text">{teamB}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{orderedVenueRows.map((row: VenueRowModel, idx: number) => (
							<tr key={row.id} className="esports-venue-books__tr">
								<th scope="row" className="esports-venue-books__td esports-venue-books__td--label">
									<span className="esports-venue-books__label-row">
										{resolveMarketLogo(row.id) ? (
											<MarketLogo
												venue={row.id}
												size={16}
												className="esports-venue-books__market-logo"
												style={{ display: "block", verticalAlign: "unset" }}
											/>
										) : (
											<span className="esports-venue-books__logo-placeholder" aria-hidden="true" />
										)}
										<span>{row.label}</span>
									</span>
								</th>
								<td
									className={askCellClass(
										row.linked,
										row.askA,
										row.statusA,
										bestAIndices.has(idx),
										row.id,
									)}
								>
									<span className="esports-venue-books__num-cell">
										{formatAskCell(row.linked, row.askA, row.statusA, row.id, formatProbDisplay)}
									</span>
								</td>
								<td
									className={askCellClass(
										row.linked,
										row.askB,
										row.statusB,
										bestBIndices.has(idx),
										row.id,
									)}
								>
									<span className="esports-venue-books__num-cell">
										{formatAskCell(row.linked, row.askB, row.statusB, row.id, formatProbDisplay)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
