import type { AccountOverview } from "@/types/trading";
import { PolymarketVenueCard } from "@/trading/venues/polymarket/PolymarketVenueCard";
import "./TradingShell.scss";

type Props = {
	accountOverview: AccountOverview | undefined;
	profileId: string | undefined;
};

export function VenueGrid({ accountOverview, profileId }: Props) {
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
				<h3 className="venue-card__title">Kalshi (DFlow)</h3>
				<p className="venue-card__muted">
					Module placeholder — Solana + routing when API is ready.
				</p>
			</div>
		</div>
	);
}
