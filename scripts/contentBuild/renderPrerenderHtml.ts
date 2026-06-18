import type { BlogPost, ContentFaq, ContentManifest, LanderPage, SpaEntryAssets } from "./types";
import {
	absoluteUrl,
	buildBlogIndexPrerenderHtml,
	buildPrerenderArticleHtml,
} from "./parseContentFiles";

const SITE_NAME = "ClutchComet";
const SITE_OG_IMAGE = "https://clutchcomet.com/og-image.png";
const SITE_DESCRIPTION =
	"ClutchComet is a prediction market aggregator. Compare nine venues on matched events, trade Polymarket, Kalshi, Limitless, and Predict from one balance, with smart order routing.";
const SITE_KEYWORDS =
	"prediction market aggregator, compare prediction markets, Polymarket Kalshi aggregator, esports prediction markets, smart order routing, line shopping";
const TWITTER_URL = "https://x.com/Clutch_Comet";
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function pageTitle(title: string): string {
	const suffix = ` | ${SITE_NAME}`;
	const max = 60;
	if (`${title}${suffix}`.length <= max) return `${title}${suffix}`;
	return `${title.slice(0, max - suffix.length - 1).trim()}…${suffix}`;
}

function organizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SITE_NAME,
		url: absoluteUrl("/"),
		logo: SITE_OG_IMAGE,
		sameAs: [TWITTER_URL],
		description: SITE_DESCRIPTION,
	};
}

function webSiteJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: SITE_NAME,
		url: absoluteUrl("/"),
		description: SITE_DESCRIPTION,
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: absoluteUrl("/"),
		},
	};
}

function softwareApplicationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		applicationCategory: "FinanceApplication",
		operatingSystem: "Web",
		url: absoluteUrl("/"),
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

function faqJsonLd(faqs: ContentFaq[]) {
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

function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: absoluteUrl(item.path),
		})),
	};
}

function blogPostingJsonLd(page: BlogPost) {
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: page.title,
		description: page.description,
		datePublished: page.publishedAt,
		dateModified: page.updatedAt,
		mainEntityOfPage: absoluteUrl(page.canonicalPath),
		image: SITE_OG_IMAGE,
		author: {
			"@type": "Organization",
			name: SITE_NAME,
			url: absoluteUrl("/"),
		},
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: absoluteUrl("/"),
			logo: {
				"@type": "ImageObject",
				url: SITE_OG_IMAGE,
			},
		},
	};
}

function webPageJsonLd(page: LanderPage) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: page.title,
		description: page.description,
		datePublished: page.publishedAt,
		dateModified: page.updatedAt,
		url: absoluteUrl(page.canonicalPath),
	};
}

function blogIndexJsonLd(posts: BlogPost[]) {
	return {
		"@context": "https://schema.org",
		"@type": "Blog",
		name: `${SITE_NAME} Blog`,
		description: "Prediction market guides, odds explainers, and line shopping resources.",
		url: absoluteUrl("/blog"),
		blogPost: posts.map((post) => ({
			"@type": "BlogPosting",
			headline: post.title,
			url: absoluteUrl(post.canonicalPath),
			datePublished: post.publishedAt,
			dateModified: post.updatedAt,
		})),
	};
}

