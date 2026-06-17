import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { useMedia } from "react-use";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import OddsDisplaySelect from "@/components/OddsDisplaySelect/OddsDisplaySelect";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { resolveMarketLogo } from "@/features/markets/assets/marketLogoResolver";
import { abbreviateFixtureTitle, allOddsOutcomeDisplayLabel } from "@/features/markets/listing/matchProps";
import {
	askCellClass,
	formatAskCell,
	indicesAtBestAsk,
} from "@/features/markets/pricing/venueBooksCells";
import {
	formatEventStartDisplay,
	normalizeEventDateInput,
} from "@/pages/Predictions/utils/eventDates";
import { isMlbGameSlug } from "@/pages/Predictions/utils/gameLinkFilters";
import { ALL_ODDS_ADAPTERS } from "./adapters";
import { effectiveBuyImpliedProb } from "./allOddsEffectiveBuyImplied";
import { buildAllOddsGroups } from "./allOddsViewModel";
import type { AllOddsGroup, AllOddsMarket, AllOddsOutcomeRow } from "./types";
import "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel.scss";

const GROUPS_PER_PAGE = 25;
const VENUE_COL_COUNT = ALL_ODDS_ADAPTERS.length;

type SportFilter = "all" | "esports" | "soccer";

function isSoccerMarket(m: AllOddsMarket): boolean {
	return m.game?.toLowerCase().startsWith("soccer") ?? false;
}

function isEsportsMarket(m: AllOddsMarket): boolean {
	return !isSoccerMarket(m);
}

function groupMatchesSport(group: AllOddsGroup, sport: SportFilter): boolean {
	if (sport === "all") return true;
	const sample =
		group.primaryOutcomes[0]?.market ?? group.moreSections[0]?.outcomes[0]?.market;
	if (!sample) return false;
	if (sport === "soccer") return isSoccerMarket(sample);
	return isEsportsMarket(sample);
}

function outcomeRowKey(row: AllOddsOutcomeRow): string {
	return `${row.market.pandaMatchId}:${row.yesSide}:${row.label}`;
}

function tradeHref(row: AllOddsOutcomeRow): string | null {
	const id = row.market.umbrellaId?.trim();
	return id ? `/predictions/umbrella/${id}` : null;
}

function displayAskProb(
	cell: AllOddsOutcomeRow["venueCells"][number],
	includeFees: boolean,
): number | null {
	if (!cell.linked || cell.ask === null) return null;
	if (!includeFees) return cell.ask;
	return effectiveBuyImpliedProb(cell.id, cell.ask) ?? cell.ask;
}

function AllOddsColGroup() {
	return (
		<colgroup>
			<col className="all-odds-col-markets" />
			{ALL_ODDS_ADAPTERS.map((col) => (
				<col key={col.id} className="all-odds-col-venue" />
			))}
		</colgroup>
	);
}

function VenueHeaderRow({ isMobile }: { isMobile: boolean }) {
	return (
		<tr>
			<th
				scope="col"
				className="esports-venue-books__th all-odds-th-markets"
				aria-label={isMobile ? "Outcome" : undefined}
			>
				{isMobile ? "" : "Markets"}
			</th>
			{ALL_ODDS_ADAPTERS.map((col) => (
				<th
					key={col.id}
					scope="col"
					className="esports-venue-books__th all-odds-th-venue"
					title={col.label}
				>
					<span className="all-odds-venue-head">
						{resolveMarketLogo(col.id) ? (
							<MarketLogo
								venue={col.id}
								size={16}
								className="esports-venue-books__market-logo"
								alt=""
							/>
						) : null}
						<span className="all-odds-venue-label">{col.label}</span>
					</span>
				</th>
			))}
		</tr>
	);
}

export interface AllOddsMatrixTableProps {
	markets: AllOddsMarket[];
	loading?: boolean;
	error?: string | null;
}

