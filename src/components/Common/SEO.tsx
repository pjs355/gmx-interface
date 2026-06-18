import { Helmet } from "react-helmet";
import {
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_OG_IMAGE,
	SITE_OG_IMAGE_ALT,
	SITE_OG_IMAGE_HEIGHT,
	SITE_OG_IMAGE_WIDTH,
	SITE_ORIGIN,
	SITE_TITLE,
	TWITTER_SITE,
} from "@/config/siteMetadata";

type SeoProps = {
	children?: React.ReactNode;
	title?: string;
	description?: string;
	keywords?: string;
	image?: string;
	imageAlt?: string;
	type?: string;
	canonicalPath?: string;
	noIndex?: boolean;
	jsonLd?: unknown[];
};

function SEO(props: SeoProps) {
	const { children, canonicalPath = "/", noIndex = false, jsonLd = [], keywords, ...customMeta } =
		props;
	const meta = {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		image: SITE_OG_IMAGE,
		imageAlt: SITE_OG_IMAGE_ALT,
		type: "website",
		...customMeta,
	};
	const canonicalUrl = `${SITE_ORIGIN}${canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`}`;
	const robots = noIndex ? "noindex, follow" : "index, follow";

	return (
		<>
			<Helmet>
				<title>{meta.title}</title>
				<meta name="robots" content={robots} />
				<link rel="canonical" href={canonicalUrl} />
				<meta content={meta.description} name="description" />
				{keywords ? <meta content={keywords} name="keywords" /> : null}
				<meta property="og:type" content={meta.type} />
				<meta property="og:site_name" content={SITE_NAME} />
				<meta property="og:url" content={canonicalUrl} />
				<meta property="og:description" content={meta.description} />
				<meta property="og:title" content={meta.title} />
				<meta property="og:image" content={meta.image} />
				<meta property="og:image:width" content={String(SITE_OG_IMAGE_WIDTH)} />
				<meta property="og:image:height" content={String(SITE_OG_IMAGE_HEIGHT)} />
				<meta property="og:image:alt" content={meta.imageAlt} />
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:site" content={TWITTER_SITE} />
				<meta name="twitter:title" content={meta.title} />
				<meta name="twitter:description" content={meta.description} />
				<meta name="twitter:image" content={meta.image} />
				<meta name="twitter:image:alt" content={meta.imageAlt} />
				{jsonLd.map((block, index) => (
					<script key={index} type="application/ld+json">
						{JSON.stringify(block)}
					</script>
				))}
			</Helmet>
			{children}
		</>
	);
}

export default SEO;
