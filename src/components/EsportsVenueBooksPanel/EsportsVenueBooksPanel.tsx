import { useEffect, useMemo } from "react";
import { useVenuePrices } from "@/context/VenuePriceContext";
import type { VenuePriceSnapshot, VenuePriceTeam } from "@/types/venue-prices";
import { fetchMatchedMarkets, type MatchedMarketExchange } from "@/services/api/matchDataService";
import { useState } from "react";
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
	const limitless = byVenue.get("limitless");
	const predictFun = byVenue.get("predict.fun");

	return [
		{
			id: "poly",
			label: "Polymarket",
			linked: Boolean(identifier?.polyConditionId) || hasAnyPrice(poly),
			askA: bestAskProb(poly?.teamA),
			askB: bestAskProb(poly?.teamB),
		},
		{
			id: "dflow",
			label: "DFlow",
			linked: Boolean(identifier?.dflow ?? identifier?.kalshi) || hasAnyPrice(dflow),
			askA: bestAskProb(dflow?.teamA),
			askB: bestAskProb(dflow?.teamB),
		},
		{
			id: "limitless",
			label: "Limitless",
			linked: Boolean(limitless) || hasAnyPrice(limitless),
			askA: bestAskProb(limitless?.teamA),
			askB: bestAskProb(limitless?.teamB),
		},
		{
			id: "predictFun",
			label: "Predict.fun",
			linked: Boolean(identifier?.predictFun) || hasAnyPrice(predictFun),
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

function formatAskCell(linked: boolean, prob: number | null): string {
	if (!linked || prob === null) return "—";
	return `${Math.round(prob * 100)}¢`;
}

function formatAvgProb(prob: number | null): string {
	if (prob === null) return "—";
	return `${Math.round(prob * 100)}¢`;
}

function askCellClass(linked: boolean, prob: number | null): string {
	const base = "esports-venue-books__td esports-venue-books__td--num";
	if (!linked || prob === null) {
		return `${base} esports-venue-books__td--empty`;
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
		const rows = buildVenueRows(snapshots, identifier);
		const avgAVal = meanProb(rows.map((r) => (r.linked ? r.askA : null)));
		const avgBVal = meanProb(rows.map((r) => (r.linked ? r.askB : null)));
		return { venueRows: rows, avgA: avgAVal, avgB: avgBVal };
	}, [snapshots, identifier]);

	const teamA = identifier?.pandaTeamA ?? "Team A";
	const teamB = identifier?.pandaTeamB ?? "Team B";

	if (!enabled) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__muted">
					Cross-venue prices are not available. The venue price WebSocket is
					not configured.
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
								<td className={askCellClass(row.linked, row.askA)}>
									{formatAskCell(row.linked, row.askA)}
								</td>
								<td className={askCellClass(row.linked, row.askB)}>
									{formatAskCell(row.linked, row.askB)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