function prerenderStyles(): string {
	return `<style>
.blog-prerender{font-family:system-ui,-apple-system,sans-serif;background:#000;color:#fff;padding:24px;max-width:760px;margin:0 auto;line-height:1.6}
.content-prerender-nav{margin-bottom:24px;font-size:14px}
.content-prerender-nav a{color:#0478ff;text-decoration:none}
.content-article h1{font-size:2rem;line-height:1.15;margin:0 0 16px}
.direct-answer{font-size:1.05rem;color:rgba(255,255,255,.85);margin:0 0 24px}
.content-body h2{font-size:1.35rem;margin:32px 0 12px}
.content-body p{margin:0 0 16px;color:rgba(255,255,255,.82)}
.content-body a{color:#0478ff}
.content-body ul,.content-body ol{margin:0 0 16px;padding-left:24px}
.content-table-wrap{overflow-x:auto;margin:0 0 24px;-webkit-overflow-scrolling:touch}
.content-body table{width:100%;border-collapse:collapse;margin:0;font-size:15px;line-height:1.5;min-width:min(100%,520px)}
.content-body th,.content-body td{border:1px solid rgba(255,255,255,.2);padding:10px 12px;text-align:left;vertical-align:top}
.content-body th{font-weight:600;color:#fff;background:rgba(255,255,255,.07)}
.content-body tbody tr:nth-child(even) td{background:rgba(255,255,255,.02)}
.content-faq{margin-top:32px;border-top:1px solid rgba(255,255,255,.12);padding-top:24px}
.content-faq-question{font-size:1.05rem;margin:16px 0 8px}
.content-faq-answer{margin:0 0 16px;color:rgba(255,255,255,.82)}
.content-sources{margin-top:24px;font-size:14px}
.content-sources ul{padding-left:20px}
.content-cta{margin-top:32px}
.content-cta a{color:#0478ff;font-weight:600}
.content-index-list{list-style:none;padding:0;margin:24px 0 0}
.content-index-list li{margin:0 0 20px;padding:0 0 20px;border-bottom:1px solid rgba(255,255,255,.1)}
.content-index-list p{margin:8px 0 0;color:rgba(255,255,255,.7);font-size:15px}
</style>`;
}

type PageMeta = {
	title: string;
	description: string;
	canonicalPath: string;
	keywords?: string;
	ogType: "website" | "article";
	bodyHtml: string;
	jsonLd: unknown[];
};

function renderFullHtml(meta: PageMeta, spa: SpaEntryAssets): string {
	const canonical = absoluteUrl(meta.canonicalPath);
	const title = pageTitle(meta.title);
	const keywordsMeta = meta.keywords
		? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`
		: "";
	const jsonLdScripts = meta.jsonLd
		.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
		.join("\n    ");

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    ${keywordsMeta}
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="${meta.ogType}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${SITE_OG_IMAGE}" />
    <meta property="og:image:width" content="${String(OG_IMAGE_WIDTH)}" />
    <meta property="og:image:height" content="${String(OG_IMAGE_HEIGHT)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${SITE_OG_IMAGE}" />
    ${prerenderStyles()}
    ${jsonLdScripts}
  </head>
  <body>
    ${meta.bodyHtml}
    <div id="root"></div>
    <script type="module" crossorigin src="${spa.js}"></script>
    <link rel="stylesheet" crossorigin href="${spa.css}">
  </body>
</html>`;
}

export function renderBlogPostHtml(page: BlogPost, spa: SpaEntryAssets): string {
	const jsonLd: unknown[] = [
		organizationJsonLd(),
		blogPostingJsonLd(page),
		breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Blog", path: "/blog" },
			{ name: page.title, path: page.canonicalPath },
		]),
	];
	if (page.schemaProfile === "aggregator") {
		jsonLd.push(softwareApplicationJsonLd());
	}
	const faq = faqJsonLd(page.faqs);
	if (faq) jsonLd.push(faq);

	return renderFullHtml(
		{
			title: page.title,
			description: page.description,
			canonicalPath: page.canonicalPath,
			keywords: page.seoKeywords ?? page.targetKeyword,
			ogType: "article",
			bodyHtml: buildPrerenderArticleHtml(page),
			jsonLd,
		},
		spa,
	);
}

