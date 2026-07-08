import { Menu } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useTradersRanked } from "@/features/trading/hooks/useTradersRanked";
import { useTradersBigBets } from "@/features/trading/hooks/useTradersBigBets";
import { useTradersHotStreaks } from "@/features/trading/hooks/useTradersHotStreaks";
import { useTradersBiggestWins } from "@/features/trading/hooks/useTradersBiggestWins";
import { useTradersBiggestLosses } from "@/features/trading/hooks/useTradersBiggestLosses";
import { useTradersTopLosers } from "@/features/trading/hooks/useTradersTopLosers";
import { useTradersNewWhales } from "@/features/trading/hooks/useTradersNewWhales";
import { useTradersComboLeaderboard } from "@/features/trading/hooks/useTradersComboLeaderboard";
import {
	useTradersBiggestComboWins,
	useTradersLiveCombos,
} from "@/features/trading/hooks/useTradersBestCombos";
import type {
	BigBetRow,
	ClosedLotRow,
	ComboHighlightRow,
	ComboLeaderboardEntry,
	ComboLeaderboardType,
	HotStreakRow,
	LiveComboRow,
	NewWhaleRow,
	TraderLeaderboardEntry,
	TraderMetric,
	TraderSportFilter,
	TraderWindow,
} from "@/services/api/whaleTrackerService";

import OddsFormatMenu from "@/components/OddsFormatMenu/OddsFormatMenu";

import { TraderAvatar } from "./TraderAvatar";
import { ComboTicket } from "./ComboTicket";
import { useOddsLabel } from "./useOddsLabel";
import {
	usePrefetchSiblingCombos,
	usePrefetchTraderProfile,
	usePrefetchVisibleProfiles,
} from "./prefetch";
import {
	betSideLabel,
	cleanMarketTitle,
	formatMatchup,
	formatPnl,
	formatRelativeTime,
	formatReturnPct,
	formatUsdAbbrev,
	formatWinRate,
	resolveDisplayName,
} from "./format";
import "./Traders.scss";

const SPORT_OPTIONS: { value: TraderSportFilter; label: string }[] = [
	{ value: "all", label: "All Sports" },
	{ value: "soccer", label: "Soccer" },
	{ value: "football", label: "Football" },
	{ value: "basketball", label: "Basketball" },
	{ value: "baseball", label: "Baseball" },
	{ value: "hockey", label: "Hockey" },
	{ value: "tennis", label: "Tennis" },
	{ value: "mma", label: "MMA" },
	{ value: "golf", label: "Golf" },
	{ value: "cricket", label: "Cricket" },
	{ value: "esports_cs", label: "Counter-Strike" },
	{ value: "esports_valorant", label: "Valorant" },
	{ value: "esports_lol", label: "League of Legends" },
	{ value: "esports_dota", label: "Dota 2" },
];

// Window tabs: full labels on desktop, single letters on mobile (D · W · M · All).
const WINDOW_OPTIONS: {
	value: TraderWindow;
	short: string;
	long: string;
}[] = [
	{ value: "today", short: "D", long: "Today" },
	{ value: "week", short: "W", long: "Weekly" },
	{ value: "month", short: "M", long: "Monthly" },
	{ value: "all", short: "All", long: "All Time" },
];

const PAGE_SIZE = 20;
const FETCH_LIMIT = 50;

type LensKey =
	| "traders"
	| "bigBets"
	| "hotStreaks"
	| "newWhales"
	| "comboTraders"
	| "bestCombos"
	| "biggestLosers"
	| "biggestLosses";

interface LensMeta {
	key: LensKey;
	label: string;
	windowAware: boolean;
}

const LENSES: LensMeta[] = [
	{ key: "traders", label: "Traders", windowAware: true },
	{ key: "bigBets", label: "Big Bets", windowAware: true },
	{ key: "newWhales", label: "New Whales", windowAware: false },
	{ key: "comboTraders", label: "Combo Traders", windowAware: true },
	{ key: "bestCombos", label: "Combos", windowAware: true },
	{ key: "hotStreaks", label: "Hot Streaks", windowAware: false },
	// Two distinct loser boards: "Biggest Losers" ranks TRADERS by worst
	// realised PnL; "Biggest Losses" ranks individual lost bets.
	{ key: "biggestLosers", label: "Biggest Losers", windowAware: true },
	{ key: "biggestLosses", label: "Biggest Losses", windowAware: true },
];

type BetStatus = "live" | "won";
type BetSort = "size" | "return";
type WhaleSort = TraderMetric | "age";

const COMBO_TYPE_BY_METRIC: Record<TraderMetric, ComboLeaderboardType> = {
	pnl: "combo-top-winners",
	roi: "combo-top-roi",
	volume: "combo-biggest-bettors",
};

