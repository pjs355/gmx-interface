import type { ContentManifest } from "./types";
import { absoluteUrl } from "./parseContentFiles";

type SitemapEntry = {
	path: string;
	lastmod: string;
	changefreq: "weekly" | "monthly";
	priority: string;
};

const HIGH_PRIORITY_PATHS = new Set([
	"/blog/what-is-a-prediction-market-aggregator",
	"/blog/esports-prediction-market-aggregator",
	"/blog/best-prediction-market-aggregators-2026",
	"/learn/line-shopping",
]);

function priorityForPath(path: string): string {
	if (path === "/") return "1.0";
	if (HIGH_PRIORITY_PATHS.has(path)) return "0.95";
	if (path.startsWith("/learn/") || path.startsWith("/blog/")) return "0.8";
	return "0.7";
}

export function buildSitemapXml(manifest: ContentManifest): string {
	const today = new Date().toISOString().slice(0, 10);
	const entries: SitemapEntry[] = [
		{ path: "/", lastmod: today, changefreq: "weekly", priority: "1.0" },
		{ path: "/about", lastmod: today, changefreq: "monthly", priority: "0.7" },
		{ path: "/blog", lastmod: today, changefreq: "weekly", priority: "0.8" },
		{ path: "/learn", lastmod: today, changefreq: "weekly", priority: "0.8" },
	];

	for (const post of manifest.blogPosts) {
		entries.push({
			path: post.canonicalPath,
			lastmod: post.updatedAt,
			changefreq: "monthly",
			priority: priorityForPath(post.canonicalPath),
		});
	}

	for (const lander of manifest.landers) {
		entries.push({
			path: lander.canonicalPath,
			lastmod: lander.updatedAt,
			changefreq: "monthly",
			priority: priorityForPath(lander.canonicalPath),
		});
	}

	const body = entries
		.map(
			(entry) => `  <url>
    <loc>${absoluteUrl(entry.path)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function buildRobotsTxt(): string {
	return `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;
}
