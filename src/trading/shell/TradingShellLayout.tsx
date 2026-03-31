import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Link } from "react-router-dom";
import Button from "@/components/Button/Button";
import { useAccountOverview } from "@/trading/hooks/useAccountOverview";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { useTradingShell } from "@/trading/TradingShellContext";
import { AccountOverviewPanel } from "./AccountOverviewPanel";
import { VenueGrid } from "./VenueGrid";
import "./TradingShell.scss";

export function TradingShellLayout() {
	const { login, authenticated, ready } = usePrivy();
	const { shellError, setShellError, setProfileId } = useTradingShell();
	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id;

	useEffect(() => {
		setProfileId(profileId);
	}, [profileId, setProfileId]);
	const overviewQuery = useAccountOverview(profileId);
	const polymarketQuery = usePolymarketBuilder({
		profileId,
		enabled: Boolean(profileId),
	});

	if (!ready) {
		return (
			<div className="trading-shell">
				<p className="trading-shell__sub">Loading…</p>
			</div>
		);
	}

	if (!authenticated) {
		return (
			<div className="trading-shell">
				<h1>Trading &amp; venues</h1>
				<p className="trading-shell__sub">
					Sign in to see your unified account, funding, and per-venue readiness.
				</p>
				<Button variant="primary" onClick={() => void login()}>
					Log in
				</Button>
			</div>
		);
	}

	return (
		<div className="trading-shell">
			<h1>Trading &amp; venues</h1>
			<p className="trading-shell__sub">
				One account across venues. Fund Polymarket Safe from Base, complete builder
				steps, then trade.{" "}
				<Link to="/predictions/esports">Back to markets</Link>
			</p>
			{shellError ? (
				<p className="venue-card__error" role="alert">
					{shellError}{" "}
					<button
						type="button"
						className="trading-shell__dismiss"
						onClick={() => setShellError(null)}
					>
						Dismiss
					</button>
				</p>
			) : null}
			<div className="trading-shell__grid">
				<AccountOverviewPanel
					overview={overviewQuery.data}
					polymarketAccount={polymarketQuery.data}
					overviewError={overviewQuery.isError}
				/>
				<VenueGrid
					accountOverview={overviewQuery.data}
					profileId={profileId}
				/>
			</div>
		</div>
	);
}