export default function Traders() {
	const [sport, setSport] = useState<TraderSportFilter>("all");
	const [window, setWindow] = useState<TraderWindow>("all");
	const [lensKey, setLensKey] = useState<LensKey>("traders");
	const [metric, setMetric] = useState<TraderMetric>("pnl");
	const [whaleSort, setWhaleSort] = useState<WhaleSort>("volume");
	const [betStatus, setBetStatus] = useState<BetStatus>("live");
	const [betSort, setBetSort] = useState<BetSort>("size");
	const [page, setPage] = useState(0);
	const lens = LENSES.find((l) => l.key === lensKey) ?? LENSES[0];

	useEffect(() => {
		setPage(0);
	}, [sport, window, lensKey, metric, whaleSort, betStatus, betSort]);

	// ---- data ----
	const rankedQuery = useTradersRanked({
		metric,
		sport,
		window,
		category: "trader",
		limit: FETCH_LIMIT,
		enabled: lensKey === "traders",
	});
	const bigBetsQuery = useTradersBigBets({
		sport,
		window,
		limit: FETCH_LIMIT,
		minSizeUsd: 1000,
		enabled: lensKey === "bigBets" && betStatus === "live",
	});
	const biggestWinsQuery = useTradersBiggestWins({
		sport,
		window,
		limit: FETCH_LIMIT,
		enabled: lensKey === "bigBets" && betStatus === "won",
	});
	const hotStreaksQuery = useTradersHotStreaks({
		sport,
		limit: FETCH_LIMIT,
		minStreak: 3,
		enabled: lensKey === "hotStreaks",
	});
	const newWhalesQuery = useTradersNewWhales({
		sport,
		limit: FETCH_LIMIT,
		enabled: lensKey === "newWhales",
	});
	const comboLeaderboardQuery = useTradersComboLeaderboard({
		type: COMBO_TYPE_BY_METRIC[metric],
		sport,
		window,
		limit: FETCH_LIMIT,
		enabled: lensKey === "comboTraders",
	});
	const liveCombosQuery = useTradersLiveCombos({
		sport,
		limit: FETCH_LIMIT,
		enabled: lensKey === "bestCombos" && betStatus === "live",
	});
	const comboWinsQuery = useTradersBiggestComboWins({
		sport,
		window,
		limit: FETCH_LIMIT,
		enabled: lensKey === "bestCombos" && betStatus === "won",
	});
	const topLosersQuery = useTradersTopLosers({
		sport,
		window,
		limit: FETCH_LIMIT,
		enabled: lensKey === "biggestLosers",
	});
	const biggestLossesQuery = useTradersBiggestLosses({
		sport,
		window,
		limit: FETCH_LIMIT,
		enabled: lensKey === "biggestLosses",
	});

	const activeQuery =
		lensKey === "traders"
			? rankedQuery
			: lensKey === "bigBets"
				? betStatus === "live"
					? bigBetsQuery
					: biggestWinsQuery
				: lensKey === "hotStreaks"
					? hotStreaksQuery
					: lensKey === "newWhales"
						? newWhalesQuery
						: lensKey === "comboTraders"
							? comboLeaderboardQuery
							: lensKey === "bestCombos"
								? betStatus === "live"
									? liveCombosQuery
									: comboWinsQuery
								: lensKey === "biggestLosers"
									? topLosersQuery
									: biggestLossesQuery;

	usePrefetchSiblingCombos({
		sport,
		window,
		lensKey,
		metric,
		ready: !!activeQuery.data,
	});

	useEffect(() => {
		void import("./TraderProfile");
	}, []);

	const visibleWallets = useMemo(() => {
		const entries =
			(activeQuery.data as { entries?: Array<{ wallet: string }> } | undefined)
				?.entries ?? [];
		const start = page * PAGE_SIZE;
		return [...new Set(entries.slice(start, start + PAGE_SIZE).map((e) => e.wallet))];
	}, [activeQuery.data, page]);
	usePrefetchVisibleProfiles(visibleWallets);

	const isPending = activeQuery.isFetching;
	const showBetControls = lensKey === "bigBets" || lensKey === "bestCombos";
	// Live views show current state — the window doesn't apply, but the
	// control stays rendered (disabled) so toggling Live/Won never reflows.
	const windowDisabled = showBetControls && betStatus === "live";
	// Lenses not defined by a time window (Hot Streaks, New Whales) show no
	// window control at all — a dead control is pure noise.
	const showWindowControl = lens.windowAware;

	// Time window + odds live on the left of the board filter row; view/metric
	// toggles sit on the right — one line, no stacked pill rows.
	const filterLeft = {
		showWindow: showWindowControl,
		window,
		onWindowChange: setWindow,
		windowDisabled,
	};

	return (
		<div className="traders-page">
			<div className="traders-container">
				<header className="traders-hero">
					<h1 className="traders-hero-title">Follow the smart money.</h1>
					<p className="traders-hero-sub">
						Real PnL for every wallet betting sports on Polymarket. Find the sharps to copy
						and the losers to fade.
					</p>
				</header>

				<div className="traders-sport-rail" role="tablist" aria-label="Sport filter">
					{SPORT_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							role="tab"
							aria-selected={sport === opt.value}
							className={`traders-sport-chip${sport === opt.value ? " is-active" : ""}`}
							onClick={() => setSport(opt.value)}
						>
							{opt.label}
						</button>
					))}
				</div>

				<div className="traders-lens-bar" role="tablist" aria-label="Leaderboard">
					{LENSES.map((l) => (
						<button
							key={l.key}
							type="button"
							role="tab"
							aria-selected={lensKey === l.key}
							className={`traders-lens-tab${lensKey === l.key ? " is-active" : ""}`}
							onClick={() => setLensKey(l.key)}
						>
							{l.label}
						</button>
					))}
				</div>

				<LensBody
					lensKey={lensKey}
					loading={isPending}
					page={page}
					onPageChange={setPage}
					filterLeft={filterLeft}
					showBetControls={showBetControls}
					betStatus={betStatus}
					onBetStatusChange={setBetStatus}
					betSort={betSort}
					onBetSortChange={setBetSort}
					metric={metric}
					onMetricChange={setMetric}
					whaleSort={whaleSort}
					onWhaleSortChange={setWhaleSort}
					ranked={rankedQuery.data?.entries}
					rankedError={rankedQuery.isError}
					bigBets={bigBetsQuery.data?.entries}
					bigBetsError={bigBetsQuery.isError}
					wins={biggestWinsQuery.data?.entries}
					winsError={biggestWinsQuery.isError}
					streaks={hotStreaksQuery.data?.entries}
					streaksError={hotStreaksQuery.isError}
					newWhales={newWhalesQuery.data?.entries}
					newWhalesError={newWhalesQuery.isError}
					comboTraders={comboLeaderboardQuery.data?.entries}
					comboTradersError={comboLeaderboardQuery.isError}
					liveCombos={liveCombosQuery.data?.entries}
					liveCombosError={liveCombosQuery.isError}
					comboWins={comboWinsQuery.data?.entries}
					comboWinsError={comboWinsQuery.isError}
					topLosers={topLosersQuery.data?.entries}
					topLosersError={topLosersQuery.isError}
					losses={biggestLossesQuery.data?.entries}
					lossesError={biggestLossesQuery.isError}
				/>
			</div>
		</div>
	);
}

