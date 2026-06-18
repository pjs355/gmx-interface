import contentManifest from "virtual:content-manifest";

import type { BlogPost, ContentManifest, LanderPage } from "@/content/types";

const manifest = contentManifest as ContentManifest;

export function getContentManifest(): ContentManifest {
	return manifest;
}

export function getBlogPosts(): BlogPost[] {
	return manifest.blogPosts;
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
	return manifest.blogPosts.find((post) => post.slug === slug);
}

export function getLanders(): LanderPage[] {
	return manifest.landers;
}

export function getLanderBySlug(slug: string): LanderPage | undefined {
	return manifest.landers.find((lander) => lander.slug === slug);
}

export function getRelatedBlogPosts(post: BlogPost, limit = 3): BlogPost[] {
	const aggregatorSlugs = new Set([
		"what-is-a-prediction-market-aggregator",
		"esports-prediction-market-aggregator",
		"best-prediction-market-aggregators-2026",
	]);

	const aggregatorPosts = manifest.blogPosts.filter((candidate) =>
		aggregatorSlugs.has(candidate.slug),
	);

	const pillarMatches = manifest.blogPosts.filter(
		(candidate) =>
			candidate.slug !== post.slug &&
			candidate.pillar === post.pillar &&
			!aggregatorSlugs.has(candidate.slug),
	);

	const pool = [...aggregatorPosts, ...pillarMatches];
	const seen = new Set<string>();
	const deduped: BlogPost[] = [];
	for (const item of pool) {
		if (item.slug === post.slug || seen.has(item.slug)) continue;
		seen.add(item.slug);
		deduped.push(item);
	}
	return deduped.slice(0, limit);
}