export function AllOddsMatrixTable({ markets, loading = false, error = null }: AllOddsMatrixTableProps) {
	const [search, setSearch] = useState("");
	const [sport, setSport] = useState<SportFilter>("all");
	const [includeFees, setIncludeFees] = useState(true);
	const [page, setPage] = useState(0);
	const [expandedMore, setExpandedMore] = useState<Record<string, boolean>>({});
	const isMobile = useMedia("(max-width: 1100px)");
	const { formatPrice } = useOddsDisplay();
	const formatProbDisplay = useCallback((p: number) => formatPrice(p), [formatPrice]);

	const allGroups = useMemo(
		() => buildAllOddsGroups(markets.filter((m) => !isMlbGameSlug(m.game))),
		[markets],
	);

	const filteredGroups = useMemo(() => {
		const q = search.trim().toLowerCase();
		let list = allGroups.filter((g) => groupMatchesSport(g, sport));
		if (q) {
			list = list.filter((g) => {
				const allOutcomes = [
					...g.primaryOutcomes,
					...g.moreSections.flatMap((s) => s.outcomes),
				];
				const hay = [g.title, ...allOutcomes.map((o) => o.label), ...allOutcomes.map((o) => o.market.game ?? "")]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return hay.includes(q);
			});
		}
		return list;
	}, [allGroups, search, sport]);

	useEffect(() => {
		setPage(0);
	}, [search, sport]);

	const pageCount = Math.max(1, Math.ceil(filteredGroups.length / GROUPS_PER_PAGE));
	const safePage = Math.min(page, pageCount - 1);
	const pageGroups = filteredGroups.slice(
		safePage * GROUPS_PER_PAGE,
		safePage * GROUPS_PER_PAGE + GROUPS_PER_PAGE,
	);

	const toggleMore = (groupKey: string) => {
		setExpandedMore((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
	};

	return (
		<div
			className="all-odds-matrix esports-venue-books"
			style={
				{
					["--all-odds-venue-count" as string]: VENUE_COL_COUNT,
				} as CSSProperties
			}
		>
			<div className="all-odds-toolbar">
				<input
					className="all-odds-search"
					placeholder="Search markets…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search markets"
				/>
				<select
					className="all-odds-sport-select"
					value={sport}
					onChange={(e) => setSport(e.target.value as SportFilter)}
					aria-label="Sport filter"
				>
					<option value="all">All sports</option>
					<option value="esports">Esports</option>
					<option value="soccer">Soccer</option>
				</select>
				<OddsDisplaySelect variant="inline" className="all-odds-sport-select" />
				<div className="all-odds-fees-toggle" role="group" aria-label="Fee display">
					<button
						type="button"
						className={`all-odds-fees-toggle__btn${includeFees ? " all-odds-fees-toggle__btn--active" : ""}`}
						onClick={() => setIncludeFees(true)}
						aria-pressed={includeFees}
						aria-label="With fees"
					>
						{isMobile ? "Fees" : "With Fees"}
					</button>
					<button
						type="button"
						className={`all-odds-fees-toggle__btn${!includeFees ? " all-odds-fees-toggle__btn--active" : ""}`}
						onClick={() => setIncludeFees(false)}
						aria-pressed={!includeFees}
						aria-label="Without fees"
					>
						{isMobile ? "Raw" : "Without Fees"}
					</button>
				</div>
			</div>

			{pageGroups.length === 0 ? (
				<div
					className={`all-odds-empty${
						!loading && markets.length === 0 && error ? " all-odds-empty--error" : ""
					}`}
				>
					{loading && markets.length === 0
						? "Loading matched markets…"
						: !loading && markets.length === 0 && error
							? error
							: "No markets match this filter."}
				</div>
			) : (
				<div className="all-odds-scroll-shell">
					<div className="all-odds-group-list">
						{pageGroups.map((group) => (
							<GroupCard
								key={group.groupKey}
								group={group}
								isMobile={isMobile}
								includeFees={includeFees}
								formatProbDisplay={formatProbDisplay}
								moreOpen={expandedMore[group.groupKey] ?? false}
								onToggleMore={() => toggleMore(group.groupKey)}
							/>
						))}
					</div>
				</div>
			)}

			{filteredGroups.length > GROUPS_PER_PAGE && (
				<div className="all-odds-pagination">
					<button
						type="button"
						disabled={safePage <= 0}
						onClick={() => setPage((p) => Math.max(0, p - 1))}
					>
						Previous
					</button>
					<span>
						Page {safePage + 1} of {pageCount}
					</span>
					<button
						type="button"
						disabled={safePage >= pageCount - 1}
						onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
					>
						Next
					</button>
				</div>
			)}
		</div>
	);
}

function formatGroupStartLabel(group: AllOddsGroup, isMobile: boolean): string | null {
	if (group.kind !== "fixture" || !group.eventStartAt) return null;
	const date = normalizeEventDateInput(group.eventStartAt);
	if (!date) return null;
	return formatEventStartDisplay(date, { compact: isMobile });
}

function ExpandToggleRow({
	open,
	onToggle,
	isMobile,
}: {
	open: boolean;
	onToggle: () => void;
	isMobile: boolean;
}) {
	return (
		<tr className="all-odds-more-toggle-row">
			<th scope="row" colSpan={VENUE_COL_COUNT + 1}>
				<button
					type="button"
					className="all-odds-more-toggle"
					onClick={onToggle}
					aria-expanded={open}
				>
					<span
						className={`all-odds-more-caret ${open ? "all-odds-more-caret--open" : ""}`}
						aria-hidden="true"
					>
						›
					</span>
					{open ? "Less" : "More"}
				</button>
			</th>
		</tr>
	);
}

function GroupCard({
	group,
	isMobile,
	includeFees,
	formatProbDisplay,
	moreOpen,
	onToggleMore,
}: {
	group: AllOddsGroup;
	isMobile: boolean;
	includeFees: boolean;
	formatProbDisplay: (p: number) => string;
	moreOpen: boolean;
	onToggleMore: () => void;
}) {
	const mappings = group.teamMappings;
	const overflowOutcomes = group.moreSections.flatMap((section) => section.outcomes);
	const hasMore = overflowOutcomes.length > 0;
	const startLabel = formatGroupStartLabel(group, isMobile);
	const displayTitle = isMobile ? abbreviateFixtureTitle(group.title, mappings) : group.title;

	const bodyRows = (
		<>
			{group.primaryOutcomes.map((row) => (
				<OutcomeRow
					key={outcomeRowKey(row)}
					row={row}
					mappings={mappings}
					isMobile={isMobile}
					includeFees={includeFees}
					formatProbDisplay={formatProbDisplay}
				/>
			))}
			{hasMore && !moreOpen ? (
				<ExpandToggleRow open={false} onToggle={onToggleMore} isMobile={isMobile} />
			) : null}
			{moreOpen
				? overflowOutcomes.map((row) => (
						<OutcomeRow
							key={outcomeRowKey(row)}
							row={row}
							mappings={mappings}
							isMobile={isMobile}
							includeFees={includeFees}
							formatProbDisplay={formatProbDisplay}
						/>
					))
				: null}
			{hasMore && moreOpen ? (
				<ExpandToggleRow open={true} onToggle={onToggleMore} isMobile={isMobile} />
			) : null}
		</>
	);

	return (
		<section className="all-odds-group-card">
			<h2 className="all-odds-group-card__title" title={group.title} aria-label={group.title}>
				{displayTitle}
				{startLabel ? (
					<span className="all-odds-group-card__start">{startLabel}</span>
				) : null}
			</h2>
			<div className="all-odds-group-scroll-x">
				<table className="all-odds-table esports-venue-books__table">
					<AllOddsColGroup />
					<thead>
						<VenueHeaderRow isMobile={isMobile} />
					</thead>
					<tbody>{bodyRows}</tbody>
				</table>
			</div>
		</section>
	);
}

function OutcomeRow({
	row,
	mappings,
	isMobile,
	includeFees,
	formatProbDisplay,
	indented = false,
}: {
	row: AllOddsOutcomeRow;
	mappings: Parameters<typeof allOddsOutcomeDisplayLabel>[1];
	isMobile: boolean;
	includeFees: boolean;
	formatProbDisplay: (p: number) => string;
	indented?: boolean;
}) {
	const label = allOddsOutcomeDisplayLabel(row.label, mappings, isMobile, {
		marketType: row.market.marketType,
		logoUrl: row.logoUrl,
	});
	const bestVenueIdx = indicesAtBestAsk(row.venueCells, (c) => displayAskProb(c, includeFees));
	const href = tradeHref(row);

	return (
		<tr className="all-odds-outcome-row">
			<th
				scope="row"
				aria-label={row.label}
				className={`all-odds-outcome-label esports-venue-books__td--label ${indented ? "all-odds-outcome-label--indented" : ""}`}
			>
				<span className="esports-venue-books__label-row all-odds-outcome-label-inner">
					{row.logoUrl ? (
						<img className="all-odds-team-logo" src={row.logoUrl} alt="" loading="lazy" />
					) : null}
					<span>{label}</span>
				</span>
			</th>
			{row.venueCells.map((cell, cellIdx) => (
				<OddsCell
					key={cell.id}
					cell={cell}
					cellIdx={cellIdx}
					includeFees={includeFees}
					bestVenueIdx={bestVenueIdx}
					href={href}
					formatProbDisplay={formatProbDisplay}
				/>
			))}
		</tr>
	);
}

function OddsCell({
	cell,
	cellIdx,
	includeFees,
	bestVenueIdx,
	href,
	formatProbDisplay,
}: {
	cell: AllOddsOutcomeRow["venueCells"][number];
	cellIdx: number;
	includeFees: boolean;
	bestVenueIdx: Set<number>;
	href: string | null;
	formatProbDisplay: (p: number) => string;
}) {
	const displayProb = displayAskProb(cell, includeFees);
	const display = formatAskCell(cell.linked, displayProb, cell.status, cell.id, formatProbDisplay);
	const className = askCellClass(
		cell.linked,
		displayProb,
		cell.status,
		bestVenueIdx.has(cellIdx) && displayProb != null,
		cell.id,
	);

	const content = <span className="esports-venue-books__num-cell">{display}</span>;

	if (!href || display === "—") {
		return <td className={`${className} all-odds-odds-cell`}>{content}</td>;
	}

	return (
		<td className={`${className} all-odds-odds-cell`}>
			<Link className="all-odds-odds-link" to={href} title="Open trading page">
				{content}
			</Link>
		</td>
	);
}