// ---------- dispatcher ----------

interface FilterLeftProps {
	showWindow: boolean;
	window: TraderWindow;
	onWindowChange: (w: TraderWindow) => void;
	windowDisabled: boolean;
}

interface LensBodyProps {
	lensKey: LensKey;
	page: number;
	onPageChange: (p: number) => void;
	filterLeft: FilterLeftProps;
	showBetControls: boolean;
	metric: TraderMetric;
	onMetricChange: (m: TraderMetric) => void;
	whaleSort: WhaleSort;
	onWhaleSortChange: (s: WhaleSort) => void;
	betStatus: BetStatus;
	onBetStatusChange: (s: BetStatus) => void;
	betSort: BetSort;
	onBetSortChange: (s: BetSort) => void;
	ranked: TraderLeaderboardEntry[] | undefined;
	rankedError: boolean;
	bigBets: BigBetRow[] | undefined;
	bigBetsError: boolean;
	wins: ClosedLotRow[] | undefined;
	winsError: boolean;
	streaks: HotStreakRow[] | undefined;
	streaksError: boolean;
	newWhales: NewWhaleRow[] | undefined;
	newWhalesError: boolean;
	comboTraders: ComboLeaderboardEntry[] | undefined;
	comboTradersError: boolean;
	liveCombos: LiveComboRow[] | undefined;
	liveCombosError: boolean;
	comboWins: ComboHighlightRow[] | undefined;
	comboWinsError: boolean;
	topLosers: TraderLeaderboardEntry[] | undefined;
	topLosersError: boolean;
	losses: ClosedLotRow[] | undefined;
	lossesError: boolean;
	/** A fetch is in flight for the active lens — show skeletons. */
	loading: boolean;
}

