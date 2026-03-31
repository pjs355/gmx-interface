import type { AccountOverview, PolymarketAccountResponse } from "@/types/trading";
import { blockingReasonsToMessages } from "@/trading/copy/blockingReasons";
import { useTradingWallets } from "@/trading/useWallets";
import "./TradingShell.scss";

type Props = {
	overview: AccountOverview | undefined;
	polymarketAccount: PolymarketAccountResponse | undefined;
	overviewError: boolean;
};

function truncateAddr(a: string | undefined): string {
	if (!a) return "—";
	return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AccountOverviewPanel({
	overview,
	polymarketAccount,
	overviewError,
}: Props) {
	const walletsNorm = useTradingWallets(overview, polymarketAccount);

	return (
		<section className="trading-shell__panel account-overview-panel">
			<h2 className="trading-shell__panel-title">Account</h2>
			{overviewError ? (
				<p className="venue-card__muted">
					Account overview is not available yet (check backend route{" "}
					<code>/profiles/…/account-overview</code>).
				</p>
			) : null}
			<div className="account-overview-panel__wallets">
				<div className="account-overview-panel__chip">
					<span className="account-overview-panel__chip-label">Base SCW</span>
					{truncateAddr(walletsNorm.baseSmartWallet)}
				</div>
				<div className="account-overview-panel__chip">
					<span className="account-overview-panel__chip-label">Signer EOA</span>
					{truncateAddr(walletsNorm.embeddedEoa)}
				</div>
				<div className="account-overview-panel__chip">
					<span className="account-overview-panel__chip-label">Polygon Safe</span>
					{truncateAddr(walletsNorm.polymarketSafe)}
				</div>
				{walletsNorm.solanaAddress ? (
					<div className="account-overview-panel__chip">
						<span className="account-overview-panel__chip-label">Solana</span>
						{truncateAddr(walletsNorm.solanaAddress)}
					</div>
				) : null}
			</div>
			<ul className="account-overview-panel__venues">
				{(overview?.venues ?? []).map((v) => {
					const reasons = v.readiness?.blockingReasons ?? [];
					const msgs = blockingReasonsToMessages(reasons);
					const ready = v.readiness?.executionReady !== false && !reasons.length;
					return (
						<li key={v.venueId} className="account-overview-panel__chip">
							<strong>{v.displayName ?? v.venueId}</strong>
							{" — "}
							{ready ? "Ready" : "Blocked"}
							{msgs.length ? `: ${msgs.join("; ")}` : null}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
