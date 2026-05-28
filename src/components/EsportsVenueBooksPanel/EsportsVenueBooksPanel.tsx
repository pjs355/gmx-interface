import { useCallback, useEffect, useMemo } from "react";
import type { SnapshotStatus } from "@/types/odds-monitor";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import type { FifaVenueRowModel } from "@/features/markets/pricing/fifaVenueRowModel";
import type {
	TradingPagePrices,
	VenueRowModel,
} from "@/features/markets/pricing/useTradingPagePrices";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import { resolveMarketLogo } from "@/features/markets/assets/marketLogoResolver";
import "./EsportsVenueBooksPanel.scss";

const MIN_VALID_PRICE = 0.005;
const MAX_VALID_PRICE = 0.995;

function isLimitlessVenueRow(venueId?: string): boolean {
	return String(venueId ?? "").toLowerCase() === "limitless";
}

function formatAskCell(
	linked: boolean,
	prob: number | null,
	status: SnapshotStatus | undefined,
	venueId: string | undefined,
	formatProbDisplay: (p: number) => string,
): string {
	if (!linked) return "—";
	if (prob !== null && prob >= MIN_VALID_PRICE && prob <= MAX_VALID_PRICE) {
		return formatProbDisplay(prob);
	}
	if (prob !== null || status === "no_liquidity") return "No shares";
	if (status === "awaiting_data") return "Connecting…";
	if (isLimitlessVenueRow(venueId)) return "No shares";
	return "—";
}

function rowShowsNoSharesBothColumns(
	row: VenueRowModel,
	formatProbDisplay: (p: number) => string,
): boolean {
	return (
		formatAskCell(row.linked, row.askA, row.statusA, row.id, formatProbDisplay) === "No shares" &&
		formatAskCell(row.linked, row.askB, row.statusB, row.id, formatProbDisplay) === "No shares"
	);
}