function LensBody(props: LensBodyProps) {
	const {
		lensKey,
		page,
		onPageChange,
		filterLeft,
		showBetControls,
		metric,
		onMetricChange,
		whaleSort,
		onWhaleSortChange,
		betStatus,
		onBetStatusChange,
		betSort,
		onBetSortChange,
		loading,
	} = props;

	const betRight = showBetControls
		? {
				betStatus,
				onBetStatusChange,
				betSort,
				onBetSortChange,
			}
		: undefined;

	if (lensKey === "traders") {
		return (
			<PagedList
				full={props.ranked}
				isError={props.rankedError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={
					<BoardFilterBar
						{...filterLeft}
						metricLabels={["PnL", "Return", "Volume"]}
						metric={metric}
						onMetricSelect={onMetricChange}
					/>
				}
				renderRow={(e) => <TraderRow key={e.wallet} entry={e} metric={metric} />}
			/>
		);
	}
	if (lensKey === "bigBets") {
		if (betStatus === "live") {
			const rows = sortLiveBets(
				aggregateLiveBets(withKnownMarkets(props.bigBets)),
				betSort,
			);
			return (
				<PagedList
					full={rows}
					isError={props.bigBetsError}
					page={page}
					onPageChange={onPageChange}
					loading={loading}
					header={<BoardFilterBar {...filterLeft} betControls={betRight} />}
					renderRow={(e) => <LiveBetRow key={e.betId} entry={e} />}
				/>
			);
		}
		const rows = sortWonBets(aggregateWonBets(withKnownMarkets(props.wins)), betSort);
		return (
			<PagedList
				full={rows}
				isError={props.winsError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={<BoardFilterBar {...filterLeft} betControls={betRight} />}
				renderRow={(e, i) => (
					<WonBetRow key={`${e.wallet}:${e.conditionId}:${e.outcome}:${i}`} entry={e} />
				)}
			/>
		);
	}
	if (lensKey === "hotStreaks") {
		return (
			<PagedList
				full={props.streaks}
				isError={props.streaksError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={<BoardFilterBar {...filterLeft} />}
				renderRow={(e) => <StreakRow key={e.wallet} entry={e} />}
			/>
		);
	}
	if (lensKey === "newWhales") {
		return (
			<PagedList
				full={sortNewWhales(props.newWhales, whaleSort)}
				isError={props.newWhalesError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={
					<BoardFilterBar
						{...filterLeft}
						metricLabels={["PnL", "Return", "Volume"]}
						metric={whaleSort === "age" ? null : whaleSort}
						onMetricSelect={(m) => onWhaleSortChange(m)}
						extraSort={{
							label: "Age",
							active: whaleSort === "age",
							onSelect: () => onWhaleSortChange("age"),
						}}
					/>
				}
				renderRow={(e) => (
					<NewWhaleRowView key={e.wallet} entry={e} whaleSort={whaleSort} />
				)}
			/>
		);
	}
	if (lensKey === "comboTraders") {
		return (
			<PagedList
				full={props.comboTraders}
				isError={props.comboTradersError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={
					<BoardFilterBar
						{...filterLeft}
						metricLabels={["PnL", "Return", "Staked"]}
						metric={metric}
						onMetricSelect={onMetricChange}
					/>
				}
				renderRow={(e) => (
					<ComboTraderRow key={e.wallet} entry={e} metric={metric} />
				)}
			/>
		);
	}
	if (lensKey === "bestCombos") {
		if (betStatus === "live") {
			const rows = sortLiveCombos(withKnownTitles(props.liveCombos), betSort);
			return (
				<PagedList
					full={rows}
					isError={props.liveCombosError}
					page={page}
					onPageChange={onPageChange}
					loading={loading}
					header={<BoardFilterBar {...filterLeft} betControls={betRight} />}
					tickets
					renderRow={(e) => <LiveComboRowView key={e.positionId} entry={e} />}
				/>
			);
		}
		const rows = sortWonCombos(withKnownTitles(props.comboWins), betSort);
		return (
			<PagedList
				full={rows}
				isError={props.comboWinsError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={<BoardFilterBar {...filterLeft} betControls={betRight} />}
				tickets
				renderRow={(e) => <WonComboRow key={e.positionId} entry={e} />}
			/>
		);
	}
	if (lensKey === "biggestLosers") {
		return (
			<PagedList
				full={props.topLosers}
				isError={props.topLosersError}
				page={page}
				onPageChange={onPageChange}
				loading={loading}
				header={
					<BoardFilterBar
						{...filterLeft}
						metricLabels={["PnL", "Return", "Volume"]}
						metric="pnl"
					/>
				}
				renderRow={(e) => <TraderRow key={e.wallet} entry={e} metric="pnl" />}
			/>
		);
	}
	const rows = aggregateWonBets(withKnownMarkets(props.losses));
	return (
		<PagedList
			full={rows}
			isError={props.lossesError}
			page={page}
			onPageChange={onPageChange}
			header={<BoardFilterBar {...filterLeft} betControls={betRight} />}
			renderRow={(e, i) => (
				<LostBetRow key={`${e.wallet}:${e.conditionId}:${e.outcome}:${i}`} entry={e} />
			)}
		/>
	);
}

// ---------- row shaping: aggregation, unknown-market guard, sorts ----------

/**
 * Whales build one position across many fills. Collapse rows with the same
 * wallet + market + side into a single entry: summed dollars, volume-weighted
 * price. The leaderboard is about positions, not fills.
 */
function aggregateLiveBets(rows: BigBetRow[] | undefined): BigBetRow[] | undefined {
	if (!rows) return undefined;
	const byKey = new Map<string, BigBetRow>();
	for (const r of rows) {
		const key = `${r.wallet}:${r.conditionId}:${r.outcome}`;
		const prev = byKey.get(key);
		if (!prev) {
			byKey.set(key, { ...r });
			continue;
		}
		const cost = prev.costUsd + r.costUsd;
		const shares = prev.shares + r.shares;
		byKey.set(key, {
			...prev,
			costUsd: cost,
			shares,
			// Volume-weighted average entry.
			price: shares > 0 ? cost / shares : prev.price,
			// Most recent fill = when the position was last added to.
			placedAt: r.placedAt > prev.placedAt ? r.placedAt : prev.placedAt,
		});
	}
	return [...byKey.values()].sort((a, b) => b.costUsd - a.costUsd);
}

function aggregateWonBets(rows: ClosedLotRow[] | undefined): ClosedLotRow[] | undefined {
	if (!rows) return undefined;
	const byKey = new Map<string, ClosedLotRow>();
	for (const r of rows) {
		const key = `${r.wallet}:${r.conditionId}:${r.outcome}`;
		const prev = byKey.get(key);
		if (!prev) {
			byKey.set(key, { ...r });
			continue;
		}
		const costBasisUsd = prev.costBasisUsd + r.costBasisUsd;
		const shares = prev.shares + r.shares;
		byKey.set(key, {
			...prev,
			pnlUsd: prev.pnlUsd + r.pnlUsd,
			costBasisUsd,
			proceedsUsd: prev.proceedsUsd + r.proceedsUsd,
			shares,
			buyPrice: shares > 0 ? costBasisUsd / shares : prev.buyPrice,
			// Most recent lot close = when the position finished settling.
			closedAt: r.closedAt > prev.closedAt ? r.closedAt : prev.closedAt,
		});
	}
	return [...byKey.values()].sort(
		(a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd),
	);
}

/** Never surface a combo we can't name. */
function withKnownTitles<T extends { comboTitle?: string }>(
	rows: T[] | undefined,
): T[] | undefined {
	if (!rows) return undefined;
	return rows.filter(
		(r) => r.comboTitle && !/unknown/i.test(r.comboTitle),
	);
}

/** Same guard for single bets — a bet we can't describe is a bet we don't show. */
function withKnownMarkets<T extends { marketTitle?: string }>(
	rows: T[] | undefined,
): T[] | undefined {
	if (!rows) return undefined;
	return rows.filter((r) => {
		const t = cleanMarketTitle(r.marketTitle);
		return t.length > 0 && !/unknown/i.test(t);
	});
}

function sortLiveBets(rows: BigBetRow[] | undefined, sort: BetSort): BigBetRow[] | undefined {
	if (!rows) return undefined;
	if (sort === "size") return rows;
	return [...rows].sort((a, b) => a.price - b.price);
}

function sortWonBets(rows: ClosedLotRow[] | undefined, sort: BetSort): ClosedLotRow[] | undefined {
	if (!rows) return undefined;
	if (sort === "size") return rows;
	return [...rows].sort(
		(a, b) => returnRatio(b.pnlUsd, b.costBasisUsd) - returnRatio(a.pnlUsd, a.costBasisUsd),
	);
}

function sortLiveCombos(
	rows: LiveComboRow[] | undefined,
	sort: BetSort,
): LiveComboRow[] | undefined {
	if (!rows) return undefined;
	if (sort === "size") return rows;
	return [...rows].sort(
		(a, b) =>
			multipleOf(b.sharesBalance, b.totalCostUsdc) -
			multipleOf(a.sharesBalance, a.totalCostUsdc),
	);
}

function sortWonCombos(
	rows: ComboHighlightRow[] | undefined,
	sort: BetSort,
): ComboHighlightRow[] | undefined {
	if (!rows) return undefined;
	if (sort === "size") return rows;
	return [...rows].sort(
		(a, b) => returnRatio(b.pnlUsd, b.totalCostUsdc) - returnRatio(a.pnlUsd, a.totalCostUsdc),
	);
}

function sortNewWhales(
	rows: NewWhaleRow[] | undefined,
	sort: WhaleSort,
): NewWhaleRow[] | undefined {
	if (!rows) return undefined;
	switch (sort) {
		case "pnl":
			return [...rows].sort((a, b) => b.pnlUsd - a.pnlUsd);
		case "roi":
			return [...rows].sort((a, b) => b.roiPct - a.roiPct);
		case "age":
			return [...rows].sort((a, b) => a.accountAgeDays - b.accountAgeDays);
		default:
			return rows; // endpoint order = volume desc
	}
}

function returnRatio(pnl: number, cost: number): number {
	return cost > 0 ? pnl / cost : 0;
}

function multipleOf(payout: number, cost: number): number {
	return cost > 0 ? payout / cost : 0;
}

// ---------- generic paged list ----------

function PagedList<T>({
	full,
	isError,
	page,
	onPageChange,
	renderRow,
	header,
	loading = false,
	tickets = false,
}: {
	full: T[] | undefined;
	isError: boolean;
	page: number;
	onPageChange: (p: number) => void;
	renderRow: (entry: T, index: number) => React.ReactNode;
	header?: React.ReactNode;
	loading?: boolean;
	tickets?: boolean;
}) {
	const total = full?.length ?? 0;
	const start = page * PAGE_SIZE;
	const rows = full?.slice(start, start + PAGE_SIZE) ?? [];
	const showSkeletons = loading || !full;
	return (
		<>
			<section className="traders-board">
				{header}
				<div className={`traders-board-body${tickets ? " is-tickets" : ""}`}>
					{isError && !loading ? (
						<div className="traders-board-state">Couldn’t load. Try again in a moment.</div>
					) : showSkeletons ? (
						<SkeletonRows rows={10} />
					) : rows.length === 0 ? (
						<div className="traders-board-state">
							Nothing here yet. Try another sport or window.
						</div>
					) : (
						rows.map((e, i) => renderRow(e, start + i))
					)}
				</div>
			</section>
			{!showSkeletons && <PageControls page={page} total={total} onChange={onPageChange} />}
		</>
	);
}

// ---------- rows: Traders ----------

function TraderRow({
	entry,
	metric,
}: {
	entry: TraderLeaderboardEntry;
	metric: TraderMetric;
}) {
	const prefetch = usePrefetchTraderProfile();
	const name = resolveDisplayName(entry);
	const winRate = entry.winRateWilsonLower ?? entry.winRate;
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<div className="traders-item-main">
				<span className="traders-item-name">{name}</span>
				<span className="traders-item-sub">
					{entry.bets.toLocaleString()} bets · {formatWinRate(winRate)} won
				</span>
			</div>
			<MetricCells
				pnlUsd={entry.pnlUsd}
				roiPct={entry.roiPct}
				volumeUsd={entry.volumeUsd}
				metric={metric}
			/>
		</Link>
	);
}

function MetricCells({
	pnlUsd,
	roiPct,
	volumeUsd,
	metric,
}: {
	pnlUsd: number;
	roiPct: number;
	volumeUsd: number;
	metric: TraderMetric | null;
}) {
	return (
		<>
			<div
				className={`traders-item-cell ${toneOf(pnlUsd)}${metric === "pnl" ? " is-active" : ""}`}
			>
				<span className="traders-item-cell-value">{formatPnl(pnlUsd)}</span>
			</div>
			<div
				className={`traders-item-cell ${toneOf(roiPct)}${metric === "roi" ? " is-active" : ""}`}
			>
				<span className="traders-item-cell-value">{formatReturnPct(roiPct)}</span>
			</div>
			<div className={`traders-item-cell${metric === "volume" ? " is-active" : ""}`}>
				<span className="traders-item-cell-value">{formatUsdAbbrev(volumeUsd)}</span>
			</div>
		</>
	);
}

// ---------- rows: Big Bets ----------

function LiveBetRow({ entry }: { entry: BigBetRow }) {
	const prefetch = usePrefetchTraderProfile();
	const oddsLabel = useOddsLabel();
	const name = resolveDisplayName(entry);
	const matchup = formatMatchup(entry.teams);
	// Each share pays $1 if the bet hits.
	const payout = entry.shares;
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item is-bet"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<span className="traders-item-market" title={entry.marketTitle ?? ""}>
				{cleanMarketTitle(entry.marketTitle)}
				<SideTag entry={entry} />
			</span>
			<span className="traders-item-sub">
				{name}
				{matchup ? ` · ${matchup}` : ""} · {formatRelativeTime(entry.placedAt)}
			</span>
			<div className="traders-item-stack">
				<span className="traders-item-stack-value is-big">
					<span className="traders-item-odds">{oddsLabel(entry.price)}</span>
					{formatUsdAbbrev(entry.costUsd)}
					<span className="traders-item-arrow"> → </span>
					<span className="is-win">{formatUsdAbbrev(payout)}</span>
				</span>
			</div>
		</Link>
	);
}

function WonBetRow({ entry }: { entry: ClosedLotRow }) {
	const prefetch = usePrefetchTraderProfile();
	const oddsLabel = useOddsLabel();
	const name = resolveDisplayName(entry);
	const matchup = formatMatchup(entry.teams);
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item is-bet"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<span className="traders-item-market" title={entry.marketTitle ?? ""}>
				{cleanMarketTitle(entry.marketTitle)}
				<SideTag entry={entry} />
			</span>
			<span className="traders-item-sub">
				{name}
				{matchup ? ` · ${matchup}` : ""} · {formatRelativeTime(entry.closedAt)}
			</span>
			<div className="traders-item-stack">
				<span className="traders-item-stack-value is-big">
					<span className="traders-item-odds">{oddsLabel(entry.buyPrice)}</span>
					{formatUsdAbbrev(entry.costBasisUsd)}
					<span className="traders-item-arrow"> → </span>
					<span className="is-win">{formatUsdAbbrev(entry.proceedsUsd)}</span>
				</span>
			</div>
		</Link>
	);
}

function LostBetRow({ entry }: { entry: ClosedLotRow }) {
	const prefetch = usePrefetchTraderProfile();
	const oddsLabel = useOddsLabel();
	const name = resolveDisplayName(entry);
	const matchup = formatMatchup(entry.teams);
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item is-bet"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<span className="traders-item-market" title={entry.marketTitle ?? ""}>
				{cleanMarketTitle(entry.marketTitle)}
				<SideTag entry={entry} />
			</span>
			<span className="traders-item-sub">
				{name}
				{matchup ? ` · ${matchup}` : ""} · {formatRelativeTime(entry.closedAt)}
			</span>
			<div className="traders-item-stack">
				<span className="traders-item-stack-value is-big">
					<span className="traders-item-odds">{oddsLabel(entry.buyPrice)}</span>
					{formatUsdAbbrev(entry.costBasisUsd)}
					<span className="traders-item-arrow"> → </span>
					<span className="is-loss">{formatPnl(entry.pnlUsd)}</span>
				</span>
			</div>
		</Link>
	);
}

// ---------- rows: Hot Streaks ----------

function StreakRow({ entry }: { entry: HotStreakRow }) {
	const prefetch = usePrefetchTraderProfile();
	const name = resolveDisplayName(entry);
	const pnlTone = toneOf(entry.totalSportsPnlUsd);
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item is-bet"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<div className="traders-item-main">
				<span className="traders-item-name">{name}</span>
				<span className="traders-item-sub">
					Best {entry.longestWinStreak} · {formatWinRate(entry.sportsWinRate)} won ·{" "}
					<span className={pnlTone}>{formatPnl(entry.totalSportsPnlUsd)}</span>
				</span>
			</div>
			<div className="traders-item-stack">
				<span className="traders-item-stack-value is-streak">{entry.currentWinStreak}</span>
				<span className="traders-item-stack-label">win streak</span>
			</div>
		</Link>
	);
}

// ---------- rows: New Whales ----------

function NewWhaleRowView({
	entry,
	whaleSort,
}: {
	entry: NewWhaleRow;
	whaleSort: WhaleSort;
}) {
	const prefetch = usePrefetchTraderProfile();
	const name = resolveDisplayName(entry);
	// Age now has its own column, so the sub-line just carries the trade count.
	const ageCell = `${Math.max(1, entry.accountAgeDays)}d`;
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item is-whales"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<div className="traders-item-main">
				<span className="traders-item-name">{name}</span>
				<span className="traders-item-sub">{entry.bets.toLocaleString()} trades</span>
			</div>
			<MetricCells
				pnlUsd={entry.pnlUsd}
				roiPct={entry.roiPct}
				volumeUsd={entry.volumeUsd}
				metric={whaleSort === "age" ? null : whaleSort}
			/>
			<div className={`traders-item-cell${whaleSort === "age" ? " is-active" : ""}`}>
				<span className="traders-item-cell-value">{ageCell}</span>
			</div>
		</Link>
	);
}

