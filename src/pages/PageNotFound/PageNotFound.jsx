import { Trans, t } from "@lingui/macro";

// Removed lib/legacy imports - not needed for prediction markets

import SEO from "components/Common/SEO";
import { useEffect } from "react";

import "./PageNotFound.css";

function PageNotFound() {
	const homeUrl = "/";
	const tradePageUrl = "/predictions";

	// Auto-redirect to homepage immediately
	useEffect(() => {
		window.location.replace(homeUrl);
	}, [homeUrl]);

	return (
		<SEO title={t`Page not found | LevelUp Predictions`}>
			<div className="page-layout">
				<div className="page-not-found-container">
					<div className="page-not-found">
						<h2>
							<Trans id="pageNotFound.title">Page not found</Trans>
						</h2>
						<p className="go-back">
						<Trans
							id="pageNotFound.goBack"
							components={{
								homepage: <a href={homeUrl} />,
								trade: <a href={tradePageUrl} />,
							}}
							defaults="Return to <homepage>Homepage</homepage> or <trade>Trade</trade>"
						/>
						</p>
					</div>
				</div>
			</div>
		</SEO>
	);
}

export default PageNotFound;