function fifaRowShowsNoSharesAllColumns(
	row: FifaVenueRowModel,
	formatProbDisplay: (p: number) => string,
): boolean {
	return (
		formatAskCell(row.linked, row.askHome, row.statusHome, row.id, formatProbDisplay) ===
			"No shares" &&
		formatAskCell(row.linked, row.askDraw, row.statusDraw, row.id, formatProbDisplay) ===
			"No shares" &&
		formatAskCell(row.linked, row.askAway, row.statusAway, row.id, formatProbDisplay) ===
			"No shares"
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

function sortFifaVenueRowsNoSharesLast(
	rows: FifaVenueRowModel[],
	formatProbDisplay: (p: number) => string,
): FifaVenueRowModel[] {
	if (rows.length <= 1) return rows;
	return [...rows].sort((a, b) => {
		const aBottom = fifaRowShowsNoSharesAllColumns(a, formatProbDisplay);
		const bBottom = fifaRowShowsNoSharesAllColumns(b, formatProbDisplay);
		if (aBottom && !bBottom) return 1;
		if (!aBottom && bBottom) return -1;
		return 0;
	});
}

const ASK_BEST_EPS = 1e-10;

function indicesAtBestDisplayedCents(rows: Array<{ ask: number | null }>): Set<number> {
	let minP = Infinity;
	for (const r of rows) {
		const p = r.ask;
		if (p !== null && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE) {
			minP = Math.min(minP, p);
		}
	}
	if (!Number.isFinite(minP)) return new Set();
	const out = new Set<number>();
	rows.forEach((r, i) => {
		const p = r.ask;
		if (
			p !== null &&
			p >= MIN_VALID_PRICE &&
			p <= MAX_VALID_PRICE &&
			Math.abs(p - minP) <= ASK_BEST_EPS
		) {
			out.add(i);
		}
	});
	return out;
}

function askCellClass(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
	isBest?: boolean,
	venueId?: string,
): string {
	const base = "esports-venue-books__td esports-venue-books__td--num";
	const limitlessLinkedNoQuote = isLimitlessVenueRow(venueId) && linked && prob === null && !status;
	if (!linked || (prob === null && !status && !limitlessLinkedNoQuote)) {
		return `${base} esports-venue-books__td--empty`;
	}
	const outOfRange = prob !== null && (prob < MIN_VALID_PRICE || prob > MAX_VALID_PRICE);
	if (
		outOfRange ||
		limitlessLinkedNoQuote ||
		(prob === null && (status === "no_liquidity" || status === "awaiting_data"))
	) {
		return `${base} esports-venue-books__td--status`;
	}
	if (isBest) {
		return `${base} esports-venue-books__td--best`;
	}
	return base;
}

function VenueLabelCell({ row }: { row: { id: string; label: string } }) {
	return (
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
	);
}

type Props = {
	tradingPagePrices: TradingPagePrices;
};

export function EsportsVenueBooksPanel({ tradingPagePrices }: Props) {
	const { formatPrice } = useOddsDisplay();
	const formatProbDisplay = useCallback((p: number) => formatPrice(p), [formatPrice]);

	const {
		layout,
		venueRows,
		fifaVenueRows,
		fifaColumns,
		source,
		wsEnabled,
		wsConnected,
		isLoading,
		restError,
		matched,
		appState,
	} = tradingPagePrices;

	const isThreeWay = layout === "threeWay";

	const orderedVenueRows = useMemo(
		() => sortVenueRowsNoSharesLast(venueRows, formatProbDisplay),
		[venueRows, formatProbDisplay],
	);

	const orderedFifaRows = useMemo(
		() => sortFifaVenueRowsNoSharesLast(fifaVenueRows ?? [], formatProbDisplay),
		[fifaVenueRows, formatProbDisplay],
	);

	const bestAIndices = useMemo(
		() =>
			isThreeWay
				? indicesAtBestDisplayedCents(orderedFifaRows.map((r) => ({ ask: r.askHome })))
				: indicesAtBestDisplayedCents(orderedVenueRows.map((r) => ({ ask: r.askA }))),
		[isThreeWay, orderedFifaRows, orderedVenueRows],
	);
	const bestDrawIndices = useMemo(
		() => indicesAtBestDisplayedCents(orderedFifaRows.map((r) => ({ ask: r.askDraw }))),
		[orderedFifaRows],
	);
	const bestBIndices = useMemo(
		() =>
			isThreeWay
				? indicesAtBestDisplayedCents(orderedFifaRows.map((r) => ({ ask: r.askAway })))
				: indicesAtBestDisplayedCents(orderedVenueRows.map((r) => ({ ask: r.askB }))),
		[isThreeWay, orderedFifaRows, orderedVenueRows],
	);

	const rowCount = isThreeWay ? orderedFifaRows.length : orderedVenueRows.length;

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("EsportsVenueBooksPanel (Basic tab render)", {
			layout,
			source,
			wsEnabled,
			wsConnected,
			isLoading,
			restError,
			rowCount,
			fifaColumns,
			matchedPandaId: matched?.pandaMatchId ?? null,
		});
	}, [
		layout,
		source,
		wsEnabled,
		wsConnected,
		isLoading,
		restError,
		rowCount,
		fifaColumns,
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

	if (rowCount === 0) {
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

	const homeHeader = isThreeWay ? (fifaColumns?.home ?? "Home") : tradingPagePrices.teamA;
	const drawHeader = isThreeWay ? (fifaColumns?.draw ?? "Draw") : null;
	const awayHeader = isThreeWay ? (fifaColumns?.away ?? "Away") : tradingPagePrices.teamB;

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
				<table
					className={`esports-venue-books__table${isThreeWay ? " esports-venue-books__table--three-way" : ""}`}
				>
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
								title={homeHeader}
							>
								<span className="esports-venue-books__th-text">{homeHeader}</span>
							</th>
							{isThreeWay ? (
								<th
									scope="col"
									className="esports-venue-books__th esports-venue-books__th--team"
									title={drawHeader ?? "Draw"}
								>
									<span className="esports-venue-books__th-text">{drawHeader}</span>
								</th>
							) : null}
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--team"
								title={awayHeader}
							>
								<span className="esports-venue-books__th-text">{awayHeader}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{isThreeWay
							? orderedFifaRows.map((row, idx) => (
									<tr key={row.id} className="esports-venue-books__tr">
										<VenueLabelCell row={row} />
										<td
											className={askCellClass(
												row.linked,
												row.askHome,
												row.statusHome,
												bestAIndices.has(idx),
												row.id,
											)}
										>
											<span className="esports-venue-books__num-cell">
												{formatAskCell(
													row.linked,
													row.askHome,
													row.statusHome,
													row.id,
													formatProbDisplay,
												)}
											</span>
										</td>
										<td
											className={askCellClass(
												row.linked,
												row.askDraw,
												row.statusDraw,
												bestDrawIndices.has(idx),
												row.id,
											)}
										>
											<span className="esports-venue-books__num-cell">
												{formatAskCell(
													row.linked,
													row.askDraw,
													row.statusDraw,
													row.id,
													formatProbDisplay,
												)}
											</span>
										</td>
										<td
											className={askCellClass(
												row.linked,
												row.askAway,
												row.statusAway,
												bestBIndices.has(idx),
												row.id,
											)}
										>
											<span className="esports-venue-books__num-cell">
												{formatAskCell(
													row.linked,
													row.askAway,
													row.statusAway,
													row.id,
													formatProbDisplay,
												)}
											</span>
										</td>
									</tr>
								))
							: orderedVenueRows.map((row, idx) => (
									<tr key={row.id} className="esports-venue-books__tr">
										<VenueLabelCell row={row} />
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
												{formatAskCell(
													row.linked,
													row.askA,
													row.statusA,
													row.id,
													formatProbDisplay,
												)}
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
												{formatAskCell(
													row.linked,
													row.askB,
													row.statusB,
													row.id,
													formatProbDisplay,
												)}
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
