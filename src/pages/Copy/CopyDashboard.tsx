import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

function fmtUsd(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "-";
	const sign = v < 0 ? "-" : "";
	return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtPrice(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "-";
	return `${Math.round(v * 100)}c`;
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
	if (a.action === "redeem") return "REDEEM";
	if (a.action === "resolve_loss") return "SETTLE";
	return `${a.action.toUpperCase()} ${a.outcome.toUpperCase()}`;
}

function resultLabel(a: CopyActivityJson): string {
	if (a.status === "submitted_unconfirmed") return "Pending confirmation…";
	if (a.status === "skipped") return skipReasonLabel(a.skipReason ?? "");
	if (a.status === "failed") {
		return `Failed${a.errorMessage ? `: ${a.errorMessage.slice(0, 60)}` : ""}`;
	}
	if (a.action === "redeem") return `Redeemed ${fmtUsd(a.followerProceedsUsd)} in winnings`;
	if (a.action === "resolve_loss") return "Market resolved — position lost";
	if (a.action === "buy") {
		return `${a.status === "partial" ? "Partial buy" : "Bought"} ${fmtUsd(a.followerFilledSize)} @ ${fmtPrice(a.followerPrice)}`;
	}
	return `${a.status === "partial" ? "Partial sell" : "Sold"} ${a.followerFilledSize?.toFixed(2) ?? "-"} shares for ${fmtUsd(a.followerProceedsUsd)}`;
}

function resultClass(a: CopyActivityJson): string {
	if (a.status === "failed" || a.action === "resolve_loss") return "is-neg";
	if (a.status === "submitted_unconfirmed" || a.status === "skipped") return "";
	return "is-pos";
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

	const statusClass = useMemo(() => {
		if (!sub) return "";
		if (isLive) return "";
		if (isPaused) return "is-paused";
		return "is-stopped";
	}, [sub, isLive, isPaused]);

	async function onStopConfirm() {
		if (!sub) return;
		try {
			await stopMutation.mutateAsync({
				subscriptionId: sub.id,
				body: { exitPositions },
			});
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
						No active copy. Pick a trader on the{" "}
						<Link to="/traders" style={{ color: "#0478ff" }}>
							Traders
						</Link>{" "}
						page and press Copy.
					</div>
				</div>
			</div>
		);
	}

	const realized = sub.realizedPnlUsd;
	const unrealized = detail?.unrealizedPnlUsd ?? 0;

	return (
		<div className="copy-dash-page">
			<div className="copy-dash-container">
				<div className="copy-dash-header">
					<h1 className="copy-dash-title">
						Copying{" "}
						<Link to={`/traders/${sub.leaderWallet}`} style={{ color: "#0478ff" }}>
							{shortenAddress(sub.leaderWallet, 13)}
						</Link>
					</h1>
					<span className={`copy-dash-status ${statusClass}`}>{statusLabel(sub.status)}</span>
				</div>

				{sub.status === "activating" && (
					<div className="copy-dash-empty">
						Setting up your copy — moving your funds into place. This usually takes a minute
						or two, and copying starts automatically once it’s ready.
					</div>
				)}

				{sub.status === "failed_activation" && (
					<div className="copy-setup-error">
						Couldn’t start copying{sub.fundingError ? `: ${sub.fundingError}` : "."} Your funds
						are safe in your Polymarket account — you can try again from the{" "}
						<Link to="/traders" style={{ color: "#0478ff" }}>
							Traders
						</Link>{" "}
						page.
					</div>
				)}

				<div className="copy-dash-stats">
					<div className="copy-dash-stat">
						<div className="copy-dash-stat-label">Allocated pool</div>
						<div className="copy-dash-stat-value">{fmtUsd(sub.initialPoolUsd)}</div>
					</div>
					<div className="copy-dash-stat">
						<div className="copy-dash-stat-label">Current value</div>
						<div className="copy-dash-stat-value">
							{fmtUsd(detail?.currentValueUsd ?? sub.lastMarkTotalValueUsd)}
						</div>
					</div>
					<div className="copy-dash-stat">
						<div className="copy-dash-stat-label">Realized PnL</div>
						<div
							className={`copy-dash-stat-value ${realized > 0 ? "is-pos" : realized < 0 ? "is-neg" : ""}`}
						>
							{fmtUsd(realized)}
						</div>
					</div>
					<div className="copy-dash-stat">
						<div className="copy-dash-stat-label">Unrealized PnL</div>
						<div
							className={`copy-dash-stat-value ${unrealized > 0 ? "is-pos" : unrealized < 0 ? "is-neg" : ""}`}
						>
							{fmtUsd(unrealized)}
						</div>
					</div>
					<div className="copy-dash-stat">
						<div className="copy-dash-stat-label">Deployed</div>
						<div className="copy-dash-stat-value">{fmtUsd(sub.deployedUsd)}</div>
					</div>
				</div>

				<div>
					<h2 className="copy-dash-section-title">Open copied positions</h2>
					<div className="copy-dash-table-wrap">
						{detail && detail.positions.length > 0 ? (
							<table className="copy-dash-table">
								<thead>
									<tr>
										<th>Market</th>
										<th>Side</th>
										<th>Shares</th>
										<th>Avg price</th>
										<th>Cost</th>
										<th>Value</th>
										<th>PnL</th>
									</tr>
								</thead>
								<tbody>
									{detail.positions.map((pos: CopyOpenPositionJson) => (
										<tr key={`${pos.conditionId}:${pos.outcome}`}>
											<td title={pos.marketTitle}>
												{pos.marketTitle.length > 48
													? `${pos.marketTitle.slice(0, 48)}…`
													: pos.marketTitle}
											</td>
											<td>{pos.outcome.toUpperCase()}</td>
											<td>{pos.shares.toFixed(2)}</td>
											<td>{fmtPrice(pos.avgPrice)}</td>
											<td>{fmtUsd(pos.costUsd)}</td>
											<td>{fmtUsd(pos.markValueUsd)}</td>
											<td
												className={
													(pos.unrealizedPnlUsd ?? 0) > 0
														? "is-pos"
														: (pos.unrealizedPnlUsd ?? 0) < 0
															? "is-neg"
															: ""
												}
											>
												{fmtUsd(pos.unrealizedPnlUsd)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						) : (
							<div className="copy-dash-empty">No open copied positions.</div>
						)}
					</div>
				</div>

				<div>
					<h2 className="copy-dash-section-title">Recent activity</h2>
					<div className="copy-dash-table-wrap">
						{detail && detail.activity.length > 0 ? (
							<table className="copy-dash-table">
								<thead>
									<tr>
										<th>Time</th>
										<th>Action</th>
										<th>Market</th>
										<th>Sport</th>
										<th>Result</th>
									</tr>
								</thead>
								<tbody>
									{detail.activity.map((a: CopyActivityJson) => (
										<tr key={a.id}>
											<td>{new Date(a.createdAt).toLocaleString()}</td>
											<td>{actionLabel(a)}</td>
											<td title={a.marketTitle}>
												{a.marketTitle.length > 40
													? `${a.marketTitle.slice(0, 40)}…`
													: a.marketTitle || "-"}
											</td>
											<td>{a.sport ? prettySportLabel(a.sport) : "-"}</td>
											<td className={resultClass(a)}>{resultLabel(a)}</td>
										</tr>
									))}
								</tbody>
							</table>
						) : (
							<div className="copy-dash-empty">No copy activity yet.</div>
						)}
					</div>
				</div>

				{isPaused && (
					<button
						type="button"
						className="copy-dash-resume"
						disabled={resumeMutation.isPending}
						onClick={() => {
							void onResume();
						}}
					>
						{resumeMutation.isPending ? "Resuming…" : "Resume copying"}
					</button>
				)}

				{(isLive || isPaused) && (
					<button type="button" className="copy-dash-stop" onClick={() => setStopModalOpen(true)}>
						Stop copying
					</button>
				)}

				<SlideModal
					isVisible={stopModalOpen}
					setIsVisible={setStopModalOpen}
					label="Stop copying"
					className="copy-setup-modal"
					noDivider
				>
					<div className="copy-setup">
						<div className="copy-dash-stop-options">
							<label>
								<input
									type="checkbox"
									checked={exitPositions}
									onChange={(e) => setExitPositions(e.target.checked)}
								/>
								Market exit all open copied positions
							</label>
						</div>
						<button
							type="button"
							className="copy-dash-stop"
							disabled={stopMutation.isPending}
							onClick={() => {
								void onStopConfirm();
							}}
						>
							{stopMutation.isPending ? "Stopping…" : "Stop copying now"}
						</button>
					</div>
				</SlideModal>
			</div>
		</div>
	);
}