// ---------- rows: Combo Traders ----------

function ComboTraderRow({
	entry,
	metric,
}: {
	entry: ComboLeaderboardEntry;
	metric: TraderMetric;
}) {
	const prefetch = usePrefetchTraderProfile();
	const name = resolveDisplayName(entry);
	return (
		<Link
			to={`/traders/${entry.wallet}`}
			className="traders-item"
			onMouseEnter={() => prefetch(entry.wallet)}
			onFocus={() => prefetch(entry.wallet)}
		>
			<TraderAvatar wallet={entry.wallet} displayName={name} imageUrl={entry.profileImageUrl} size={36} />
			<div className="traders-item-main">
				<span className="traders-item-name">{name}</span>
				<span className="traders-item-sub">
					{entry.totalCombos.toLocaleString()} combos · {formatWinRate(entry.winRate)} hit rate
				</span>
			</div>
			<MetricCells
				pnlUsd={entry.totalPnlUsd}
				roiPct={entry.roiPct}
				volumeUsd={entry.totalCostUsd}
				metric={metric}
			/>
		</Link>
	);
}

// ---------- rows: Best Combos ----------

function LiveComboRowView({ entry }: { entry: LiveComboRow }) {
	return (
		<ComboTicket
			wallet={entry.wallet}
			name={resolveDisplayName(entry)}
			imageUrl={entry.profileImageUrl}
			comboTitle={entry.comboTitle}
			legs={entry.legs}
			costUsd={entry.totalCostUsdc}
			payoutUsd={entry.sharesBalance}
			variant="live"
			timeLabel={
				entry.firstEnteredAt ? `placed ${formatRelativeTime(entry.firstEnteredAt)}` : ""
			}
		/>
	);
}

