import { useCallback, useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { SnapshotStatus } from "@/types/odds-monitor";
import { orderThreeWayLegs, threeWayLegLabel } from "@/features/markets/listing/threeWayMoneyline";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { buildVenuePriceRows } from "@/features/markets/pricing/buildVenuePriceRows";
import type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";
import {
	askCellClass,
	formatAskCell,
	indicesAtBestAsk,
} from "@/features/markets/pricing/venueBooksCells";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import { resolveMarketLogo } from "@/features/markets/assets/marketLogoResolver";
import "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel.scss";
import "./ThreeWayVenueBooksPanel.scss";

/** Each FIFA leg is its own binary Polymarket market keyed by `polymarketMarketId`. */
function legVenueKey(leg: PredictionMarket | null): string {
	return leg && typeof leg.polymarketMarketId === "string" ? leg.polymarketMarketId.trim() : "";
}

/**
 * Live cross-venue YES rows for a single 3-way leg. Subscribes the leg's
 * `polymarketMarketId` so every column has prices (not just the active leg) and
 * reuses the exact same `buildVenuePriceRows` pipeline as the esports Basic table.
 */
function useLegVenueRows(leg: PredictionMarket | null): VenueRowModel[] {
	const venueKey = legVenueKey(leg);
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();
	const { appState } = useOddsMonitor();

	useEffect(() => {
		if (!venueKey) return;
		subscribePandaMatchId(venueKey);
		return () => unsubscribePandaMatchId(venueKey);
	}, [venueKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(venueKey || null, null);
	return useMemo(
		// `matched` is mutated in place on WS ticks; `appState.timestamp` forces recompute.
		() => (matched ? buildVenuePriceRows(matched) : []),
		[matched, appState?.timestamp],
	);
}

type LegCol = "home" | "away" | "draw";

type ThreeWayVenueRow = {
	id: string;
	label: string;
	asks: Record<LegCol, number | null>;
	statuses: Record<LegCol, SnapshotStatus | undefined>;
};

type Props = {
	/** Umbrella display questions; the three moneyline legs are derived from them. */
	legs: PredictionMarket[];
};

/**
 * Basic-tab cross-venue odds table for a 3-way moneyline (FIFA). Identical to the
 * esports {@link EsportsVenueBooksPanel} (venue rows × best BBO) but with three
 * outcome columns — Team A win / Team B win / Draw — one per leg. Read-only; the
 * trade module is driven from the Orderbooks tab leg selector / trade box.
 */
export function ThreeWayVenueBooksPanel({ legs }: Props) {
	const { formatPrice } = useOddsDisplay();
	const { enabled: wsEnabled } = useOddsMonitor();
	const formatProbDisplay = useCallback((p: number) => formatPrice(p), [formatPrice]);

	const ordered = useMemo(() => orderThreeWayLegs(legs), [legs]);
	const home = ordered.find((l) => l.moneylineLeg === "home") ?? null;
	const away = ordered.find((l) => l.moneylineLeg === "away") ?? null;
	const draw = ordered.find((l) => l.moneylineLeg === "draw") ?? null;

	const homeRows = useLegVenueRows(home);
	const awayRows = useLegVenueRows(away);
	const drawRows = useLegVenueRows(draw);

	/** Pivot per-leg venue rows into one row per venue with three outcome asks. */
	const rows = useMemo<ThreeWayVenueRow[]>(() => {
		const byId = new Map<string, ThreeWayVenueRow>();
		const order: string[] = [];
		const cols: { key: LegCol; rows: VenueRowModel[] }[] = [
			{ key: "home", rows: homeRows },
			{ key: "away", rows: awayRows },
			{ key: "draw", rows: drawRows },
		];
		for (const col of cols) {
			for (const r of col.rows) {
				let row = byId.get(r.id);
				if (!row) {
					row = {
						id: r.id,
						label: r.label,
						asks: { home: null, away: null, draw: null },
						statuses: { home: undefined, away: undefined, draw: undefined },
					};
					byId.set(r.id, row);
					order.push(r.id);
				}
				row.asks[col.key] = r.askA;
				row.statuses[col.key] = r.statusA;
			}
		}
		return order.map((id) => byId.get(id) as ThreeWayVenueRow);
	}, [homeRows, awayRows, drawRows]);

	const bestHome = useMemo(() => indicesAtBestAsk(rows, (r) => r.asks.home), [rows]);
	const bestAway = useMemo(() => indicesAtBestAsk(rows, (r) => r.asks.away), [rows]);
	const bestDraw = useMemo(() => indicesAtBestAsk(rows, (r) => r.asks.draw), [rows]);
	const bestByCol: Record<LegCol, Set<number>> = {
		home: bestHome,
		away: bestAway,
		draw: bestDraw,
	};

	const columns: { key: LegCol; label: string }[] = [
		{ key: "home", label: home ? threeWayLegLabel(home) : "—" },
		{ key: "away", label: away ? threeWayLegLabel(away) : "—" },
		{ key: "draw", label: draw ? threeWayLegLabel(draw) : "Draw" },
	];

	if (!wsEnabled) {
		return (
			<div className="esports-venue-books three-way-venue-books">
				<p className="esports-venue-books__muted">
					Cross-venue odds are not configured. Set <code>VITE_ODDS_WS_BASE</code> to override the
					venue-prices WebSocket URL if needed, then restart the dev server.
				</p>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="esports-venue-books three-way-venue-books">
				<p className="esports-venue-books__status">Loading venue prices…</p>
			</div>
		);
	}

	return (
		<div className="esports-venue-books three-way-venue-books">
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
							{columns.map((col) => (
								<th
									key={col.key}
									scope="col"
									className="esports-venue-books__th esports-venue-books__th--team"
									title={col.label}
								>
									<span className="esports-venue-books__th-text">{col.label}</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, idx) => (
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
								{columns.map((col) => {
									const ask = row.asks[col.key];
									const status = row.statuses[col.key];
									return (
										<td
											key={col.key}
											className={askCellClass(true, ask, status, bestByCol[col.key].has(idx), row.id)}
										>
											<span className="esports-venue-books__num-cell">
												{formatAskCell(true, ask, status, row.id, formatProbDisplay)}
											</span>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
