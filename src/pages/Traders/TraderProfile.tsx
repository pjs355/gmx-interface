import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import {
	Area,
	AreaChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { useTraderProfile } from "@/features/trading/hooks/useTraderProfile";
import {
	useTraderClosedLots,
	useTraderComboPositions,
	useTraderPnlHistory,
	useTraderStats,
} from "@/features/trading/hooks/useTraderPositions";
import type {
	TraderProfile as TraderProfileData,
	TraderPerSportStats,
	TraderOpenPosition,
	TraderSportFilter,
	TraderWindow,
	ClosedLotRow,
	ComboPositionRow,
} from "@/services/api/whaleTrackerService";

import { useCopyActiveSubscription } from "@/features/trading/hooks/useCopyTrading";
import OddsFormatMenu from "@/components/OddsFormatMenu/OddsFormatMenu";
import { TraderAvatar } from "./TraderAvatar";
import { ComboTicket } from "./ComboTicket";
import { useOddsLabel } from "./useOddsLabel";
import {
	betSideLabel,
	cleanMarketTitle,
	formatPnl,
	formatRelativeTime,
	formatUsdAbbrev,
	formatWinRate,
	resolveDisplayName,
} from "./format";
import "./TraderProfile.scss";
// Load the copy-trade button + modal styles eagerly. They live in Copy.scss,
// which is otherwise pulled in only by the lazy modal chunk — so without this
// the "Copy Trader" button renders unstyled (grey) until the first tap loads
// the chunk, then snaps to the full-width white pill mid-interaction.
import "@/pages/Copy/Copy.scss";

export default function TraderProfile() {
	const { address } = useParams<{ address: string }>();
	const [sport, setSport] = useState<TraderSportFilter>("all");
	// One time horizon for the whole page — drives the PnL chart AND the
	// track record below it.
	const [window, setWindow] = useState<TraderWindow>("all");
	const profileQuery = useTraderProfile(address);
	// Fired in parallel with the profile — they only depend on the address,
	// so the bets section never waits on the profile round trip. (The hooks
	// self-disable on an invalid address.)
	const lotsQuery = useTraderClosedLots(address);
	const combosQuery = useTraderComboPositions(address);

	if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
		return (
			<div className="trader-profile-page">
				<div className="trader-profile-container">
					<p className="trader-profile-state is-error">Invalid wallet address.</p>
					<Link to="/traders" className="trader-profile-back">
						← All traders
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="trader-profile-page">
			<div className="trader-profile-container">
				<Link to="/traders" className="trader-profile-back">
					← All traders
				</Link>

				{profileQuery.isLoading && (
					<div className="trader-profile-state">Loading trader…</div>
				)}

				{profileQuery.isError && (
					<div className="trader-profile-state is-error">
						Couldn’t load this profile. The wallet may not have any sports activity yet.
					</div>
				)}

				{profileQuery.data && (
					<>
						<ProfileHeader profile={profileQuery.data} />
						<ProfileSportRail
							perSport={profileQuery.data.perSport}
							sport={sport}
							onChange={setSport}
						/>
						<TrackRecordSection
							address={address}
							sport={sport}
							window={window}
							onWindowChange={setWindow}
						/>
						<PnlChartSection address={address} sport={sport} window={window} />
						<BetsSection
							profile={profileQuery.data}
							lotsQuery={lotsQuery}
							combosQuery={combosQuery}
							sport={sport}
						/>
					</>
				)}
			</div>
		</div>
	);
}

// ---- header ----

/**
 * Setup modal split into its own chunk: it pulls the Polymarket CLOB
 * trading session (clob-client-v2, wallet clients) which does not belong
 * in the profile route's critical path. Loaded on first Copy click.
 */
const importCopySetupModal = () => import("@/pages/Copy/CopySetupModal");
const CopySetupModalLazy = lazy(() =>
	importCopySetupModal().then((m) => ({ default: m.CopySetupModal })),
);

/**
 * Copy trading entry point. Shown only for copy-eligible leaders: sports
 * activity present and not flagged as a market maker or wash trader. The
 * server re-checks eligibility on create; this is display gating only.
 */
function CopyLeaderAction({ profile, name }: { profile: TraderProfileData; name: string }) {
	const { authenticated } = usePrivy();
	const [setupOpen, setSetupOpen] = useState(false);
	const [setupMounted, setSetupMounted] = useState(false);
	const activeQuery = useCopyActiveSubscription({ enabled: authenticated });

	const openSetup = useCallback(() => {
		setSetupMounted(true);
		setSetupOpen(true);
	}, []);

	// Growth funnel: signed-out visitors still see "Copy Trader". Tapping it
	// opens sign-up, and once they're in we drop them straight into copy setup
	// (→ deposit → copy) instead of making them hunt for the button again.
	const wantsCopyAfterLogin = useRef(false);
	const { login } = useLogin({
		onComplete: () => {
			if (wantsCopyAfterLogin.current) {
				wantsCopyAfterLogin.current = false;
				openSetup();
			}
		},
	});

	// Warm the modal chunk up front so the first tap opens instantly, rather
	// than racing a lazy load that repaints the button and janks scroll-lock.
	useEffect(() => {
		void importCopySetupModal();
	}, []);

	// Eligibility gates on the LEADER, not the viewer — a signed-out visitor
	// should still see the button so the tap can prompt sign-up.
	const hasSportsActivity = (profile.perSport ?? []).some((s) => s.bets > 0);
	const eligible = !profile.isMarketMaker && !profile.isWashTrader && hasSportsActivity;
	if (!eligible) return null;

	const active = activeQuery.data;

	let inner: React.ReactNode;
	if (active && active.leaderWallet.toLowerCase() === profile.wallet.toLowerCase()) {
		inner = (
			<Link to={`/copy?subscription=${active.id}`} className="copy-trade-active-link">
				Copying · View
			</Link>
		);
	} else if (active) {
		// One leader at a time in v1: point at the live copy instead.
		inner = (
			<Link to="/copy" className="copy-trade-active-link">
				Copy active elsewhere
			</Link>
		);
	} else {
		inner = (
			<button
				type="button"
				className="copy-trade-button"
				onClick={() => {
					if (!authenticated) {
						wantsCopyAfterLogin.current = true;
						login();
						return;
					}
					openSetup();
				}}
			>
				Copy Trader
			</button>
		);
	}

	return (
		<>
			<div className="copy-leader-action">{inner}</div>
			{setupMounted && (
				<Suspense fallback={null}>
					<CopySetupModalLazy
						leader={profile}
						leaderName={name}
						isVisible={setupOpen}
						setIsVisible={setSetupOpen}
					/>
				</Suspense>
			)}
		</>
	);
}

function ProfileHeader({ profile }: { profile: TraderProfileData }) {
	const lastActive = formatRelativeTime(profile.lastSportsBetAt);
	const name = resolveDisplayName(profile);

	return (
		<header className="trader-profile-header">
			<div className="trader-profile-identity">
				<TraderAvatar
					wallet={profile.wallet}
					displayName={name}
					imageUrl={profile.profileImageUrl}
					size={64}
				/>
				<div className="trader-profile-identity-body">
					<h1 className="trader-profile-name">{name}</h1>
					<div className="trader-profile-meta">
						<span className="trader-profile-meta-item">Last trade {lastActive}</span>
						<a
							className="trader-profile-chip"
							href={`https://polymarket.com/profile/${profile.wallet}`}
							target="_blank"
							rel="noreferrer noopener"
						>
							Polymarket ↗
						</a>
					</div>
					{(profile.isMarketMaker || profile.isWashTrader) && (
						<div className="trader-profile-warnings">
							{profile.isMarketMaker && (
								<span className="trader-profile-warning">Flagged: market maker</span>
							)}
							{profile.isWashTrader && (
								<span className="trader-profile-warning">Flagged: wash trader</span>
							)}
						</div>
					)}
				</div>
			</div>
			<CopyLeaderAction profile={profile} name={name} />
		</header>
	);
}

// ---- sport filter rail ----

/**
 * Sports this trader has actually bet, as filter chips. Scopes the PnL
 * chart, the track-record stats, and the trades list below it.
 */
function ProfileSportRail({
	perSport,
	sport,
	onChange,
}: {
	perSport: TraderPerSportStats[];
	sport: TraderSportFilter;
	onChange: (s: TraderSportFilter) => void;
}) {
	const sports = useMemo(
		() =>
			[...perSport]
				.filter((s) => s.bets > 0)
				.sort((a, b) => b.volumeUsd - a.volumeUsd)
				.map((s) => s.sport),
		[perSport],
	);
	if (sports.length === 0) return null;
	return (
		<div className="trader-profile-sport-rail" role="tablist" aria-label="Sport filter">
			<button
				type="button"
				role="tab"
				aria-selected={sport === "all"}
				className={`trader-profile-sport-chip${sport === "all" ? " is-active" : ""}`}
				onClick={() => onChange("all")}
			>
				All Sports
			</button>
			{sports.map((s) => (
				<button
					key={s}
					type="button"
					role="tab"
					aria-selected={sport === s}
					className={`trader-profile-sport-chip${sport === s ? " is-active" : ""}`}
					onClick={() => onChange(s as TraderSportFilter)}
				>
					{prettySport(s)}
				</button>
			))}
		</div>
	);
}

// ---- PnL chart ----

// Short/long labels mirror the general Traders page window control:
// full words on desktop, D/W/M/All on phones.
const CHART_WINDOWS: { value: TraderWindow; short: string; long: string }[] = [
	{ value: "today", short: "D", long: "Today" },
	{ value: "week", short: "W", long: "Weekly" },
	{ value: "month", short: "M", long: "Monthly" },
	{ value: "all", short: "All", long: "All Time" },
];

const CHART_POS = "#38d39f";
const CHART_NEG = "#ff5e6c";

function windowStartMs(window: TraderWindow): number | null {
	const now = Date.now();
	switch (window) {
		case "today":
			return now - 24 * 60 * 60 * 1000;
		case "week":
			return now - 7 * 24 * 60 * 60 * 1000;
		case "month":
			return now - 30 * 24 * 60 * 60 * 1000;
		default:
			return null;
	}
}

function PnlChartTooltip({
	active,
	payload,
	hourly,
}: {
	active?: boolean;
	payload?: Array<{ payload: { ts: number; pnl: number } }>;
	hourly: boolean;
}) {
	if (!active || !payload || payload.length === 0) return null;
	const point = payload[0].payload;
	const d = new Date(point.ts);
	const when = hourly
		? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
		: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	const tone = point.pnl > 0 ? "is-positive" : point.pnl < 0 ? "is-negative" : "";
	return (
		<div className="trader-profile-chart-tooltip">
			<span className="trader-profile-chart-tooltip-date">{when}</span>
			<span className={`trader-profile-chart-tooltip-value ${tone}`}>
				{formatPnl(point.pnl)}
			</span>
		</div>
	);
}

function formatAxisUsd(v: number): string {
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	if (abs >= 1000) {
		const k = abs / 1000;
		return `${sign}$${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
	}
	return `${sign}$${Math.round(abs)}`;
}

function PnlChartSection({
	address,
	sport,
	window,
}: {
	address: string;
	sport: TraderSportFilter;
	window: TraderWindow;
}) {
	const historyQuery = useTraderPnlHistory(address, window, sport);
	const hourly = window === "today";

	const data = useMemo(() => {
		const points = historyQuery.data?.points ?? [];
		const rows = points.map((p) => ({ ts: new Date(p.t).getTime(), pnl: p.pnlUsd }));
		if (rows.length === 0) return rows;
		// Anchor the curve: windows start from $0 at the window edge, and
		// the last value carries to "now" so the line reaches the right edge.
		const start = windowStartMs(window);
		if (start !== null && rows[0].ts > start) {
			rows.unshift({ ts: start, pnl: 0 });
		}
		const last = rows[rows.length - 1];
		const now = Date.now();
		if (last.ts < now) rows.push({ ts: now, pnl: last.pnl });
		return rows;
	}, [historyQuery.data, window]);

	const finalPnl = data.length > 0 ? data[data.length - 1].pnl : 0;
	const color = finalPnl < 0 ? CHART_NEG : CHART_POS;
	// Only draw the $0 baseline when the curve actually crosses it.
	const crossesZero = useMemo(
		() => data.some((d) => d.pnl > 0) && data.some((d) => d.pnl < 0),
		[data],
	);

	return (
		<section className="trader-profile-section trader-profile-chart-section">
			<div className="trader-profile-section-header">
				<h2 className="trader-profile-section-heading">PnL over time</h2>
			</div>
			<div className="trader-profile-chart">
				{historyQuery.isLoading || historyQuery.isFetching ? (
					<div className="trader-profile-chart-skeleton" aria-hidden="true">
						<span className="trader-profile-skeleton" />
					</div>
				) : data.length === 0 ? (
					<div className="trader-profile-state">
						No settled trades in this window yet.
					</div>
				) : (
					// Retail-standard PnL chart: no axes clutter, no gridlines —
					// just the line, its gradient, a dotted $0 baseline when the
					// curve crosses it, sparse time labels, and a scrub tooltip.
					<ResponsiveContainer width="100%" height={220}>
						<AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
							<defs>
								<linearGradient id="traderPnlFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor={color} stopOpacity={0.28} />
									<stop offset="100%" stopColor={color} stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis
								dataKey="ts"
								type="number"
								domain={["dataMin", "dataMax"]}
								scale="time"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
								tickFormatter={(ts: number) =>
									hourly
										? new Date(ts).toLocaleTimeString("en-US", {
												hour: "numeric",
											})
										: new Date(ts).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
											})
								}
								tickCount={4}
								minTickGap={72}
								height={22}
							/>
							<YAxis
									domain={["auto", "auto"]}
									axisLine={false}
									tickLine={false}
									width={48}
									tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
									tickFormatter={(v: number) => formatAxisUsd(v)}
									tickCount={4}
								/>
							{crossesZero && (
								<ReferenceLine
									y={0}
									stroke="rgba(255,255,255,0.25)"
									strokeDasharray="3 4"
								/>
							)}
							<Tooltip
								content={<PnlChartTooltip hourly={hourly} />}
								cursor={{ stroke: "rgba(255,255,255,0.25)", strokeDasharray: "3 3" }}
							/>
							<Area
								type="monotone"
								dataKey="pnl"
								stroke={color}
								strokeWidth={2.5}
								fill="url(#traderPnlFill)"
								dot={false}
								activeDot={{ r: 4, fill: color, stroke: "#000", strokeWidth: 2 }}
								animationDuration={400}
								animationEasing="ease-out"
							/>
						</AreaChart>
					</ResponsiveContainer>
				)}
			</div>
		</section>
	);
}

// ---- track record (sport × window, from the stats endpoint) ----

/**
 * Numbers come from the `/stats` endpoint, computed server-side from the
 * same collections that power the PnL chart and trade history — so the
 * headline PnL always reconciles with what's visible below. Realized and
 * unrealized are separate cards, never summed.
 */
function TrackRecordSection({
	address,
	sport,
	window,
	onWindowChange,
}: {
	address: string;
	sport: TraderSportFilter;
	window: TraderWindow;
	onWindowChange: (w: TraderWindow) => void;
}) {
	const statsQuery = useTraderStats(address, window, sport);
	const stats = statsQuery.data;
	const pnl = stats?.realizedPnlUsd ?? 0;
	const pnlTone = pnl > 0 ? "is-positive" : pnl < 0 ? "is-negative" : "";
	const roi = stats?.roiPct ?? 0;
	const roiTone = roi > 0 ? "is-positive" : roi < 0 ? "is-negative" : "";
	const loading = statsQuery.isLoading || statsQuery.isFetching;

	return (
		<section className="trader-profile-section">
			<div className="trader-profile-section-header">
				<h2 className="trader-profile-section-heading">
					{sport === "all" ? "Track record" : `${prettySport(sport)} track record`}
				</h2>
				{/* Odds format + one window control for the whole page — the
				    window drives these stats AND the PnL chart below. Quiet
				    D/W/M/All tabs, matching the general Traders page. */}
				<div className="trader-profile-window-controls">
					<OddsFormatMenu
						className="trader-profile-odds-format"
						iconSize={16}
						anchor={{ to: "bottom end", gap: 6 }}
					/>
					<div
						className="trader-profile-window-seg"
						role="tablist"
						aria-label="Time horizon"
					>
						{CHART_WINDOWS.map((w) => (
							<button
								key={w.value}
								type="button"
								role="tab"
								aria-selected={window === w.value}
								className={`trader-profile-window-tab${window === w.value ? " is-active" : ""}`}
								onClick={() => onWindowChange(w.value)}
							>
								<span className="trader-profile-window-label is-long">{w.long}</span>
								<span className="trader-profile-window-label is-short">{w.short}</span>
							</button>
						))}
					</div>
				</div>
			</div>
			<div className="trader-profile-track-grid">
				{loading ? (
					<>
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className={`trader-profile-stat${i === 0 ? " is-big" : ""}`}>
								<span
									className="trader-profile-skeleton"
									style={{ width: 56, height: 10 }}
								/>
								<span
									className="trader-profile-skeleton"
									style={{ width: i === 0 ? 140 : 72, height: i === 0 ? 30 : 22 }}
								/>
							</div>
						))}
					</>
				) : (
					<>
						<StatCard label="Realized PnL" value={formatPnl(pnl)} tone={pnlTone} big />
						<StatCard label="ROI" value={formatRoiPct(roi)} tone={roiTone} />
						<StatCard label="Win rate" value={formatWinRate(stats?.winRate ?? 0)} />
						<StatCard label="Trades" value={(stats?.trades ?? 0).toLocaleString()} />
						<StatCard label="Volume" value={formatUsdAbbrev(stats?.volumeUsd ?? 0)} />
					</>
				)}
			</div>
		</section>
	);
}

function formatRoiPct(roi: number): string {
	if (!Number.isFinite(roi)) return "0%";
	const pct = roi * 100;
	const sign = pct > 0 ? "+" : "";
	return `${sign}${pct.toFixed(1)}%`;
}

function StatCard({
	label,
	value,
	tone,
	big,
}: {
	label: string;
	value: string;
	tone?: string;
	big?: boolean;
}) {
	return (
		<div className={`trader-profile-stat${big ? " is-big" : ""}`}>
			<span className="trader-profile-stat-label">{label}</span>
			<span className={`trader-profile-stat-value ${tone ?? ""}`}>{value}</span>
		</div>
	);
}

// ---- bets (straight + combos, live + past) ----

type BetKind = "straight" | "combos";
type BetPhase = "live" | "past";

// Sub-$1 straight positions are dust from partial redemptions — noise.
// Combos keep tiny stakes: a $0.50 ticket at 200x is a real bet.
const STRAIGHT_DUST_USD = 1;
const COMBO_DUST_USD = 0.01;

function hasKnownTitle(title?: string | null): boolean {
	const t = cleanMarketTitle(title);
	return t.length > 0 && !/unknown/i.test(t);
}

/**
 * A combo counts toward a sport when the combo itself classified to it
 * OR any leg's underlying market did — one soccer leg in a 5-leg parlay
 * makes it a soccer combo for filtering purposes.
 */
function comboMatchesSport(c: ComboPositionRow, sport: TraderSportFilter): boolean {
	if (sport === "all") return true;
	if (c.sport === sport) return true;
	return (c.legSports ?? []).includes(sport);
}

function BetsSection({
	profile,
	lotsQuery,
	combosQuery,
	sport,
}: {
	profile: TraderProfileData;
	lotsQuery: ReturnType<typeof useTraderClosedLots>;
	combosQuery: ReturnType<typeof useTraderComboPositions>;
	sport: TraderSportFilter;
}) {
	const [kind, setKind] = useState<BetKind>("straight");
	const [phase, setPhase] = useState<BetPhase>("live");

	// Open positions ride along on the profile document — no extra request.
	const openPositions = (profile.currentOpenPositions ?? []).filter(
		(p) =>
			hasKnownTitle(p.marketTitle) &&
			p.costUsd >= STRAIGHT_DUST_USD &&
			(sport === "all" || p.sport === sport),
	);
	const closedLots = (lotsQuery.data?.pages ?? [])
		.flatMap((page) => page.entries)
		.filter(
			(l) =>
				hasKnownTitle(l.marketTitle) &&
				l.costBasisUsd >= STRAIGHT_DUST_USD &&
				(sport === "all" || l.sport === sport),
		);
	// Collapse repeat buys of the same market+side into one holding. Live folds
	// duplicates into a single total; past keeps the fills for the drop-down.
	const openHoldings = groupOpenPositions(openPositions);
	const closedLotGroups = groupClosedLots(closedLots);
	const combos = (combosQuery.data?.entries ?? []).filter(
		(c) =>
			c.comboTitle &&
			!/unknown/i.test(c.comboTitle) &&
			c.totalCostUsdc >= COMBO_DUST_USD &&
			comboMatchesSport(c, sport),
	);
	const liveCombos = combos.filter((c) => c.status === "OPEN" || c.status === "PARTIAL");
	const pastCombos = combos.filter(
		(c) => c.status === "RESOLVED_WIN" || c.status === "RESOLVED_LOSS",
	);

	// Live straight bets come from the already-loaded profile, so only the
	// lots/combos tabs can ever show a loading state.
	const activeLoading =
		kind === "straight"
			? phase === "live"
				? false
				: lotsQuery.isLoading
			: combosQuery.isLoading;

	return (
		<section className="trader-profile-section">
			<div className="trader-profile-section-header">
				<h2 className="trader-profile-section-heading">Trades</h2>
				<div className="trader-profile-seg-group">
					<div className="trader-profile-period-bar" role="tablist" aria-label="Bet type">
						{(["straight", "combos"] as BetKind[]).map((k) => (
							<button
								key={k}
								type="button"
								role="tab"
								aria-selected={kind === k}
								className={`trader-profile-period-tab${kind === k ? " is-active" : ""}`}
								onClick={() => setKind(k)}
							>
								{k === "straight" ? "Straight" : "Combos"}
							</button>
						))}
					</div>
					<div className="trader-profile-period-bar" role="tablist" aria-label="Bet phase">
						{(["live", "past"] as BetPhase[]).map((p) => (
							<button
								key={p}
								type="button"
								role="tab"
								aria-selected={phase === p}
								className={`trader-profile-period-tab${phase === p ? " is-active" : ""}`}
								onClick={() => setPhase(p)}
							>
								{p === "live" ? "Live" : "Past"}
							</button>
						))}
					</div>
				</div>
			</div>

			{activeLoading ? (
				<ProfileSkeletonList rows={6} />
			) : kind === "straight" && phase === "live" ? (
				openHoldings.length === 0 ? (
					<div className="trader-profile-state">No live trades.</div>
				) : (
					<>
						<MoneyLegend to="To win" />
						<div className="trader-profile-list">
							{openHoldings.map((p) => (
								<OpenPositionRow key={`${p.conditionId}:${p.outcome}`} pos={p} />
							))}
						</div>
					</>
				)
			) : kind === "straight" ? (
				closedLotGroups.length === 0 ? (
					<div className="trader-profile-state">No settled trades yet.</div>
				) : (
					<>
						<MoneyLegend to="Won" />
						<div className="trader-profile-list">
							{closedLotGroups.map((g) => (
								<ClosedLotGroupRow key={g.key} group={g} />
							))}
						</div>
						{lotsQuery.hasNextPage && (
							<button
								type="button"
								className="trader-profile-load-more"
								onClick={() => lotsQuery.fetchNextPage()}
								disabled={lotsQuery.isFetchingNextPage}
							>
								{lotsQuery.isFetchingNextPage ? "Loading…" : "Load more trades"}
							</button>
						)}
					</>
				)
			) : phase === "live" ? (
				liveCombos.length === 0 ? (
					<div className="trader-profile-state">No live combos.</div>
				) : (
					<div className="trader-profile-list">
						{liveCombos.map((c) => (
							<ComboPositionRowView key={c.positionId} combo={c} />
						))}
					</div>
				)
			) : pastCombos.length === 0 ? (
				<div className="trader-profile-state">No settled combos yet.</div>
			) : (
				<div className="trader-profile-list">
					{pastCombos.map((c) => (
						<ComboPositionRowView key={c.positionId} combo={c} />
					))}
				</div>
			)}
		</section>
	);
}

/**
 * The side pill, via the shared `betSideLabel` rule: named outcome when
 * it matches the title ("Sharks"), Over/Under on O/U markets, Yes/No
 * otherwise. Color always tracks the underlying yes/no side.
 */
function BetSideTag({
	outcome,
	outcomeLabel,
	marketTitle,
}: {
	outcome: "yes" | "no";
	outcomeLabel?: string;
	marketTitle?: string;
}) {
	return (
		<span
			className={`trader-profile-side-tag ${outcome === "yes" ? "is-yes" : "is-no"}`}
		>
			{betSideLabel({ outcome, outcomeLabel, marketTitle })}
		</span>
	);
}

/**
 * Bare "traded → won" figures. The labels live once in the list legend
 * (see BetsSection), so every row can give the market title full width.
 */
function MoneyPair({
	fromValue,
	toValue,
	toTone,
}: {
	fromValue: string;
	toValue: string;
	toTone: "is-positive" | "is-negative";
}) {
	return (
		<div className="trader-profile-money">
			<span className="trader-profile-money-value">{fromValue}</span>
			<span className="trader-profile-combo-arrow">→</span>
			<span className={`trader-profile-money-value ${toTone}`}>{toValue}</span>
		</div>
	);
}

/**
 * States what the two money figures mean, once, above the list — so each row
 * can spend its width on the market title instead of repeating the labels.
 */
function MoneyLegend({ to }: { to: string }) {
	return (
		<div className="trader-profile-money-legend">
			Traded <span className="trader-profile-combo-arrow">→</span> {to}
		</div>
	);
}

/** Pulsing placeholder rows — the unmistakable "this list is loading". */
function ProfileSkeletonList({ rows }: { rows: number }) {
	return (
		<div className="trader-profile-list" aria-hidden="true">
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="trader-profile-open-row">
					<div className="trader-profile-open-headline">
						<span
							className="trader-profile-skeleton"
							style={{ width: "70%", maxWidth: 260, height: 14 }}
						/>
					</div>
					<div className="trader-profile-open-footer">
						<span className="trader-profile-skeleton" style={{ width: 120, height: 11 }} />
						<span className="trader-profile-skeleton" style={{ width: 110, height: 15 }} />
					</div>
				</div>
			))}
		</div>
	);
}

/** "Jun 28", with the year when it isn't this year. */
function formatShortDate(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
	if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
	return d.toLocaleDateString("en-US", opts);
}

/** "5:31 pm May 17" — clock time then short date, for the fill history. */
function formatFillTime(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	const time = d
		.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
		.toLowerCase();
	return `${time} ${formatShortDate(iso)}`;
}

function OpenPositionRow({ pos }: { pos: TraderOpenPosition }) {
	const oddsLabel = useOddsLabel();
	// Each share pays $1 if the position resolves the bettor's way.
	const payout = pos.shares;
	return (
		<div className="trader-profile-open-row">
			<div className="trader-profile-open-headline">
				<span className="trader-profile-open-market" title={pos.marketTitle ?? ""}>
					{cleanMarketTitle(pos.marketTitle)}
				</span>
				<BetSideTag
					outcome={pos.outcome}
					outcomeLabel={pos.outcomeLabel}
					marketTitle={pos.marketTitle}
				/>
			</div>
			<div className="trader-profile-open-footer">
				<div className="trader-profile-open-meta">
					<span className="trader-profile-open-prices">in at {oddsLabel(pos.avgEntryPrice)}</span>
				</div>
				<MoneyPair
					fromValue={formatUsdAbbrev(pos.costUsd)}
					toValue={formatUsdAbbrev(payout)}
					toTone="is-positive"
				/>
			</div>
		</div>
	);
}

function ClosedLotRowView({ lot }: { lot: ClosedLotRow }) {
	const oddsLabel = useOddsLabel();
	const won = lot.pnlUsd > 0;
	// Sold on the market before resolution vs held to settlement — the
	// "did they cash out early?" signal.
	const sold = lot.closeSource === "polymarket_data_api";
	const closedOn = formatShortDate(lot.closedAt);
	const entry = oddsLabel(lot.buyPrice);
	const exit = sold ? oddsLabel(lot.sellPrice) : "";
	return (
		<div className="trader-profile-open-row">
			<div className="trader-profile-open-headline">
				<span className="trader-profile-open-market" title={lot.marketTitle ?? ""}>
					{cleanMarketTitle(lot.marketTitle)}
				</span>
				<BetSideTag
					outcome={lot.outcome}
					outcomeLabel={lot.outcomeLabel}
					marketTitle={lot.marketTitle}
				/>
			</div>
			<div className="trader-profile-open-footer">
				<div className="trader-profile-open-meta">
					{closedOn && <span>{closedOn}</span>}
					<span className={`trader-profile-exit-tag${sold ? " is-sold" : ""}`}>
						{sold ? "Sold" : won ? "Settled · Won" : "Settled · Lost"}
					</span>
					{entry && (
						<span className="trader-profile-open-prices">
							{sold && exit ? `${entry} → ${exit}` : `in at ${entry}`}
						</span>
					)}
				</div>
				<MoneyPair
					fromValue={formatUsdAbbrev(lot.costBasisUsd)}
					toValue={formatUsdAbbrev(lot.proceedsUsd)}
					toTone={won ? "is-positive" : "is-negative"}
				/>
			</div>
		</div>
	);
}

// ---- grouping: collapse repeat trades on the same market + side ----

interface LotEvent {
	kind: "buy" | "sell";
	amountUsd: number;
	price: number; // implied prob, fed to the odds formatter
	at?: string;
}

interface LotGroup {
	key: string;
	marketTitle?: string;
	outcome: "yes" | "no";
	outcomeLabel?: string;
	lots: ClosedLotRow[];
	totalCostUsd: number;
	totalProceedsUsd: number;
	totalPnlUsd: number;
	totalShares: number;
	avgBuyPrice: number;
	events: LotEvent[];
}

/**
 * Collapse the FIFO closed lots into one row per market + side. Ten buys of
 * "Cavs under 2.5" become a single position; the individual fills live in an
 * expandable history below it. Preserves first-seen order (already PnL/date
 * sorted from the API).
 */
function groupClosedLots(lots: ClosedLotRow[]): LotGroup[] {
	const byKey = new Map<string, LotGroup>();
	const order: string[] = [];
	for (const l of lots) {
		const key = `${l.conditionId}:${l.outcome}`;
		let g = byKey.get(key);
		if (!g) {
			g = {
				key,
				marketTitle: l.marketTitle,
				outcome: l.outcome,
				outcomeLabel: l.outcomeLabel,
				lots: [],
				totalCostUsd: 0,
				totalProceedsUsd: 0,
				totalPnlUsd: 0,
				totalShares: 0,
				avgBuyPrice: 0,
				events: [],
			};
			byKey.set(key, g);
			order.push(key);
		}
		g.lots.push(l);
		g.totalCostUsd += l.costBasisUsd;
		g.totalProceedsUsd += l.proceedsUsd;
		g.totalPnlUsd += l.pnlUsd;
		g.totalShares += l.shares;
		g.events.push({ kind: "buy", amountUsd: l.costBasisUsd, price: l.buyPrice, at: l.openedAt });
		// A settlement isn't a trade — only surface an actual on-market sell.
		if (l.closeSource === "polymarket_data_api") {
			g.events.push({
				kind: "sell",
				amountUsd: l.proceedsUsd,
				price: l.sellPrice,
				at: l.closedAt,
			});
		}
	}
	const groups = order.map((k) => byKey.get(k)!);
	for (const g of groups) {
		g.avgBuyPrice = g.totalShares > 0 ? g.totalCostUsd / g.totalShares : g.lots[0]?.buyPrice ?? 0;
		g.events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
	}
	return groups;
}

/** Same idea for live holdings: fold any repeats into one total position. */
function groupOpenPositions(positions: TraderOpenPosition[]): TraderOpenPosition[] {
	const byKey = new Map<string, TraderOpenPosition>();
	const order: string[] = [];
	for (const p of positions) {
		const key = `${p.conditionId}:${p.outcome}`;
		const g = byKey.get(key);
		if (!g) {
			byKey.set(key, { ...p });
			order.push(key);
		} else {
			g.shares += p.shares;
			g.costUsd += p.costUsd;
			g.currentValueUsd = (g.currentValueUsd ?? 0) + (p.currentValueUsd ?? 0);
			g.unrealizedPnlUsd = (g.unrealizedPnlUsd ?? 0) + (p.unrealizedPnlUsd ?? 0);
			g.avgEntryPrice = g.shares > 0 ? g.costUsd / g.shares : g.avgEntryPrice;
		}
	}
	return order.map((k) => byKey.get(k)!);
}

/**
 * One row per market+side. A single fill renders like a normal trade row; a
 * built-up position (multiple fills) shows the total and reveals the raw
 * buy/sell history — amount, price, date — on tap.
 */
function ClosedLotGroupRow({ group }: { group: LotGroup }) {
	const oddsLabel = useOddsLabel();
	const [open, setOpen] = useState(false);

	if (group.lots.length === 1) {
		return <ClosedLotRowView lot={group.lots[0]} />;
	}

	const won = group.totalPnlUsd > 0;
	return (
		<div className={`trader-profile-group${open ? " is-open" : ""}`}>
			<div
				className="trader-profile-open-row is-expandable"
				role="button"
				tabIndex={0}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setOpen((o) => !o);
					}
				}}
			>
				<div className="trader-profile-open-headline">
					<span className="trader-profile-open-market" title={group.marketTitle ?? ""}>
						{cleanMarketTitle(group.marketTitle)}
					</span>
					<BetSideTag
						outcome={group.outcome}
						outcomeLabel={group.outcomeLabel}
						marketTitle={group.marketTitle}
					/>
				</div>
				<div className="trader-profile-open-footer">
					<div className="trader-profile-open-meta">
						<span className="trader-profile-trade-count">
							{group.lots.length} trades
							<span
								className={`trader-profile-caret${open ? " is-open" : ""}`}
								aria-hidden="true"
							>
								▾
							</span>
						</span>
						<span className="trader-profile-open-prices">avg {oddsLabel(group.avgBuyPrice)}</span>
					</div>
					<MoneyPair
						fromValue={formatUsdAbbrev(group.totalCostUsd)}
						toValue={formatUsdAbbrev(group.totalProceedsUsd)}
						toTone={won ? "is-positive" : "is-negative"}
					/>
				</div>
			</div>
			{open && (
				<div className="trader-profile-fills">
					{group.events.map((e, i) => (
						<div key={i} className="trader-profile-fill">
							<span className={`trader-profile-fill-side is-${e.kind}`}>
								{e.kind === "buy" ? "Buy" : "Sell"}
							</span>
							<span className="trader-profile-fill-amount">
								{formatUsdAbbrev(e.amountUsd)}
							</span>
							<span className="trader-profile-fill-price">{oddsLabel(e.price)}</span>
							<span className="trader-profile-fill-date">{formatFillTime(e.at)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Profile combos render through the same ticket component as the main
 * Traders feed, minus the identity block (it's this trader's own page).
 */
function ComboPositionRowView({ combo }: { combo: ComboPositionRow }) {
	const live = combo.status === "OPEN" || combo.status === "PARTIAL";
	const won = combo.status === "RESOLVED_WIN";
	const payout = live ? combo.sharesBalance : combo.realizedPayoutUsdc;
	const timeLabel = live
		? combo.firstEnteredAt
			? `placed ${formatRelativeTime(combo.firstEnteredAt)}`
			: ""
		: combo.resolvedAt
			? `settled ${formatRelativeTime(combo.resolvedAt)}`
			: "";
	return (
		<ComboTicket
			wallet={combo.wallet}
			comboTitle={combo.comboTitle}
			legs={combo.legs}
			costUsd={combo.totalCostUsdc}
			payoutUsd={payout}
			variant={live ? "live" : won ? "won" : "lost"}
			timeLabel={timeLabel}
			linkToProfile={false}
		/>
	);
}

// ---- local helpers ----

function prettySport(s: string): string {
	if (!s) return "";
	if (s.startsWith("esports_")) {
		const rest = s.replace("esports_", "");
		if (rest === "cs") return "Counter-Strike";
		if (rest === "lol") return "League of Legends";
		if (rest === "dota") return "Dota 2";
		if (rest === "valorant") return "Valorant";
		return capitalize(rest);
	}
	return capitalize(s);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
