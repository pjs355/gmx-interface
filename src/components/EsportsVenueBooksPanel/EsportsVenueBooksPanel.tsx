import { useMemo } from "react";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { MatchedMarket, OrderbookData, SnapshotStatus } from "@/types/odds-monitor";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { DirectVenueBooks } from "@/trading/venue-books";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";
import { useVenueBbo } from "@/hooks/useVenueBbo";
import type { VenueBboResponse } from "@/hooks/useVenueBbo";
import "./EsportsVenueBooksPanel.scss";

const MIN_VALID_PRICE = 0.005;
const MAX_VALID_PRICE = 0.995;

function bestAskProb(book: OrderbookData | null | undefined): number | null {
	if (!book) return null;

	if (book.bestAsk !== null && book.bestAsk !== undefined) {
		const p = typeof book.bestAsk === "number" ? book.bestAsk : Number(book.bestAsk);
		if (Number.isFinite(p) && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE) return p;
	}

	if (book.asks?.length) {
		let min = Infinity;
		for (const a of book.asks) {
			if (a.size > 0 && a.price >= MIN_VALID_PRICE && a.price <= MAX_VALID_PRICE && a.price < min) min = a.price;
		}
		if (min !== Infinity) return min;
	}

	return null;
}

function bookStatus(book: OrderbookData | null | undefined): SnapshotStatus | undefined {
	return book?.snapshotStatus;
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

function bestAskFromSnapshot(snap: OrderbookSnapshot | null | undefined): number | null {
	if (!snap?.asks?.length) return null;
	let min = Infinity;
	for (const a of snap.asks) {
		if (a.size > 0 && a.price >= MIN_VALID_PRICE && a.price <= MAX_VALID_PRICE && a.price < min) min = a.price;
	}
	return min === Infinity ? null : min;
}

function buildVenueRows(m: MatchedMarket, directBooks?: DirectVenueBooks | null): VenueRowModel[] {
	const polyAskA = bestAskProb(m.polyPriceA) ?? bestAskFromSnapshot(directBooks?.polyBookA);
	const polyAskB = bestAskProb(m.polyPriceB) ?? bestAskFromSnapshot(directBooks?.polyBookB);

	const dflowLinked = Boolean(getDflowKalshiMonitorLink(m));
	const dflowAskA = dflowLinked
		? (bestAskProb(m.dflowPriceA ?? m.kalshiPriceA) ?? bestAskFromSnapshot(directBooks?.dflowBookA))
		: null;
	const dflowAskB = dflowLinked
		? (bestAskProb(m.dflowPriceB ?? m.kalshiPriceB) ?? bestAskFromSnapshot(directBooks?.dflowBookB))
		: null;

	return [
		{
			id: "poly",
			label: "Polymarket",
			linked: Boolean(m.polyConditionId || m.polyTokenIdA),
			askA: polyAskA,
			askB: polyAskB,
			statusA: bookStatus(m.polyPriceA),
			statusB: bookStatus(m.polyPriceB),
		},
		{
			id: "dflow",
			label: "Kalshi",
			linked: dflowLinked,
			askA: dflowAskA,
			askB: dflowAskB,
			statusA: bookStatus(m.dflowPriceA ?? m.kalshiPriceA),
			statusB: bookStatus(m.dflowPriceB ?? m.kalshiPriceB),
		},
		{
			id: "limitless",
			label: "Limitless",
			linked: Boolean(m.limitless),
			askA: m.limitless ? bestAskProb(m.limitlessPriceA) : null,
			askB: m.limitless ? bestAskProb(m.limitlessPriceB) : null,
			statusA: bookStatus(m.limitlessPriceA),
			statusB: bookStatus(m.limitlessPriceB),
		},
		{
			id: "predictFun",
			label: "Predict.fun",
			linked: Boolean(m.predictFun),
			askA: m.predictFun ? bestAskProb(m.predictFunPriceA) : null,
			askB: m.predictFun ? bestAskProb(m.predictFunPriceB) : null,
			statusA: bookStatus(m.predictFunPriceA),
			statusB: bookStatus(m.predictFunPriceB),
		},
	];
}

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

function isValidPrice(p: number): boolean {
	return p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE;
}

function computeLevelUpRow(orderbook: OrderbookSnapshot | null | undefined): { askA: number | null; askB: number | null } {
	if (!orderbook) return { askA: null, askB: null };
	const posAsks = orderbook.asks?.filter((a) => a.size > 0 && isValidPrice(a.price)) ?? [];
	const bestAsk = posAsks.length > 0
		? Math.min(...posAsks.map((a) => a.price))
		: null;
	const posBids = orderbook.bids?.filter((b) => b.size > 0 && isValidPrice(b.price)) ?? [];
	const bestBid = posBids.length > 0
		? Math.max(...posBids.map((b) => b.price))
		: null;
	const askB = bestBid !== null ? 1 - bestBid : null;
	return {
		askA: bestAsk,
		askB: askB !== null && isValidPrice(askB) ? askB : null,
	};
}

const VENUE_LABEL_MAP: Record<string, string> = {
	polymarket: "Polymarket",
	dflow: "Kalshi",
	predictfun: "Predict.fun",
	limitless: "Limitless",
};

function buildVenueRowsFromRest(
	bbo: VenueBboResponse,
	levelUpOrderbook: OrderbookSnapshot | null | undefined,
): { rows: VenueRowModel[]; teamA: string; teamB: string } {
	const luPrices = computeLevelUpRow(levelUpOrderbook);
	const luRestA = bbo.levelup.bestAskA && isValidPrice(bbo.levelup.bestAskA) ? bbo.levelup.bestAskA : null;
	const luRestB = bbo.levelup.bestAskB && isValidPrice(bbo.levelup.bestAskB) ? bbo.levelup.bestAskB : null;
	const luRow: VenueRowModel = {
		id: "levelup",
		label: "LevelUp",
		linked: luPrices.askA !== null || luPrices.askB !== null || luRestA !== null,
		askA: luPrices.askA ?? luRestA,
		askB: luPrices.askB ?? luRestB,
	};

	const venueRows: VenueRowModel[] = bbo.venues
		.filter((v) => v.linked)
		.map((v) => ({
			id: v.venue,
			label: VENUE_LABEL_MAP[v.venue] ?? v.venue,
			linked: true,
			askA: v.bestAskA && isValidPrice(v.bestAskA) ? v.bestAskA : null,
			askB: v.bestAskB && isValidPrice(v.bestAskB) ? v.bestAskB : null,
			statusA: v.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined,
			statusB: v.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined,
		}));

	const rows = luRow.linked ? [luRow, ...venueRows] : venueRows;
	return { rows, teamA: bbo.pandaTeamA, teamB: bbo.pandaTeamB };
}

type Props = {
	pandascoreMatchId: string;
	levelUpOrderbook?: OrderbookSnapshot | null;
	directBooks?: DirectVenueBooks | null;
};

export function EsportsVenueBooksPanel({ pandascoreMatchId, levelUpOrderbook, directBooks }: Props) {
	const { enabled, connected, appState, lastWsError } = useOddsMonitor();

	const restBbo = useVenueBbo(pandascoreMatchId, true);

	const matched = useMemo((): MatchedMarket | null => {
		if (!appState?.markets?.length) return null;
		const id = String(pandascoreMatchId);
		return (
			appState.markets.find((m) => String(m.pandaMatchId) === id) ?? null
		);
	}, [appState?.markets, pandascoreMatchId]);

	const hasDirectBookPrices = Boolean(
		directBooks?.polyBookA?.asks?.length || directBooks?.polyBookB?.asks?.length
		|| directBooks?.dflowBookA?.asks?.length || directBooks?.dflowBookB?.asks?.length
	);
	const wsHasVenuePrices = connected && matched && (
		matched.polyPriceA !== null || matched.dflowPriceA !== null
		|| matched.predictFunPriceA !== null || matched.limitlessPriceA !== null
		|| hasDirectBookPrices
	);

	const { venueRows, bestAIdx, bestBIdx, teamA, teamB } = useMemo(() => {
		function computeBest(rows: VenueRowModel[]) {
			let bestA = Infinity;
			let bestAIndex = -1;
			let bestB = Infinity;
			let bestBIndex = -1;
			rows.forEach((r, i) => {
				if (r.askA !== null && isValidPrice(r.askA) && r.askA < bestA) { bestA = r.askA; bestAIndex = i; }
				if (r.askB !== null && isValidPrice(r.askB) && r.askB < bestB) { bestB = r.askB; bestBIndex = i; }
			});
			return { bestAIdx: bestAIndex, bestBIdx: bestBIndex };
		}

		if (wsHasVenuePrices && matched) {
			const externalRows = buildVenueRows(matched, directBooks).filter((r) => r.linked);
			const luPrices = computeLevelUpRow(levelUpOrderbook);
			const luRow: VenueRowModel = {
				id: "levelup",
				label: "LevelUp",
				linked: luPrices.askA !== null || luPrices.askB !== null,
				askA: luPrices.askA,
				askB: luPrices.askB,
			};
			const rows = luRow.linked ? [luRow, ...externalRows] : externalRows;
			const { bestAIdx: bA, bestBIdx: bB } = computeBest(rows);
			return { venueRows: rows, bestAIdx: bA, bestBIdx: bB, teamA: matched.pandaTeamA, teamB: matched.pandaTeamB };
		}

		if (restBbo.data) {
			const { rows, teamA: rTeamA, teamB: rTeamB } = buildVenueRowsFromRest(restBbo.data, levelUpOrderbook);
			const { bestAIdx: bA, bestBIdx: bB } = computeBest(rows);
			return { venueRows: rows, bestAIdx: bA, bestBIdx: bB, teamA: rTeamA, teamB: rTeamB };
		}

		if (connected && matched) {
			const externalRows = buildVenueRows(matched, directBooks).filter((r) => r.linked);
			const luPrices = computeLevelUpRow(levelUpOrderbook);
			const luRow: VenueRowModel = {
				id: "levelup",
				label: "LevelUp",
				linked: luPrices.askA !== null || luPrices.askB !== null,
				askA: luPrices.askA,
				askB: luPrices.askB,
			};
			const rows = luRow.linked ? [luRow, ...externalRows] : externalRows;
			const { bestAIdx: bA, bestBIdx: bB } = computeBest(rows);
			return { venueRows: rows, bestAIdx: bA, bestBIdx: bB, teamA: matched.pandaTeamA, teamB: matched.pandaTeamB };
		}

		return { venueRows: [] as VenueRowModel[], bestAIdx: -1, bestBIdx: -1, teamA: "", teamB: "" };
	}, [wsHasVenuePrices, connected, matched, levelUpOrderbook, restBbo.data, directBooks]);

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

	if (venueRows.length === 0) {
		if (restBbo.isLoading) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__status">Loading venue prices…</p>
				</div>
			);
		}
		if (restBbo.error && !connected) {
			return (
				<div className="esports-venue-books">
					<p className="esports-venue-books__muted">
						Venue prices are unavailable from your current region.
					</p>
				</div>
			);
		}
		if (connected && !matched) {
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
					{venueRows.map((row, idx) => (
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
