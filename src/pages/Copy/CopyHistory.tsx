import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useCopySubscriptions } from "@/features/trading/hooks/useCopyTrading";
import { usePortfolio } from "@/context/PortfolioContext";
import { useTransfersModal } from "@/context/TransfersModalContext";
import { DepositFundingPanel } from "@/features/funding/DepositFundingPanel";
import { useAfterDepositRefresh } from "@/features/funding/useAfterDepositRefresh";
import { shortenAddress } from "@/services/wallets/shortenAddress";
import { TraderAvatar } from "@/pages/Traders/TraderAvatar";
import { PnlLineChart } from "@/pages/Traders/PnlLineChart";
import type {
	CopySubscriptionJson,
	CopySubscriptionListItemJson,
} from "@/features/trading/copy/copyTypes";
import "@/pages/Transfers/Transfers.scss";
import "./Copy.scss";

function fmtUsd(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "—";
	const sign = v < 0 ? "-" : "";
	return `${sign}$${Math.abs(v).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function fmtSignedUsd(v: number): string {
	if (Math.abs(v) < 0.005) return "$0.00";
	const sign = v < 0 ? "-" : "+";
	return `${sign}$${Math.abs(v).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function fmtPct(v: number): string {
	if (!Number.isFinite(v)) return "—";
	const sign = v > 0 ? "+" : "";
	return `${sign}${v.toFixed(1)}%`;
}

function fmtInt(v: number): string {
	return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
}

/** Compact copy duration, e.g. "15 min", "3 hr", "2 d", "5 mo". */
function fmtDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
	if (!startIso) return "";
	const start = Date.parse(startIso);
	if (!Number.isFinite(start)) return "";
	const endParsed = endIso ? Date.parse(endIso) : Date.now();
	const end = Number.isFinite(endParsed) ? endParsed : Date.now();
	const ms = Math.max(0, end - start);
	const mins = Math.floor(ms / 60000);
	if (mins < 1) return "<1 min";
	if (mins < 60) return `${mins} min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} hr`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days} d`;
	const months = Math.floor(days / 30);
	return `${months} mo`;
}

function toneOf(v: number): string {
	return v > 0 ? "is-pos" : v < 0 ? "is-neg" : "";
}

function roiOf(sub: CopySubscriptionJson): number {
	return sub.initialPoolUsd > 0 ? (sub.realizedPnlUsd / sub.initialPoolUsd) * 100 : 0;
}

/** Subscriptions still copying (funds committed) vs. finished. */
function isLive(status: CopySubscriptionJson["status"]): boolean {
	return status === "active" || status === "activating" || status === "paused";
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
			return "Stopped · stop loss";
		case "stopped_by_admin":
			return "Halted";
		case "failed_activation":
			return "Failed";
	}
}

function statusClass(status: CopySubscriptionJson["status"]): string {
	if (status === "active" || status === "activating") return "is-live";
	if (status === "paused") return "is-paused";
	return "is-stopped";
}

/** Tiny inline PnL sparkline — green when it ends up, red when down. */
function Sparkline({ series }: { series: { t: string; pnl: number }[] }) {
	if (!series || series.length < 2) {
		return <div className="copy-hist-spark is-empty" aria-hidden="true" />;
	}
	const ys = series.map((p) => p.pnl);
	const min = Math.min(0, ...ys);
	const max = Math.max(0, ...ys);
	const range = max - min || 1;
	const W = 88;
	const H = 32;
	const pad = 2;
	const n = series.length;
	const pts = series
		.map((p, i) => {
			const x = pad + (i / (n - 1)) * (W - pad * 2);
			const y = pad + (1 - (p.pnl - min) / range) * (H - pad * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	const color = ys[ys.length - 1] < 0 ? "#ff5e6c" : "#38d39f";
	return (
		<svg
			className="copy-hist-spark"
			width={W}
			height={H}
			viewBox={`0 0 ${W} ${H}`}
			aria-hidden="true"
		>
			<polyline
				points={pts}
				fill="none"
				stroke={color}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function TraderCard({ sub }: { sub: CopySubscriptionListItemJson }) {
	const name = sub.leaderName?.trim() || shortenAddress(sub.leaderWallet, 13);
	const roi = roiOf(sub);
	const live = isLive(sub.status);
	const duration = fmtDuration(sub.activatedAt ?? sub.createdAt, live ? null : sub.stoppedAt);
	return (
		<Link className="copy-hist-row" to={`/copy?subscription=${sub.id}`}>
			<TraderAvatar
				wallet={sub.leaderWallet}
				displayName={name}
				imageUrl={sub.leaderImageUrl ?? undefined}
				size={40}
			/>
			<div className="copy-hist-main">
				<span className="copy-hist-name-row">
					<span className="copy-hist-name">{name}</span>
					<span className={`copy-dash-status ${statusClass(sub.status)}`}>
						{statusLabel(sub.status)}
					</span>
				</span>
				<span className="copy-hist-meta">
					<span className="copy-hist-alloc">{fmtUsd(sub.initialPoolUsd)} allocated</span>
					{duration ? (
						<span className="copy-hist-dur">
							{live ? "Copying for" : "Copied for"} {duration}
						</span>
					) : null}
				</span>
			</div>
			<Sparkline series={sub.pnlSeries} />
			<div className="copy-hist-nums">
				<span className={`copy-hist-pnl ${toneOf(sub.realizedPnlUsd)}`}>
					{fmtSignedUsd(sub.realizedPnlUsd)}
				</span>
				<span className={`copy-hist-roi ${toneOf(sub.realizedPnlUsd)}`}>{fmtPct(roi)}</span>
			</div>
		</Link>
	);
}

type PnlWindowKey = "d" | "w" | "m" | "all";
const PNL_WINDOWS: { key: PnlWindowKey; short: string; long: string; ms: number | null }[] = [
	{ key: "d", short: "D", long: "Today", ms: 24 * 60 * 60 * 1000 },
	{ key: "w", short: "W", long: "Weekly", ms: 7 * 24 * 60 * 60 * 1000 },
	{ key: "m", short: "M", long: "Monthly", ms: 30 * 24 * 60 * 60 * 1000 },
	{ key: "all", short: "All", long: "All Time", ms: null },
];

/** Chart heading follows the selected window, like the trader pages. */
function portfolioPnlHeading(win: PnlWindowKey): string {
	switch (win) {
		case "d":
			return "PnL today";
		case "w":
			return "PnL weekly";
		case "m":
			return "PnL monthly";
		default:
			return "PnL all time";
	}
}

/**
 * Merge every subscription's cumulative realized-PnL series into one portfolio
 * curve: at each closing event, total = sum of each sub's latest cumulative PnL.
 */
function combinedRealizedSeries(subs: CopySubscriptionListItemJson[]): { ts: number; pnl: number }[] {
	const evs: { ts: number; subId: string; pnl: number }[] = [];
	for (const s of subs) {
		for (const p of s.pnlSeries ?? []) {
			const ts = Date.parse(p.t);
			if (Number.isFinite(ts)) evs.push({ ts, subId: s.id, pnl: p.pnl });
		}
	}
	evs.sort((a, b) => a.ts - b.ts);
	const latest = new Map<string, number>();
	const out: { ts: number; pnl: number }[] = [];
	for (const e of evs) {
		latest.set(e.subId, e.pnl);
		let total = 0;
		for (const v of latest.values()) total += v;
		if (out.length > 0 && out[out.length - 1].ts === e.ts) out[out.length - 1] = { ts: e.ts, pnl: total };
		else out.push({ ts: e.ts, pnl: total });
	}
	return out;
}

/** Portfolio-wide realized PnL over time with a D / W / M / All window toggle. */
function PortfolioPnlChart({ subs }: { subs: CopySubscriptionListItemJson[] }) {
	const [win, setWin] = useState<PnlWindowKey>("all");
	const full = useMemo(() => combinedRealizedSeries(subs), [subs]);
	const data = useMemo(() => {
		if (full.length === 0) return [] as { ts: number; pnl: number }[];
		const now = Date.now();
		const w = PNL_WINDOWS.find((x) => x.key === win);
		if (!w || w.ms === null) {
			const rows = [{ ts: full[0].ts, pnl: 0 }, ...full];
			const last = rows[rows.length - 1];
			if (last.ts < now) rows.push({ ts: now, pnl: last.pnl });
			return rows;
		}
		const start = now - w.ms;
		// Carry the cumulative total as it stood at the window's start so the line
		// is continuous even when nothing settled inside the window.
		let baseline = 0;
		for (const p of full) {
			if (p.ts < start) baseline = p.pnl;
			else break;
		}
		const inWindow = full.filter((p) => p.ts >= start);
		const rows = [{ ts: start, pnl: baseline }, ...inWindow];
		const last = rows[rows.length - 1];
		if (last.ts < now) rows.push({ ts: now, pnl: last.pnl });
		return rows;
	}, [full, win]);

	// No settled copies yet → nothing to chart.
	if (full.length === 0) return null;

	return (
		<section className="copy-hist-chart-section">
			<div className="copy-hist-chart-head">
				<h2 className="copy-dash-section-title">{portfolioPnlHeading(win)}</h2>
				<div className="copy-hist-window-seg" role="tablist" aria-label="PnL window">
					{PNL_WINDOWS.map((w) => (
						<button
							key={w.key}
							type="button"
							role="tab"
							aria-selected={win === w.key}
							className={`copy-hist-window-tab${win === w.key ? " is-active" : ""}`}
							onClick={() => setWin(w.key)}
						>
							<span className="copy-hist-window-label is-long">{w.long}</span>
							<span className="copy-hist-window-label is-short">{w.short}</span>
						</button>
					))}
				</div>
			</div>
			<div className="copy-dash-chart">
				<PnlLineChart points={data} height={200} />
			</div>
		</section>
	);
}

/** Loading state — mirrors the real portfolio layout (responsive via shared classes). */
function PortfolioSkeleton() {
	return (
		<div className="copy-hist-page">
			<div className="copy-hist-container">
				<h1 className="copy-hist-title">Portfolio</h1>

				<div className="copy-hist-cash">
					<div className="copy-hist-cash-figures">
						<div className="copy-hist-cash-figure">
							<span className="copy-skel" style={{ width: 96, height: 12 }} />
							<span className="copy-skel" style={{ width: 170, height: 40 }} />
						</div>
					</div>
					<div className="transfers-actions copy-hist-cash-actions">
						<span className="copy-skel copy-skel-btn" />
						<span className="copy-skel copy-skel-btn" />
					</div>
				</div>

				<div className="copy-hist-stat-grid">
					{Array.from({ length: 4 }).map((_, i) => (
						<div className="copy-hist-stat" key={i}>
							<span className="copy-skel" style={{ width: 66, height: 11 }} />
							<span className="copy-skel" style={{ width: 88, height: 18 }} />
						</div>
					))}
				</div>

				<div className="copy-skel copy-skel-chart" />

				<div className="copy-hist-section">
					<span className="copy-skel" style={{ width: 150, height: 15 }} />
					<div className="copy-hist-list">
						{Array.from({ length: 4 }).map((_, i) => (
							<div className="copy-hist-row" key={i} style={{ pointerEvents: "none" }}>
								<span className="copy-skel copy-skel--circle" style={{ width: 40, height: 40 }} />
								<div className="copy-hist-main">
									<span className="copy-skel" style={{ width: 132, height: 14 }} />
									<span className="copy-skel" style={{ width: 96, height: 11 }} />
								</div>
								<span className="copy-hist-spark copy-skel" style={{ width: 88, height: 32 }} />
								<div className="copy-hist-nums">
									<span className="copy-skel" style={{ width: 58, height: 14 }} />
									<span className="copy-skel" style={{ width: 40, height: 11 }} />
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function CopyHistory() {
	const { authenticated } = usePrivy();
	const query = useCopySubscriptions();
	const { cashBalance, cashLoading } = usePortfolio();
	const { openModal: openWithdrawModal } = useTransfersModal();
	const refreshAfterDeposit = useAfterDepositRefresh();
	const subs = query.data ?? [];

	if (!authenticated) {
		return (
			<div className="copy-hist-page">
				<div className="copy-hist-container">
					<h1 className="copy-hist-title">Portfolio</h1>
					<div className="copy-dash-empty">Sign in to see your copy history.</div>
				</div>
			</div>
		);
	}

	if (query.isLoading) {
		return <PortfolioSkeleton />;
	}

	const sorted = [...subs].sort((a, b) => b.realizedPnlUsd - a.realizedPnlUsd);
	const totalRealized = subs.reduce((s, x) => s + x.realizedPnlUsd, 0);
	const totalUnrealized = subs.reduce((s, x) => s + (x.unrealizedPnlUsd ?? 0), 0);
	const allocatedNow = subs
		.filter((x) => isLive(x.status))
		.reduce((s, x) => s + x.reservedUsd + x.deployedUsd, 0);
	const totalTrades = subs.reduce((s, x) => s + (x.tradeCount ?? 0), 0);

	const withdrawDisabled = cashLoading || cashBalance === null || cashBalance <= 0;

	return (
		<div className="copy-hist-page">
			<div className="copy-hist-container">
				<h1 className="copy-hist-title">Portfolio</h1>

				<div className="copy-hist-cash">
					<div className="copy-hist-cash-figures">
						<div className="copy-hist-cash-figure">
							<span className="copy-hist-cash-label">Cash available</span>
							<span className="copy-hist-cash-value">
								{cashLoading ? "…" : fmtUsd(cashBalance)}
							</span>
						</div>
					</div>
					<div className="transfers-actions copy-hist-cash-actions">
						<DepositFundingPanel onComplete={refreshAfterDeposit} />
						<button
							type="button"
							className="transfers-btn transfers-btn-withdraw"
							onClick={openWithdrawModal}
							disabled={withdrawDisabled}
						>
							Withdraw Funds
						</button>
					</div>
				</div>

				{subs.length === 0 ? (
					<div className="copy-dash-empty">
						You haven’t copied anyone yet. Find a trader on the{" "}
						<Link to="/traders" className="copy-dash-inline-link">
							Traders
						</Link>{" "}
						page and press Copy Trader.
					</div>
				) : (
					<>
						<div className="copy-hist-stat-grid">
							<div className="copy-hist-stat">
								<span className="copy-dash-stat-label">Realized PnL</span>
								<span className={`copy-dash-stat-value ${toneOf(totalRealized)}`}>
									{fmtSignedUsd(totalRealized)}
								</span>
							</div>
							<div className="copy-hist-stat">
								<span className="copy-dash-stat-label">Unrealized PnL</span>
								<span className={`copy-dash-stat-value ${toneOf(totalUnrealized)}`}>
									{fmtSignedUsd(totalUnrealized)}
								</span>
							</div>
							<div className="copy-hist-stat">
								<span className="copy-dash-stat-label">Allocated now</span>
								<span className="copy-dash-stat-value">{fmtUsd(allocatedNow)}</span>
							</div>
							<div className="copy-hist-stat">
								<span className="copy-dash-stat-label">Trades</span>
								<span className="copy-dash-stat-value">{fmtInt(totalTrades)}</span>
							</div>
						</div>

						<PortfolioPnlChart subs={subs} />

						<div className="copy-hist-section">
							<h2 className="copy-dash-section-title">Traders you’ve copied</h2>
							<div className="copy-hist-list">
								{sorted.map((sub) => (
									<TraderCard key={sub.id} sub={sub} />
								))}
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