function WonComboRow({ entry }: { entry: ComboHighlightRow }) {
	return (
		<ComboTicket
			wallet={entry.wallet}
			name={resolveDisplayName(entry)}
			imageUrl={entry.profileImageUrl}
			comboTitle={entry.comboTitle}
			legs={entry.legs}
			costUsd={entry.totalCostUsdc}
			payoutUsd={entry.realizedPayoutUsdc}
			variant="won"
			timeLabel={
				entry.resolvedAt ? `settled ${formatRelativeTime(entry.resolvedAt)}` : ""
			}
		/>
	);
}

// ---------- shared ----------

/**
 * Compact colored side pill following the market statement. Label comes
 * from the shared `betSideLabel` rule: named outcome when it matches the
 * title, Over/Under on O/U markets, Yes/No otherwise.
 */
function SideTag({
	entry,
}: {
	entry: { outcome: "yes" | "no"; outcomeLabel?: string; marketTitle?: string };
}) {
	return (
		<span
			className={`traders-side-tag ${entry.outcome === "yes" ? "is-yes" : "is-no"}`}
		>
			{betSideLabel(entry)}
		</span>
	);
}

const METRIC_KEYS: TraderMetric[] = ["pnl", "roi", "volume"];

/**
 * One filter row inside the board: time window + odds on the left, view/metric
 * toggles on the right. Metric labels double as sort controls on desktop; on
 * mobile they collapse into a themed menu matching the odds picker.
 */
