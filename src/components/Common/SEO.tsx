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
	image?: string;
	imageAlt?: string;
	type?: string;
};

function SEO(props: SeoProps) {
	const { children, ...customMeta } = props;
	const meta = {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		image: SITE_OG_IMAGE,
		imageAlt: SITE_OG_IMAGE_ALT,
		type: "website",
		...customMeta,
	};
	return (
		<>
			<Helmet>
				<title>{meta.title}</title>
				<meta name="robots" content="follow, index" />
				<link rel="canonical" href={`${SITE_ORIGIN}/`} />
				<meta content={meta.description} name="description" />
				<meta property="og:type" content={meta.type} />
				<meta property="og:site_name" content={SITE_NAME} />
				<meta property="og:url" content={`${SITE_ORIGIN}/`} />
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
			</Helmet>
			{children}
		</>
	);
}

export default SEO;
