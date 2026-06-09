import { useCallback, useEffect, useMemo, useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import type { SnapshotStatus } from "@/types/odds-monitor";
import {
	groupWinnerLegColor,
	groupWinnerLegLabel,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
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

/** Each group-winner leg is its own binary Polymarket market keyed by `polymarketMarketId`. */
function legVenueKey(leg: PredictionMarket | null | undefined): string {
	return leg && typeof leg.polymarketMarketId === "string" ? leg.polymarketMarketId.trim() : "";
}

/**
 * Headless probe: subscribes one group-winner leg's cross-venue prices and lifts
 * the resulting venue rows up to the parent. Rendered once per leg, so a group
 * with N teams mounts N probes — this keeps hook usage stable per leg instead of
 * calling a fixed number of `useLegVenueRows` hooks (which can't scale to N).
 */
function LegVenueRowsProbe({
	leg,
	onRows,
}: {
	leg: PredictionMarket;
	onRows: (legKey: string, rows: VenueRowModel[]) => void;
}) {
	const venueKey = legVenueKey(leg);
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();
	const { appState } = useOddsMonitor();

	useEffect(() => {
		if (!venueKey) return;
		subscribePandaMatchId(venueKey);
		return () => unsubscribePandaMatchId(venueKey);
	}, [venueKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(venueKey || null, null);
	const rows = useMemo(
		// `matched` is mutated in place on WS ticks; `appState.timestamp` forces recompute.
		() => (matched ? buildVenuePriceRows(matched) : []),
		[matched, appState?.timestamp],
	);

	useEffect(() => {
		onRows(venueKey, rows);
	}, [venueKey, rows, onRows]);

	return null;
}

type GroupVenueRow = {
	id: string;
	label: string;
	asks: Record<string, number | null>;
	statuses: Record<string, SnapshotStatus | undefined>;
};

type Props = {
	/** Umbrella display questions; the N team legs are derived from them. */
	legs: PredictionMarket[];
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
};

/**
 * Basic-tab cross-venue odds table for a FIFA "Group X Winner" prop. Generalizes
 * {@link ThreeWayVenueBooksPanel} to N outcome columns (one per team, no Draw):
 * venue rows × best YES ask per team. Read-only; trading is driven from the
 * Orderbooks tab leg selector / trade box.
 */
export function GroupWinnerVenueBooksPanel({ legs, teamMappings, gameTeamColorBySlug }: Props) {
	const { formatPrice } = useOddsDisplay();
	const { enabled: wsEnabled } = useOddsMonitor();
	const formatProbDisplay = useCallback((p: number) => formatPrice(p), [formatPrice]);

	const ordered = useMemo(() => orderGroupWinnerLegs(legs), [legs]);

	const columns = useMemo(
		() =>
			ordered.map((leg, index) => ({
				key: legVenueKey(leg),
				label: groupWinnerLegLabel(leg),
				color: groupWinnerLegColor(leg, index, teamMappings, gameTeamColorBySlug),
			})),
		[ordered, teamMappings, gameTeamColorBySlug],
	);

	const [rowsByLeg, setRowsByLeg] = useState<Record<string, VenueRowModel[]>>({});
	const handleRows = useCallback((legKey: string, rows: VenueRowModel[]) => {
		if (!legKey) return;
		setRowsByLeg((prev) => {
			if (prev[legKey] === rows) return prev;
			return { ...prev, [legKey]: rows };
		});
	}, []);

	/** Pivot per-leg venue rows into one row per venue with N team asks. */
	const rows = useMemo<GroupVenueRow[]>(() => {
		const byId = new Map<string, GroupVenueRow>();
		const order: string[] = [];
		for (const col of columns) {
			const legRows = rowsByLeg[col.key] ?? [];
			for (const r of legRows) {
				let row = byId.get(r.id);
				if (!row) {
					row = { id: r.id, label: r.label, asks: {}, statuses: {} };
					byId.set(r.id, row);
					order.push(r.id);
				}
				row.asks[col.key] = r.askA;
				row.statuses[col.key] = r.statusA;
			}
		}
		return order.map((id) => byId.get(id) as GroupVenueRow);
	}, [columns, rowsByLeg]);

	const bestByCol = useMemo(() => {
		const map: Record<string, Set<number>> = {};
		for (const col of columns) {
			map[col.key] = indicesAtBestAsk(rows, (r) => r.asks[col.key] ?? null);
		}
		return map;
	}, [columns, rows]);

	const probes = (
		<>
			{ordered.map((leg) => (
				<LegVenueRowsProbe key={legVenueKey(leg) || leg._id} leg={leg} onRows={handleRows} />
			))}
		</>
	);

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
				{probes}
				<p className="esports-venue-books__status">Loading venue prices…</p>
			</div>
		);
	}

	return (
		<div className="esports-venue-books three-way-venue-books">
			{probes}
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
									const ask = row.asks[col.key] ?? null;
									const status = row.statuses[col.key];
									return (
										<td
											key={col.key}
											className={askCellClass(
												true,
												ask,
												status,
												bestByCol[col.key]?.has(idx) ?? false,
												row.id,
											)}
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
