import { useCallback, useEffect, useMemo } from "react";
import type { SnapshotStatus } from "@/types/odds-monitor";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import type { TradingPagePrices, VenueRowModel } from "@/hooks/useTradingPagePrices";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import { resolveMarketLogo } from "@/helpers/marketLogoResolver";
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
	/** Limitless row is linked from matched-markets; empty book is “no offers”, not a broken UI. */
	if (isLimitlessVenueRow(venueId)) return "No shares";
	return "—";
}

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

const ASK_BEST_EPS = 1e-10;

/** Row indices at the numerically best (lowest) ask in the column — whole-cent rounding hid sub-cent ties. */
function indicesAtBestDisplayedCents(
	rows: VenueRowModel[],
	key: "askA" | "askB",
): Set<number> {
	let minP = Infinity;
	for (const r of rows) {
		const p = r[key];
		if (p !== null && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE) {
			minP = Math.min(minP, p);
		}
	}
	if (!Number.isFinite(minP)) return new Set();
	const out = new Set<number>();
	rows.forEach((r, i) => {
		const p = r[key];
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
	const limitlessLinkedNoQuote =
		isLimitlessVenueRow(venueId) && linked && prob === null && !status;
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

type Props = {
	tradingPagePrices: TradingPagePrices;
};

export function EsportsVenueBooksPanel({ tradingPagePrices }: Props) {
	const { formatPrice } = useOddsDisplay();
	const formatProbDisplay = useCallback(
		(p: number) => formatPrice(p),
		[formatPrice],
	);

	const {
		venueRows,
		bestYesPrice,
		bestNoPrice,
		teamA,
		teamB,
		source,
		wsEnabled,
		wsConnected,
		isLoading,
		restError,
		matched,
		appState,
	} = tradingPagePrices;

	const orderedVenueRows = useMemo(
		() => sortVenueRowsNoSharesLast(venueRows, formatProbDisplay),
		[venueRows, formatProbDisplay],
	);

	const bestAIndices = useMemo(
		() => indicesAtBestDisplayedCents(orderedVenueRows, "askA"),
		[orderedVenueRows],
	);
	const bestBIndices = useMemo(
		() => indicesAtBestDisplayedCents(orderedVenueRows, "askB"),
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
					Cross-venue odds are not configured. Set{" "}
					<code>VITE_ODDS_WS_BASE</code> to override the venue-prices
					WebSocket URL if needed, then restart the dev server.
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
						Couldn&apos;t load cross-venue prices: the odds WebSocket is disconnected and
						the backup odds API request failed. Check your network, VPN, or odds service
						config (<code>VITE_ODDS_WS_BASE</code> / private API), then refresh.
					</p>
				</div>
			);
		}
		if (wsConnected && !matched) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__muted">
						No monitor row for this match. The match may not be linked on
						the odds server yet.
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
								<span className="esports-venue-books__th-text">
									{teamA}
								</span>
							</th>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--team"
								title={teamB}
							>
								<span className="esports-venue-books__th-text">
									{teamB}
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
					{orderedVenueRows.map((row: VenueRowModel, idx: number) => (
						<tr key={row.id} className="esports-venue-books__tr">
							<th
								scope="row"
								className="esports-venue-books__td esports-venue-books__td--label"
							>
								<span className="esports-venue-books__label-row">
									{resolveMarketLogo(row.id) ? (
										<MarketLogo venue={row.id} size={16} />
									) : (
										<span
											className="esports-venue-books__logo-placeholder"
											aria-hidden="true"
										/>
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
								{formatAskCell(row.linked, row.askA, row.statusA, row.id, formatProbDisplay)}
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
								{formatAskCell(row.linked, row.askB, row.statusB, row.id, formatProbDisplay)}
							</td>
						</tr>
					))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
