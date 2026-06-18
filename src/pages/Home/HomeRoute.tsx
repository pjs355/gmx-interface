import FilteredPredictions from "@/pages/Predictions/components/FilteredPredictions";
import SEO from "@/components/Common/SEO";
import {
	SITE_DESCRIPTION,
	SITE_KEYWORDS,
	SITE_TITLE,
} from "@/config/siteMetadata";
import { homePageJsonLd } from "@/content/seoSchema";
import { useHideContentPrerender } from "@/content/useHideContentPrerender";

/** Homepage route with prediction market aggregator SEO. */
export function HomeRoute() {
	useHideContentPrerender();

	return (
		<>
			<SEO
				title={SITE_TITLE}
				description={SITE_DESCRIPTION}
				keywords={SITE_KEYWORDS}
				canonicalPath="/"
				jsonLd={homePageJsonLd()}
			/>
			<FilteredPredictions filterType="all" />
		</>
	);
}

export default HomeRoute;
