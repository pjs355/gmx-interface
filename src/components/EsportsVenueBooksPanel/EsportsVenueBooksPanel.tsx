import type { SnapshotStatus } from "@/types/odds-monitor";
import type { TradingPagePrices, VenueRowModel } from "@/hooks/useTradingPagePrices";
import "./EsportsVenueBooksPanel.scss";

const MIN_VALID_PRICE = 0.005;
const MAX_VALID_PRICE = 0.995;

function formatAskCell(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
): string {
	if (!linked) return "—";
	if (prob !== null && prob >= MIN_VALID_PRICE && prob <= MAX_VALID_PRICE) return `${Math.round(prob * 100)}¢`;
	if (prob !== null || status === "no_liquidity") return "No shares";
	if (status === "awaiting_data") return "Connecting…";
	return "—";
}

function askCellClass(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
	isBest?: boolean,
): string {
	const base = "esports-venue-books__td esports-venue-books__td--num";
	if (!linked || (prob === null && !status)) {
		return `${base} esports-venue-books__td--empty`;
	}
	const outOfRange = prob !== null && (prob < MIN_VALID_PRICE || prob > MAX_VALID_PRICE);
	if (outOfRange || (prob === null && (status === "no_liquidity" || status === "awaiting_data"))) {
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
	const {
		venueRows,
		bestAIdx,
		bestBIdx,
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
						Venue prices are unavailable from your current region.
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
								className="esports-venue-books__th esports-venue-books__th--venue"
								aria-label="Exchange"
							/>
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
					{venueRows.map((row: VenueRowModel, idx: number) => (
						<tr key={row.id} className="esports-venue-books__tr">
							<th
								scope="row"
								className="esports-venue-books__td esports-venue-books__td--label"
							>
								{row.label}
							</th>
							<td
								className={askCellClass(row.linked, row.askA, row.statusA, idx === bestAIdx)}
							>
								{formatAskCell(row.linked, row.askA, row.statusA)}
							</td>
							<td
								className={askCellClass(row.linked, row.askB, row.statusB, idx === bestBIdx)}
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