function BoardFilterBar({
	showWindow,
	window,
	onWindowChange,
	windowDisabled,
	metricLabels,
	metric,
	onMetricSelect,
	extraSort,
	betControls,
}: FilterLeftProps & {
	metricLabels?: [string, string, string];
	metric?: TraderMetric | null;
	onMetricSelect?: (m: TraderMetric) => void;
	extraSort?: { label: string; active: boolean; onSelect: () => void };
	betControls?: {
		betStatus: BetStatus;
		onBetStatusChange: (s: BetStatus) => void;
		betSort: BetSort;
		onBetSortChange: (s: BetSort) => void;
	};
}) {
	const sortable = !!onMetricSelect;

	const sortOptions = useMemo(() => {
		if (!metricLabels) return [];
		const base = metricLabels.map((label, i) => ({ value: METRIC_KEYS[i], label }));
		// Extra sort (e.g. New Whales "Age") trails the metrics — matches its
		// column position on the right of the row.
		return extraSort ? [...base, { value: "__extra__", label: extraSort.label }] : base;
	}, [metricLabels, extraSort]);

	const activeSortValue = extraSort?.active ? "__extra__" : (metric ?? METRIC_KEYS[0]);
	const activeSortLabel =
		sortOptions.find((o) => o.value === activeSortValue)?.label ??
		sortOptions[0]?.label ??
		"";

	return (
		<div className={`traders-board-filter${sortable ? " is-sortable" : ""}`}>
			<div className="traders-board-filter-left">
				<OddsFormatMenu
						className="traders-odds-format"
						iconSize={16}
						anchor={{ to: "bottom start", gap: 6 }}
					/>
				{showWindow && (
					<div
						className={`traders-head-seg is-window${windowDisabled ? " is-disabled" : ""}`}
						role="tablist"
						aria-label="Time window"
					>
						{WINDOW_OPTIONS.map((w) => (
							<button
								key={w.value}
								type="button"
								role="tab"
								aria-selected={window === w.value}
								className={`traders-head-tab${window === w.value ? " is-active" : ""}`}
								onClick={() => onWindowChange(w.value)}
								disabled={windowDisabled}
							>
								<span className="traders-window-label is-long">{w.long}</span>
								<span className="traders-window-label is-short">{w.short}</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className="traders-board-filter-right">
				{betControls && (
					<>
						<div className="traders-head-seg" role="tablist" aria-label="Bet status">
							<button
								type="button"
								role="tab"
								aria-selected={betControls.betStatus === "live"}
								className={`traders-head-tab${
									betControls.betStatus === "live" ? " is-active" : ""
								}`}
								onClick={() => betControls.onBetStatusChange("live")}
							>
								Live
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={betControls.betStatus === "won"}
								className={`traders-head-tab${
									betControls.betStatus === "won" ? " is-active" : ""
								}`}
								onClick={() => betControls.onBetStatusChange("won")}
							>
								Won
							</button>
						</div>
						{/* Desktop: quick Amount/Return tabs. Mobile: they collapse
						    into the same themed dropdown the metric sort uses, so the
						    bet controls stop colliding on a narrow screen. */}
						<div
							className="traders-head-seg is-betsort-tabs"
							role="tablist"
							aria-label="Sort"
						>
							<button
								type="button"
								role="tab"
								aria-selected={betControls.betSort === "size"}
								className={`traders-head-tab${
									betControls.betSort === "size" ? " is-active" : ""
								}`}
								onClick={() => betControls.onBetSortChange("size")}
							>
								Amount
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={betControls.betSort === "return"}
								className={`traders-head-tab${
									betControls.betSort === "return" ? " is-active" : ""
								}`}
								onClick={() => betControls.onBetSortChange("return")}
							>
								Return
							</button>
						</div>
						<TradersSortMenu
							label={betControls.betSort === "size" ? "Amount" : "Return"}
							options={[
								{ value: "size", label: "Amount" },
								{ value: "return", label: "Return" },
							]}
							value={betControls.betSort}
							onChange={(v) => betControls.onBetSortChange(v as BetSort)}
						/>
					</>
				)}

				{metricLabels && (
					<>
						{metricLabels.map((label, i) =>
							sortable ? (
								<button
									key={label}
									type="button"
									className={`traders-filter-metric${
										metric === METRIC_KEYS[i] ? " is-active" : ""
									}`}
									aria-pressed={metric === METRIC_KEYS[i]}
									onClick={() => onMetricSelect!(METRIC_KEYS[i])}
								>
									{label}
								</button>
							) : (
								<span
									key={label}
									className={`traders-filter-metric${
										metric === METRIC_KEYS[i] ? " is-active" : ""
									}`}
								>
									{label}
								</span>
							),
						)}
						{/* Extra sort trails the metrics as its own aligned column
						    (New Whales "Age"). */}
						{extraSort && (
							<button
								type="button"
								className={`traders-filter-metric${extraSort.active ? " is-active" : ""}`}
								aria-pressed={extraSort.active}
								onClick={extraSort.onSelect}
							>
								{extraSort.label}
							</button>
						)}
						{sortable && (
							<TradersSortMenu
								label={activeSortLabel}
								options={sortOptions}
								value={activeSortValue}
								onChange={(v) => {
									if (v === "__extra__") extraSort?.onSelect();
									else onMetricSelect!(v as TraderMetric);
								}}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}

/** Mobile metric picker — same visual language as OddsFormatMenu. */
function TradersSortMenu({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: { value: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Menu as="div" className="traders-sort-menu">
			<Menu.Button type="button" className="traders-sort-menu__trigger" aria-label="Sort by">
				{label}
			</Menu.Button>
			<Menu.Items
				className="traders-sort-menu__items"
				modal={false}
				anchor={{ to: "bottom end", gap: 6 }}
			>
				{options.map((o) => (
					<Menu.Item key={o.value}>
						{({ focus }) => (
							<button
								type="button"
								className={
									"traders-sort-menu__item" +
									(focus ? " traders-sort-menu__item--focus" : "") +
									(value === o.value ? " traders-sort-menu__item--selected" : "")
								}
								onClick={() => onChange(o.value)}
							>
								{o.label}
							</button>
						)}
					</Menu.Item>
				))}
			</Menu.Items>
		</Menu>
	);
}

function toneOf(n: number): string {
	return n > 0 ? "is-positive" : n < 0 ? "is-negative" : "";
}

function SkeletonRows({ rows }: { rows: number }) {
	return (
		<>
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="traders-item is-skeleton">
					<span
						className="traders-skeleton"
						style={{ width: 36, height: 36, borderRadius: 999 }}
					/>
					<div className="traders-item-main">
						<span className="traders-skeleton" style={{ width: 180, height: 14 }} />
						<span
							className="traders-skeleton"
							style={{ width: 240, height: 11, marginTop: 6 }}
						/>
					</div>
					<span className="traders-skeleton" style={{ width: 90, height: 16 }} />
				</div>
			))}
		</>
	);
}

// ---------- pagination ----------

function PageControls({
	page,
	total,
	onChange,
}: {
	page: number;
	total: number;
	onChange: (p: number) => void;
}) {
	if (total <= PAGE_SIZE) return null;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const start = page * PAGE_SIZE + 1;
	const end = Math.min((page + 1) * PAGE_SIZE, total);

	const go = (p: number) => {
		if (p < 0 || p >= totalPages || p === page) return;
		onChange(p);
		if (typeof window !== "undefined") {
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	return (
		<nav className="traders-pagination" aria-label="Leaderboard pagination">
			<button
				type="button"
				className="traders-pagination-btn"
				onClick={() => go(page - 1)}
				disabled={page === 0}
			>
				<span aria-hidden="true">←</span> Prev
			</button>
			<div className="traders-pagination-numbers">
				{Array.from({ length: totalPages }, (_, n) => (
					<button
						key={n}
						type="button"
						className={`traders-pagination-num${n === page ? " is-active" : ""}`}
						aria-current={n === page ? "page" : undefined}
						onClick={() => go(n)}
					>
						{n + 1}
					</button>
				))}
			</div>
			<button
				type="button"
				className="traders-pagination-btn"
				onClick={() => go(page + 1)}
				disabled={page >= totalPages - 1}
			>
				Next <span aria-hidden="true">→</span>
			</button>
			<span className="traders-pagination-status">
				{start}–{end} of {total}
			</span>
		</nav>
	);
}
