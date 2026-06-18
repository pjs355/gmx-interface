import { Link } from "react-router-dom";

import { AGGREGATOR_HUB_PATH, ESPORTS_AGGREGATOR_HUB_PATH } from "@/config/siteMetadata";

/** Shared internal linking block for aggregator SEO hub (blog only). */
export function ContentHubLinks() {
	return (
		<section className="content-section content-hub-links" aria-label="Prediction market aggregator guides">
			<h2 className="content-section-title">Prediction market aggregator guides</h2>
			<ul className="content-related-list">
				<li>
					<Link to={AGGREGATOR_HUB_PATH}>What is a prediction market aggregator?</Link>
				</li>
				<li>
					<Link to={ESPORTS_AGGREGATOR_HUB_PATH}>Esports prediction market aggregator</Link>
				</li>
				<li>
					<Link to="/blog/best-prediction-market-aggregators-2026">
						Best prediction market aggregators (2026)
					</Link>
				</li>
				<li>
					<Link to="/blog/how-to-find-best-price-esports-prediction-markets">
						Find the best price across esports venues
					</Link>
				</li>
			</ul>
		</section>
	);
}
