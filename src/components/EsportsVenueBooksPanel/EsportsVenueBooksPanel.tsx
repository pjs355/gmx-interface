import { useEffect, useMemo, useState } from "react";
import { useVenuePrices } from "@/context/VenuePriceContext";
import type { SnapshotStatus } from "@/types/odds-monitor";
import type { VenuePriceTeam, VenuePriceSnapshot } from "@/types/venue-prices";
import { fetchMatchedMarkets, type MatchedMarketExchange } from "@/services/api/matchDataService";
import "./EsportsVenueBooksPanel.scss";

function bestAskProb(team: VenuePriceTeam | undefined): number | null {
	if (!team || team.bestAsk === null || team.bestAsk === undefined) return null;
	const p = typeof team.bestAsk === "number" ? team.bestAsk : Number(team.bestAsk);
	return Number.isFinite(p) ? p : null;
}

type VenueRowModel = {
	id: string;
	label: string;
	linked: boolean;
	askA: number | null;
	askB: number | null;
	statusA?: SnapshotStatus;
	statusB?: SnapshotStatus;
};

function hasAnyPrice(snap: VenuePriceSnapshot | undefined): boolean {
	if (!snap) return false;
	return (
		snap.teamA?.bestAsk !== null ||
		snap.teamA?.bestBid !== null ||
		snap.teamB?.bestAsk !== null ||
		snap.teamB?.bestBid !== null
	);
}

function buildVenueRows(
	snapshots: VenuePriceSnapshot[],
	identifier: MatchedMarketExchange | null,
): VenueRowModel[] {
	const byVenue = new Map<string, VenuePriceSnapshot>();
	for (const s of snapshots) byVenue.set(s.venue, s);

	const poly = byVenue.get("polymarket");
	const dflow = byVenue.get("dflow") ?? byVenue.get("kalshi");
	const predictFun = byVenue.get("predict.fun");

	return [
		{
			id: "poly",
			label: "Polymarket",
			linked: Boolean(identifier?.polyConditionId || identifier?.polyTokenIdA),
			askA: bestAskProb(poly?.teamA),
			askB: bestAskProb(poly?.teamB),
		},
		{
			id: "dflow",
			label: "DFlow",
			linked: Boolean(identifier?.dflow || identifier?.kalshi),
			askA: bestAskProb(dflow?.teamA),
			askB: bestAskProb(dflow?.teamB),
		},
		{
			id: "predictFun",
			label: "Predict.fun",
			linked: Boolean(identifier?.predictFun),
			askA: bestAskProb(predictFun?.teamA),
			askB: bestAskProb(predictFun?.teamB),
		},
	];
}

function meanProb(values: (number | null)[]): number | null {
	const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
	if (!nums.length) return null;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatAskCell(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
): string {
	if (!linked) return "—";
	if (prob !== null) return `${Math.round(prob * 100)}¢`;
	if (status === "no_liquidity") return "No shares";
	if (status === "awaiting_data") return "Connecting…";
	return "—";
}

function formatAvgProb(prob: number | null): string {
	if (prob === null) return "—";
	return `${Math.round(prob * 100)}¢`;
}

function askCellClass(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
): string {
	const base = "esports-venue-books__td esports-venue-books__td--num";
	if (!linked || (prob === null && !status)) {
		return `${base} esports-venue-books__td--empty`;
	}
	if (prob === null && (status === "no_liquidity" || status === "awaiting_data")) {
		return `${base} esports-venue-books__td--status`;
	}
	return base;
}

type Props = {
	pandascoreMatchId: string;
};

export function EsportsVenueBooksPanel({ pandascoreMatchId }: Props) {
	const { enabled, connected, prices, lastWsError, subscribe, unsubscribe } = useVenuePrices();

	useEffect(() => {
		const id = pandascoreMatchId?.trim();
		if (!id || !connected) return;
		subscribe(id);
		return () => unsubscribe(id);
	}, [pandascoreMatchId, connected, subscribe, unsubscribe]);

	const [identifier, setIdentifier] = useState<MatchedMarketExchange | null>(null);
	useEffect(() => {
		const id = pandascoreMatchId?.trim();
		if (!id) return;
		fetchMatchedMarkets()
			.then((markets) => {
				const found = markets.find((m) => String(m.pandaMatchId) === id);
				setIdentifier(found ?? null);
			})
			.catch((err) => {
				console.error("error", err);
			});
	}, [pandascoreMatchId]);

	const snapshots = useMemo((): VenuePriceSnapshot[] => {
		const id = pandascoreMatchId?.trim();
		if (!id) return [];
		return prices.get(id) ?? [];
	}, [prices, pandascoreMatchId]);

	const { venueRows, avgA, avgB } = useMemo(() => {
		const rows = buildVenueRows(snapshots, identifier).filter((r) => r.linked);
		const avgAVal = meanProb(rows.map((r) => r.askA));
		const avgBVal = meanProb(rows.map((r) => r.askB));
		return { venueRows: rows, avgA: avgAVal, avgB: avgBVal };
	}, [snapshots, identifier]);

	const teamA = identifier?.pandaTeamA ?? "Team A";
	const teamB = identifier?.pandaTeamB ?? "Team B";

	if (!enabled) {
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

	if (!connected) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__status">
					Connecting to venue prices…
				</p>
				{lastWsError ? (
					<p className="esports-venue-books__error">{lastWsError}</p>
				) : null}
			</div>
		);
	}

	if (!identifier) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__muted">
					No matched market for PandaScore match{" "}
					<code>{pandascoreMatchId}</code>.
				</p>
			</div>
		);
	}

	return (
		<div className="esports-venue-books">
			<div className="esports-venue-books__table-wrap">
				<table className="esports-venue-books__table">
					<thead>
						<tr>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--venue"
								aria-label="Exchange"
							/>
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
						<tr className="esports-venue-books__tr esports-venue-books__tr--average">
							<th
								scope="row"
								className="esports-venue-books__td esports-venue-books__td--label esports-venue-books__td--avgcell"
							>
								Average Price
							</th>
							<td className="esports-venue-books__td esports-venue-books__td--num esports-venue-books__td--avgcell">
								{formatAvgProb(avgA)}
							</td>
							<td className="esports-venue-books__td esports-venue-books__td--num esports-venue-books__td--avgcell">
								{formatAvgProb(avgB)}
							</td>
						</tr>
					{venueRows.map((row) => (
						<tr key={row.id} className="esports-venue-books__tr">
							<th
								scope="row"
								className="esports-venue-books__td esports-venue-books__td--label"
							>
								{row.label}
							</th>
							<td
								className={askCellClass(row.linked, row.askA, row.statusA)}
							>
								{formatAskCell(row.linked, row.askA, row.statusA)}
							</td>
							<td
								className={askCellClass(row.linked, row.askB, row.statusB)}
							>
								{formatAskCell(row.linked, row.askB, row.statusB)}
							</td>
						</tr>
					))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
