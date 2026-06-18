import {
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_OG_IMAGE,
	SITE_ORIGIN,
	TWITTER_URL,
} from "@/config/siteMetadata";

export function organizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SITE_NAME,
		url: SITE_ORIGIN,
		logo: SITE_OG_IMAGE,
		sameAs: [TWITTER_URL],
		description: SITE_DESCRIPTION,
	};
}

export function webSiteJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: SITE_NAME,
		url: SITE_ORIGIN,
		description: SITE_DESCRIPTION,
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: SITE_ORIGIN,
		},
	};
}

export function softwareApplicationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		applicationCategory: "FinanceApplication",
		operatingSystem: "Web",
		url: SITE_ORIGIN,
		description: SITE_DESCRIPTION,
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		featureList: [
			"Compare nine prediction market venues on matched events",
			"Trade Polymarket, Kalshi, Limitless, and Predict from one balance",
			"Smart order routing across integrated venues",
			"Live esports match viewing while trading",
		],
	};
}

export function faqPageJsonLd(faqs: Array<{ question: string; answer: string }>) {
	if (faqs.length === 0) return null;
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((faq) => ({
			"@type": "Question",
			name: faq.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: faq.answer,
			},
		})),
	};
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: `${SITE_ORIGIN}${item.path.startsWith("/") ? item.path : `/${item.path}`}`,
		})),
	};
}

export function blogPostingJsonLd(post: {
	title: string;
	description: string;
	publishedAt: string;
	updatedAt: string;
	canonicalPath: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.description,
		datePublished: post.publishedAt,
		dateModified: post.updatedAt,
		mainEntityOfPage: `${SITE_ORIGIN}${post.canonicalPath}`,
		image: SITE_OG_IMAGE,
		author: {
			"@type": "Organization",
			name: SITE_NAME,
			url: SITE_ORIGIN,
		},
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: SITE_ORIGIN,
			logo: {
				"@type": "ImageObject",
				url: SITE_OG_IMAGE,
			},
		},
	};
}

export function webPageJsonLd(page: {
	title: string;
	description: string;
	publishedAt: string;
	updatedAt: string;
	canonicalPath: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: page.title,
		description: page.description,
		datePublished: page.publishedAt,
		dateModified: page.updatedAt,
		url: `${SITE_ORIGIN}${page.canonicalPath}`,
	};
}

/** Default JSON-LD bundle for the homepage. */
export function homePageJsonLd() {
	return [organizationJsonLd(), webSiteJsonLd(), softwareApplicationJsonLd()];
}
