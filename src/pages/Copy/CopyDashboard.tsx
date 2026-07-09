import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
	Area,
	AreaChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { SlideModal } from "@/components/Modal/SlideModal";
import { helperToast } from "@/components/Toast/toast";
import { shortenAddress } from "@/services/wallets/shortenAddress";
import {
	useCopyActiveSubscription,
	useCopyDetail,
	useResumeCopySubscription,
	useStopCopySubscription,
} from "@/features/trading/hooks/useCopyTrading";
import type {
	CopyActivityJson,
	CopyOpenPositionJson,
	CopySubscriptionJson,
} from "@/features/trading/copy/copyTypes";
import { prettySportLabel } from "./prettySportLabel";
import "./Copy.scss";

const CHART_POS = "#38d39f";
const CHART_NEG = "#ff5e6c";

function fmtUsd(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "—";
	const sign = v < 0 ? "-" : "";
	return `${sign}$${Math.abs(v).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

/** Signed money for PnL — a + always reads. */
function fmtSignedUsd(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "—";
	if (Math.abs(v) < 0.005) return "$0.00";
	const sign = v < 0 ? "-" : "+";
	return `${sign}$${Math.abs(v).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function fmtCents(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "—";
	return `${Math.round(v * 100)}¢`;
}

function fmtAxisUsd(v: number): string {
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
	return `${sign}$${Math.round(abs)}`;
}

function toneOf(v: number): string {
	return v > 0 ? "is-pos" : v < 0 ? "is-neg" : "";
}

function statusLabel(status: CopySubscriptionJson["status"]): string {
	switch (status) {
		case "activating":
			return "Activating";
		case "active":
			return "Active";
		case "paused":
			return "Paused";
		case "stopped":
			return "Stopped";
		case "stopped_by_stop_loss":
			return "Stopped by stop loss";
		case "stopped_by_admin":
			return "Halted";
		case "failed_activation":
			return "Activation failed";
	}
}

function skipReasonLabel(reason: string): string {
	switch (reason) {
		case "pool_exhausted":
			return "Skipped: pool fully deployed";
		case "insufficient_balance":
			return "Skipped: insufficient balance";
		case "no_position_to_sell":
			return "Skipped: no position to sell";
		case "below_min_leader_trade":
			return "Skipped: below your minimum trade size";
		case "below_min_order_size":
			return "Skipped: too small to execute";
		case "sport_restriction":
			return "Skipped: outside your sport";
		case "execution_disabled":
			return "Skipped: execution disabled";
		case "kill_switch":
			return "Skipped: copying halted";
		case "stale_action":
			return "Skipped: trade too old";
		case "daily_cap_reached":
			return "Skipped: daily copy cap reached";
		default:
			return "Skipped";
	}
}

function actionLabel(a: CopyActivityJson): string {
	if (a.action === "redeem") return "Redeem";
	if (a.action === "resolve_loss") return "Settle";
	return `${a.action === "buy" ? "Buy" : "Sell"} ${a.outcome === "yes" ? "Yes" : "No"}`;
}

function actionTone(a: CopyActivityJson): string {
	if (a.action === "buy") return "is-buy";
	if (a.action === "sell" || a.action === "redeem") return "is-sell";
	return "is-loss";
}

function resultLabel(a: CopyActivityJson): string {
	if (a.status === "submitted_unconfirmed") return "Pending confirmation…";
	if (a.status === "skipped") return skipReasonLabel(a.skipReason ?? "");
	if (a.status === "failed") {
		return `Failed${a.errorMessage ? `: ${a.errorMessage.slice(0, 60)}` : ""}`;
	}
	if (a.action === "redeem") return `Won ${fmtUsd(a.followerProceedsUsd)}`;
	if (a.action === "resolve_loss") return "Lost";
	if (a.action === "buy") {
		return `${a.status === "partial" ? "Partial · " : ""}${fmtUsd(a.followerFilledSize)} @ ${fmtCents(a.followerPrice)}`;
	}
	return `${a.status === "partial" ? "Partial · " : ""}${fmtUsd(a.followerProceedsUsd)} @ ${fmtCents(a.followerPrice)}`;
}

function resultTone(a: CopyActivityJson): string {
	if (a.status === "failed" || a.action === "resolve_loss") return "is-neg";
	if (a.status === "submitted_unconfirmed" || a.status === "skipped") return "";
	if (a.action === "redeem") return "is-pos";
	return "";
}

/** "3:41 pm · Jun 28" */
function fmtActivityTime(iso: string): string {
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
	const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	return `${t} · ${day}`;
}

/**
 * Cumulative realized PnL over time, walked from the copy activity with a
 * per-market cost basis. Buys build basis; sells/redeems/settlements realize
 * it. Groups by conditionId when present, else market title (legacy rows).
 */
function buildRealizedPnlSeries(activity: CopyActivityJson[]): { ts: number; pnl: number }[] {
	const rows = [...activity].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
	const lots = new Map<string, { shares: number; costUsd: number }>();
	let realized = 0;
	const pts: { ts: number; pnl: number }[] = [];
	for (const a of rows) {
		if (a.status === "skipped" || a.status === "failed" || a.status === "submitted_unconfirmed") {
			continue;
		}
		const key = `${a.conditionId ?? a.marketTitle}:${a.outcome}`;
		let lot = lots.get(key);
		if (!lot) {
			lot = { shares: 0, costUsd: 0 };
			lots.set(key, lot);
		}
		const ts = new Date(a.createdAt).getTime();
		if (a.action === "buy") {
			lot.costUsd += a.followerFilledSize ?? 0; // buys: filled size = USD cost
			lot.shares += a.followerFilledShares ?? 0;
		} else if (a.action === "sell") {
			const sharesSold = a.followerFilledSize ?? 0; // sells: filled size = shares
			const proceeds = a.followerProceedsUsd ?? 0;
			const costPortion =
				lot.shares > 0 && sharesSold > 0 && sharesSold < lot.shares
					? lot.costUsd * (sharesSold / lot.shares)
					: lot.costUsd;
			realized += proceeds - costPortion;
			lot.shares = Math.max(0, lot.shares - sharesSold);
			lot.costUsd = Math.max(0, lot.costUsd - costPortion);
			pts.push({ ts, pnl: realized });
		} else if (a.action === "redeem") {
			realized += (a.followerProceedsUsd ?? 0) - lot.costUsd;
			lot.shares = 0;
			lot.costUsd = 0;
			pts.push({ ts, pnl: realized });
		} else if (a.action === "resolve_loss") {
			realized -= lot.costUsd;
			lot.shares = 0;
			lot.costUsd = 0;
			pts.push({ ts, pnl: realized });
		}
	}
	return pts;
}

function CopyPnlTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: { ts: number; pnl: number } }[];
}) {
	if (!active || !payload || payload.length === 0) return null;
	const p = payload[0].payload;
	return (
		<div className="copy-dash-chart-tip">
			<div className="copy-dash-chart-tip-date">
				{new Date(p.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
			</div>
			<div className={`copy-dash-chart-tip-value ${toneOf(p.pnl)}`}>{fmtSignedUsd(p.pnl)}</div>
		</div>
	);
}

function CopyPnlChart({ activity, since }: { activity: CopyActivityJson[]; since?: string | null }) {
	const data = useMemo(() => {
		const pts = buildRealizedPnlSeries(activity);
		if (pts.length === 0) return pts;
		// Anchor at $0 on the start date, and carry the last value out to now.
		const startTs = since ? new Date(since).getTime() : pts[0].ts;
		const rows =
			Number.isFinite(startTs) && startTs < pts[0].ts
				? [{ ts: startTs, pnl: 0 }, ...pts]
				: [{ ts: pts[0].ts, pnl: 0 }, ...pts];
		const last = rows[rows.length - 1];
		const now = Date.now();
		if (last.ts < now) rows.push({ ts: now, pnl: last.pnl });
		return rows;
	}, [activity, since]);

	const finalPnl = data.length > 0 ? data[data.length - 1].pnl : 0;
	const color = finalPnl < 0 ? CHART_NEG : CHART_POS;
	const crossesZero = data.some((d) => d.pnl > 0) && data.some((d) => d.pnl < 0);

	return (
		<section className="copy-dash-section">
			<h2 className="copy-dash-section-title">Realized PnL over time</h2>
			<div className="copy-dash-chart">
				{data.length < 2 ? (
					<div className="copy-dash-chart-empty">No settled copies yet.</div>
				) : (
					<ResponsiveContainer width="100%" height={200}>
						<AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
							<defs>
								<linearGradient id="copyPnlFill" x1="0" y1="0" x2="0" y2="1">
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
									new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
								tickFormatter={(v: number) => fmtAxisUsd(v)}
								tickCount={4}
							/>
							{crossesZero && (
								<ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
							)}
							<Tooltip
								content={<CopyPnlTooltip />}
								cursor={{ stroke: "rgba(255,255,255,0.25)", strokeDasharray: "3 3" }}
							/>
							<Area
								type="monotone"
								dataKey="pnl"
								stroke={color}
								strokeWidth={2.5}
								fill="url(#copyPnlFill)"
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
		<div className={`copy-dash-stat${big ? " is-big" : ""}`}>
			<span className="copy-dash-stat-label">{label}</span>
			<span className={`copy-dash-stat-value ${tone ?? ""}`}>{value}</span>
		</div>
	);
}

export default function CopyDashboard() {
	const [searchParams] = useSearchParams();
	const activeQuery = useCopyActiveSubscription();
	const subscriptionId = searchParams.get("subscription") ?? activeQuery.data?.id;
	const detailQuery = useCopyDetail(subscriptionId ?? undefined);
	const stopMutation = useStopCopySubscription();
	const resumeMutation = useResumeCopySubscription();

	const [stopModalOpen, setStopModalOpen] = useState(false);
	const [exitPositions, setExitPositions] = useState(true);

	const detail = detailQuery.data;
	const sub = detail?.subscription;

	const isLive = sub?.status === "active" || sub?.status === "activating";
	const isPaused = sub?.status === "paused";

	const statusClass = isLive ? "is-live" : isPaused ? "is-paused" : "is-stopped";

	async function onStopConfirm() {
		if (!sub) return;
		try {
			await stopMutation.mutateAsync({ subscriptionId: sub.id, body: { exitPositions } });
			helperToast.success("Copying stopped.");
			setStopModalOpen(false);
		} catch (e) {
			helperToast.error(e instanceof Error ? e.message : "Stop failed.");
		}
	}

	async function onResume() {
		if (!sub) return;
		try {
			await resumeMutation.mutateAsync(sub.id);
			helperToast.success("Copying resumed.");
		} catch (e) {
			helperToast.error(e instanceof Error ? e.message : "Resume failed.");
		}
	}

	if (activeQuery.isLoading || (subscriptionId && detailQuery.isLoading)) {
		return (
			<div className="copy-dash-page">
				<div className="copy-dash-container">
					<div className="copy-dash-empty">Loading…</div>
				</div>
			</div>
		);
	}

	if (!subscriptionId || !sub) {
		return (
			<div className="copy-dash-page">
				<div className="copy-dash-container">
					<h1 className="copy-dash-title">Copy trading</h1>
					<div className="copy-dash-empty">
						You’re not copying anyone yet. Find a trader on the{" "}
						<Link to="/traders" className="copy-dash-inline-link">
							Traders
						</Link>{" "}
						page and press Copy Trader.
					</div>
				</div>
			</div>
		);
	}

	const realized = sub.realizedPnlUsd;
	const unrealized = detail?.unrealizedPnlUsd ?? 0;
	const totalPnl = realized + unrealized;
	const name = shortenAddress(sub.leaderWallet, 13);
	const positions = detail?.positions ?? [];
	const activity = detail?.activity ?? [];

	return (
		<div className="copy-dash-page">
			<div className="copy-dash-container">
				<header className="copy-dash-header">
					<div className="copy-dash-identity">
						<h1 className="copy-dash-title">Copying {name}</h1>
						<div className="copy-dash-meta">
							<span className={`copy-dash-status ${statusClass}`}>{statusLabel(sub.status)}</span>
							<Link to={`/traders/${sub.leaderWallet}`} className="copy-dash-chip">
								View trader ↗
							</Link>
						</div>
					</div>
					{isPaused ? (
						<button
							type="button"
							className="copy-dash-resume"
							disabled={resumeMutation.isPending}
							onClick={() => void onResume()}
						>
							{resumeMutation.isPending ? "Resuming…" : "Resume copying"}
						</button>
					) : isLive ? (
						<button
							type="button"
							className="copy-dash-stop"
							onClick={() => setStopModalOpen(true)}
						>
							Stop copying
						</button>
					) : null}
				</header>

				{sub.status === "activating" && (
					<div className="copy-dash-notice">
						Setting up your copy. Copying starts automatically once it’s ready.
					</div>
				)}

				{sub.status === "failed_activation" && (
					<div className="copy-dash-notice is-error">
						Couldn’t start copying{sub.fundingError ? `: ${sub.fundingError}` : "."} Your funds are
						safe in your Polymarket account. Try again from the{" "}
						<Link to="/traders" className="copy-dash-inline-link">
							Traders
						</Link>{" "}
						page.
					</div>
				)}

				<section className="copy-dash-section">
					<div className="copy-dash-stat-grid">
						<StatCard label="Total PnL" value={fmtSignedUsd(totalPnl)} tone={toneOf(totalPnl)} big />
						<StatCard label="Realized" value={fmtSignedUsd(realized)} tone={toneOf(realized)} />
						<StatCard label="Unrealized" value={fmtSignedUsd(unrealized)} tone={toneOf(unrealized)} />
						<StatCard
							label="Current value"
							value={
								sub.status === "activating"
									? "Pending"
									: fmtUsd(detail?.currentValueUsd ?? sub.lastMarkTotalValueUsd)
							}
						/>
						<StatCard label="Allocated" value={fmtUsd(sub.initialPoolUsd)} />
						<StatCard label="Deployed" value={fmtUsd(sub.deployedUsd)} />
					</div>
				</section>

				<CopyPnlChart activity={activity} since={sub.activatedAt ?? sub.createdAt} />

				<section className="copy-dash-section">
					<h2 className="copy-dash-section-title">Open positions</h2>
					{positions.length > 0 ? (
						<div className="copy-dash-list">
							{positions.map((pos: CopyOpenPositionJson) => {
								const pnl = pos.unrealizedPnlUsd ?? 0;
								return (
									<div className="copy-dash-row" key={`${pos.conditionId}:${pos.outcome}`}>
										<div className="copy-dash-row-head">
											<span className="copy-dash-row-market" title={pos.marketTitle}>
												{pos.marketTitle}
											</span>
											<span className={`copy-dash-side ${pos.outcome === "yes" ? "is-yes" : "is-no"}`}>
												{pos.outcome === "yes" ? "Yes" : "No"}
											</span>
										</div>
										<div className="copy-dash-row-foot">
											<span className="copy-dash-row-meta">
												{pos.shares.toFixed(1)} @ {fmtCents(pos.avgPrice)} · {fmtUsd(pos.costUsd)}
											</span>
											<span className="copy-dash-row-money">
												<span className="copy-dash-row-value">{fmtUsd(pos.markValueUsd)}</span>
												<span className={`copy-dash-row-pnl ${toneOf(pnl)}`}>{fmtSignedUsd(pnl)}</span>
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="copy-dash-empty">No open copied positions.</div>
					)}
				</section>

				<section className="copy-dash-section">
					<h2 className="copy-dash-section-title">Recent activity</h2>
					{activity.length > 0 ? (
						<div className="copy-dash-list">
							{activity.map((a: CopyActivityJson) => (
								<div className="copy-dash-row is-activity" key={a.id}>
									<div className="copy-dash-row-head">
										<span className={`copy-dash-action ${actionTone(a)}`}>{actionLabel(a)}</span>
										<span className="copy-dash-row-market" title={a.marketTitle}>
											{a.marketTitle || "—"}
										</span>
									</div>
									<div className="copy-dash-row-foot">
										<span className="copy-dash-row-meta">
											{a.sport ? `${prettySportLabel(a.sport)} · ` : ""}
											{fmtActivityTime(a.createdAt)}
										</span>
										<span className={`copy-dash-result ${resultTone(a)}`}>{resultLabel(a)}</span>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="copy-dash-empty">No copy activity yet.</div>
					)}
				</section>

				<SlideModal
					isVisible={stopModalOpen}
					setIsVisible={setStopModalOpen}
					label="Stop copying"
					className="copy-setup-modal"
					noDivider
				>
					<div className="copy-setup">
						<label className="copy-dash-stop-option">
							<input
								type="checkbox"
								checked={exitPositions}
								onChange={(e) => setExitPositions(e.target.checked)}
							/>
							<span>Sell all open copied positions now</span>
						</label>
						<button
							type="button"
							className="copy-dash-stop"
							disabled={stopMutation.isPending}
							onClick={() => void onStopConfirm()}
						>
							{stopMutation.isPending ? "Stopping…" : "Stop copying now"}
						</button>
					</div>
				</SlideModal>
			</div>
		</div>
	);
}