export function renderLanderHtml(page: LanderPage, spa: SpaEntryAssets): string {
	const jsonLd: unknown[] = [
		organizationJsonLd(),
		webPageJsonLd(page),
		breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Learn", path: "/learn" },
			{ name: page.title, path: page.canonicalPath },
		]),
	];
	if (page.schemaProfile === "aggregator") {
		jsonLd.push(softwareApplicationJsonLd());
	}
	const faq = faqJsonLd(page.faqs);
	if (faq) jsonLd.push(faq);

	return renderFullHtml(
		{
			title: page.title,
			description: page.description,
			canonicalPath: page.canonicalPath,
			keywords: page.seoKeywords ?? page.targetKeyword,
			ogType: "article",
			bodyHtml: buildPrerenderArticleHtml(page),
			jsonLd,
		},
		spa,
	);
}

export function renderBlogIndexHtml(manifest: ContentManifest, spa: SpaEntryAssets): string {
	return renderFullHtml(
		{
			title: "Blog",
			description:
				"Prediction market aggregator guides, odds explainers, and line shopping resources from ClutchComet.",
			canonicalPath: "/blog",
			keywords: SITE_KEYWORDS,
			ogType: "website",
			bodyHtml: buildBlogIndexPrerenderHtml(manifest.blogPosts),
			jsonLd: [organizationJsonLd(), blogIndexJsonLd(manifest.blogPosts)],
		},
		spa,
	);
}

export function renderLearnIndexHtml(manifest: ContentManifest, spa: SpaEntryAssets): string {
	const items = manifest.landers
		.map(
			(l) =>
				`<li><a href="${escapeHtml(l.canonicalPath)}">${escapeHtml(l.title)}</a><p>${escapeHtml(l.description)}</p></li>`,
		)
		.join("\n");

	const bodyHtml = `<main class="blog-prerender" id="blog-prerender">
<nav class="content-prerender-nav"><a href="/">ClutchComet</a> · <a href="/blog">Blog</a></nav>
<article class="content-article">
<h1>Venue and market guides</h1>
<p class="direct-answer">Deep dives on prediction market venues, esports trading, and line shopping with ClutchComet. For aggregator guides, see the <a href="/blog">ClutchComet blog</a>.</p>
<ul class="content-index-list">${items}</ul>
</article>
</main>`;

	return renderFullHtml(
		{
			title: "Learn",
			description: "Prediction market venue guides and esports trading resources from ClutchComet.",
			canonicalPath: "/learn",
			ogType: "website",
			bodyHtml,
			jsonLd: [organizationJsonLd()],
		},
		spa,
	);
}

export function buildHomePrerenderBlock(): string {
	return `<main class="blog-prerender" id="home-prerender">
<article class="content-article">
<h1>ClutchComet: prediction market aggregator</h1>
<p class="direct-answer">${escapeHtml(SITE_DESCRIPTION)}</p>
<p><a href="/blog/what-is-a-prediction-market-aggregator">What is a prediction market aggregator?</a> · <a href="/blog/esports-prediction-market-aggregator">Esports aggregator</a> · <a href="/all-odds">All Odds</a> · <a href="/blog/best-prediction-market-aggregators-2026">Best aggregators 2026</a></p>
</article>
</main>`;
}

export function buildHomeJsonLdScripts(): string {
	const blocks = [organizationJsonLd(), webSiteJsonLd(), softwareApplicationJsonLd()];
	return blocks.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`).join("\n    ");
}

export function patchHomeIndexHtml(indexHtml: string): string {
	let out = indexHtml;
	if (!out.includes('name="keywords"')) {
		out = out.replace(
			'<meta name="description"',
			`<meta name="keywords" content="${escapeHtml(SITE_KEYWORDS)}" />\n\t\t<meta name="description"`,
		);
	}
	if (!out.includes("application/ld+json")) {
		out = out.replace("<script src=", `${buildHomeJsonLdScripts()}\n\t\t<script src=`);
	}
	if (!out.includes('id="home-prerender"')) {
		out = out.replace("<div id=\"root\">", `${buildHomePrerenderBlock()}\n\t\t<div id="root">`);
	}
	return out;
}
