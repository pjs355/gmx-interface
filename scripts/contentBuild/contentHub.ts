/** Slugs that already contain full aggregator hub linking. */
export const AGGREGATOR_HUB_SLUGS = new Set([
	"what-is-a-prediction-market-aggregator",
	"esports-prediction-market-aggregator",
	"best-prediction-market-aggregators-2026",
]);

export const CONTENT_HUB_LINKS_HTML = `<section class="content-hub-links" aria-label="Prediction market aggregator guides">
<h2>Prediction market aggregator guides</h2>
<ul>
<li><a href="/blog/what-is-a-prediction-market-aggregator">What is a prediction market aggregator?</a></li>
<li><a href="/blog/esports-prediction-market-aggregator">Esports prediction market aggregator</a></li>
<li><a href="/blog/best-prediction-market-aggregators-2026">Best prediction market aggregators (2026)</a></li>
<li><a href="/blog/how-to-find-best-price-esports-prediction-markets">Find the best price across esports venues</a></li>
</ul>
</section>`;

export function appendContentHubLinks(htmlBody: string, slug: string): string {
	if (AGGREGATOR_HUB_SLUGS.has(slug)) return htmlBody;
	if (htmlBody.includes("/blog/what-is-a-prediction-market-aggregator")) return htmlBody;
	return `${htmlBody}\n${CONTENT_HUB_LINKS_HTML}`;
}
