import { Link } from "react-router-dom";
import type { AccountOverview } from "@/types/trading";
import { PolymarketVenueCard } from "@/trading/venues/polymarket/PolymarketVenueCard";
import { blockingReasonsToMessages } from "@/trading/copy/blockingReasons";
import "./TradingShell.scss";

type Props = {
	accountOverview: AccountOverview | undefined;
	profileId: string | undefined;
};

export function VenueGrid({ accountOverview, profileId }: Props) {
	const dflowGate = accountOverview?.routingEligibility?.kalshiViaDflow;
	const dflowReady = dflowGate?.canExecute === true;
	const dflowReasons = blockingReasonsToMessages(dflowGate?.reasons);

	return (
		<div className="venue-grid">
			<PolymarketVenueCard
				accountOverview={accountOverview}
				profileId={profileId}
			/>
			<div className="venue-card">
				<h3 className="venue-card__title">Limitless</h3>
				<p className="venue-card__muted">Module placeholder — wire when API is ready.</p>
			</div>
			<div className="venue-card">
				<h3 className="venue-card__title">DFlow</h3>
				{dflowGate == null ? (
					<p className="venue-card__muted">Loading…</p>
				) : dflowReady ? (
					<p className="venue-card__muted" style={{ color: "#16a34a" }}>
						Ready to trade
					</p>
				) : (
					<>
						{dflowReasons.length > 0 ? (
							<ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 13 }}>
								{dflowReasons.map((m) => (
									<li key={m} className="venue-card__muted">{m}</li>
								))}
							</ul>
						) : (
							<p className="venue-card__muted">
								Complete Proof KYC to enable DFlow trading.
							</p>
						)}
						<Link
							to="/profile"
							style={{ fontSize: 13, color: "#6A6FF5", marginTop: 4, display: "inline-block" }}
						>
							Open Profile →
						</Link>
					</>
				)}
			</div>
		</div>
	);
}
