import { useMemo } from "react";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import "./EsportsVenueBooksPanel.scss";

function bestAskProb(book: OrderbookData | null | undefined): number | null {
	if (!book || book.bestAsk === null || book.bestAsk === undefined) {
		return null;
	}
	const p =
		typeof book.bestAsk === "number" ? book.bestAsk : Number(book.bestAsk);
	return Number.isFinite(p) ? p : null;
}

type VenueRowModel = {
	id: string;
	label: string;
	linked: boolean;
	askA: number | null;
	askB: number | null;
};

function buildVenueRows(m: MatchedMarket): VenueRowModel[] {
	return [
		{
			id: "poly",
			label: "Polymarket",
			linked: true,
			askA: bestAskProb(m.polyPriceA),
			askB: bestAskProb(m.polyPriceB),
		},
		{
			id: "kalshi",
			label: "Kalshi",
			linked: Boolean(m.kalshi),
			askA: m.kalshi ? bestAskProb(m.kalshiPriceA) : null,
			askB: m.kalshi ? bestAskProb(m.kalshiPriceB) : null,
		},
		{
			id: "limitless",
			label: "Limitless",
			linked: Boolean(m.limitless),
			askA: m.limitless ? bestAskProb(m.limitlessPriceA) : null,
			askB: m.limitless ? bestAskProb(m.limitlessPriceB) : null,
		},
		{
			id: "predictFun",
			label: "Predict.fun",
			linked: Boolean(m.predictFun),
			askA: m.predictFun ? bestAskProb(m.predictFunPriceA) : null,
			askB: m.predictFun ? bestAskProb(m.predictFunPriceB) : null,
		},
	];
}

function meanProb(values: (number | null)[]): number | null {
	const nums = values.filter(
		(v): v is number => v !== null && Number.isFinite(v)
	);
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
	const { enabled, connected, appState, lastWsError } = useOddsMonitor();

	const matched = useMemo((): MatchedMarket | null => {
		if (!appState?.markets?.length) return null;
		const id = String(pandascoreMatchId);
		return (
			appState.markets.find((m) => String(m.pandaMatchId) === id) ?? null
		);
	}, [appState?.markets, pandascoreMatchId]);

	const { venueRows, avgA, avgB } = useMemo(() => {
		if (!matched) {
			return {
				venueRows: [] as VenueRowModel[],
				avgA: null as number | null,
				avgB: null as number | null,
			};
		}
		const rows = buildVenueRows(matched);
		const avgAVal = meanProb(rows.map((r) => (r.linked ? r.askA : null)));
		const avgBVal = meanProb(rows.map((r) => (r.linked ? r.askB : null)));

		return {
			venueRows: rows,
			avgA: avgAVal,
			avgB: avgBVal,
		};
	}, [matched]);

	if (!enabled) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__muted">
					Cross-venue odds are not configured. Set{" "}
					<code>VITE_ODDS_WS_BASE</code> if needed. For auth, use the same
					secret as the monitor: <code>MONITOR_TOKEN</code> in the shell that
					starts Vite, or <code>VITE_ODDS_MONITOR_TOKEN</code> in{" "}
					<code>.env</code>, then restart the dev server.
				</p>
			</div>
		);
	}

	if (!connected) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__status">
					Connecting to odds monitor…
				</p>
				{lastWsError ? (
					<p className="esports-venue-books__error">{lastWsError}</p>
				) : null}
			</div>
		);
	}

	if (!matched) {
		return (
			<div className="esports-venue-books">
				<p className="esports-venue-books__muted">
					No monitor row for PandaScore match{" "}
					<code>{pandascoreMatchId}</code>. The match may not be linked on
					the odds server yet.
				</p>
			</div>
		);
	}

	const kh = appState?.kalshiHealth;
	const lh = appState?.limitlessHealth;
	const pf = appState?.predictFunHealth;

	return (
		<div className="esports-venue-books">
			{kh?.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Kalshi</strong> — {kh.lastError}
				</p>
			) : null}
			{lh?.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Limitless</strong> — {lh.lastError}
				</p>
			) : null}
			{pf?.enabled && pf.lastError ? (
				<p className="esports-venue-books__warn">
					<strong>Predict.fun</strong> — {pf.lastError}
				</p>
			) : null}

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
								title={matched.pandaTeamA}
							>
								<span className="esports-venue-books__th-text">
									{matched.pandaTeamA}
								</span>
							</th>
							<th
								scope="col"
								className="esports-venue-books__th esports-venue-books__th--team"
								title={matched.pandaTeamB}
							>
								<span className="esports-venue-books__th-text">
									{matched.pandaTeamB}
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr className="esports-venue-books__tr esports-venue-books__tr--average">
							<th
								scope="row"
								className="esports-venue-books__td esports-venue-books__td--label esports-venue-books__td--avgcell"
							>
								Average Odds
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
									className={askCellClass(row.linked, row.askA)}
								>
									{formatAskCell(row.linked, row.askA)}
								</td>
								<td
									className={askCellClass(row.linked, row.askB)}
								>
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
