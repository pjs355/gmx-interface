import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

import type { BlogPost, ContentFaq, ContentManifest, ContentSource, LanderPage } from "./types";
import { appendContentHubLinks } from "./contentHub";

const SITE_ORIGIN = "https://clutchcomet.com";

type RawFrontmatter = {
	title?: string;
	description?: string;
	slug?: string;
	publishedAt?: string;
	updatedAt?: string;
	pillar?: string;
	funnelStage?: string;
	targetKeyword?: string;
	faqs?: ContentFaq[];
	sources?: ContentSource[];
	compareType?: string;
	venue?: string;
	sortPriority?: number;
	schemaProfile?: string;
	seoKeywords?: string;
};

function coerceDate(value: unknown, fallback: string): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === "string" && value.trim()) return value.trim();
	return fallback;
}

function slugFromFilename(filename: string): string {
	return filename.replace(/\.md$/, "");
}

function extractDirectAnswer(markdownBody: string): string {
	const trimmed = markdownBody.trim();
	if (!trimmed) return "";
	const firstBlock = trimmed.split(/\n\n+/)[0] ?? "";
	return firstBlock.replace(/^#+\s.*\n/m, "").trim();
}

function renderMarkdown(body: string): string {
	marked.setOptions({ gfm: true, breaks: false });
	const html = marked.parse(body) as string;
	return wrapContentTables(html);
}

function wrapContentTables(html: string): string {
	return html
		.replace(/<table>/g, '<div class="content-table-wrap"><table>')
		.replace(/<\/table>/g, "</table></div>");
}

function renderFaqSection(faqs: ContentFaq[]): string {
	if (faqs.length === 0) return "";
	const items = faqs
		.map(
			(faq) =>
				`<div class="content-faq-item"><h3 class="content-faq-question">${escapeHtml(faq.question)}</h3><p class="content-faq-answer">${escapeHtml(faq.answer)}</p></div>`,
		)
		.join("\n");
	return `<section class="content-faq" aria-label="Frequently asked questions"><h2>Frequently asked questions</h2>${items}</section>`;
}

function renderSourcesSection(sources: ContentSource[]): string {
	if (sources.length === 0) return "";
	const items = sources
		.map(
			(s) =>
				`<li><a href="${escapeAttr(s.url)}" rel="noopener noreferrer">${escapeHtml(s.label)}</a></li>`,
		)
		.join("\n");
	return `<section class="content-sources"><h2>Sources</h2><ul>${items}</ul></section>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
	return escapeHtml(value);
}

function parseFile(
	filePath: string,
	kind: "blog" | "lander",
): BlogPost | LanderPage | null {
	const raw = fs.readFileSync(filePath, "utf-8");
	const { data, content } = matter(raw);
	const fm = data as RawFrontmatter;

	const filename = path.basename(filePath);
	const slug = (fm.slug ?? slugFromFilename(filename)).trim();
	const title = (fm.title ?? "").trim();
	const description = (fm.description ?? "").trim();

	if (!slug || !title || !description) {
		console.warn(`[content-build] Skipping ${filePath}: missing slug, title, or description`);
		return null;
	}

	const publishedAt = coerceDate(fm.publishedAt, new Date().toISOString().slice(0, 10));
	const updatedAt = coerceDate(fm.updatedAt, publishedAt);
	const htmlBody = appendContentHubLinks(renderMarkdown(content.trim()), slug);
	const directAnswer = extractDirectAnswer(content.trim());
	const faqs = Array.isArray(fm.faqs) ? fm.faqs : [];
	const sources = Array.isArray(fm.sources) ? fm.sources : [];

	const base = {
		title,
		description,
		slug,
		publishedAt,
		updatedAt,
		pillar: (fm.pillar ?? "general").trim(),
		funnelStage: (fm.funnelStage ?? "tofu").trim(),
		targetKeyword: (fm.targetKeyword ?? title).trim(),
		sortPriority: typeof fm.sortPriority === "number" ? fm.sortPriority : undefined,
		schemaProfile: typeof fm.schemaProfile === "string" ? fm.schemaProfile.trim() : undefined,
		seoKeywords: typeof fm.seoKeywords === "string" ? fm.seoKeywords.trim() : undefined,
		faqs,
		sources,
		markdownBody: content.trim(),
		htmlBody,
		directAnswer,
	};

	if (kind === "blog") {
		return {
			...base,
			kind: "blog",
			canonicalPath: `/blog/${slug}`,
		};
	}

	return {
		...base,
		kind: "lander",
		canonicalPath: `/learn/${slug}`,
	};
}

export function buildPrerenderArticleHtml(page: BlogPost | LanderPage): string {
	const faqHtml = renderFaqSection(page.faqs);
	const sourcesHtml = renderSourcesSection(page.sources);
	const blogLink =
		page.kind === "blog"
			? `<a href="/blog">Blog</a>`
			: `<a href="/blog">Blog</a> · <a href="/learn/${page.slug}">Learn</a>`;

	return `<main class="blog-prerender" id="blog-prerender">
<nav class="content-prerender-nav"><a href="/">ClutchComet</a> · ${blogLink}</nav>
<article class="content-article">
<h1>${escapeHtml(page.title)}</h1>
${page.directAnswer ? `<p class="direct-answer">${escapeHtml(page.directAnswer)}</p>` : ""}
<div class="content-body">${page.htmlBody}</div>
${faqHtml}
${sourcesHtml}
<p class="content-cta"><a href="/blog/what-is-a-prediction-market-aggregator">Prediction market aggregator guide</a> · <a href="/">Trade on ClutchComet</a></p>
</article>
</main>`;
}

export function buildBlogIndexPrerenderHtml(posts: BlogPost[]): string {
	const items = [...posts]
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
		.map(
			(post) =>
				`<li><a href="/blog/${escapeAttr(post.slug)}">${escapeHtml(post.title)}</a><p>${escapeHtml(post.description)}</p></li>`,
		)
		.join("\n");

	return `<main class="blog-prerender" id="blog-prerender">
<nav class="content-prerender-nav"><a href="/">ClutchComet</a> · <a href="/blog">Blog</a></nav>
<article class="content-article">
<h1>ClutchComet Blog</h1>
<p class="direct-answer">Guides on prediction markets, odds, line shopping, and trading across Polymarket, Kalshi, and other venues from one ClutchComet balance.</p>
<ul class="content-index-list">${items}</ul>
</article>
</main>`;
}

export function loadContentManifest(projectRoot: string): ContentManifest {
	const blogDir = path.join(projectRoot, "content/blog");
	const landerDir = path.join(projectRoot, "content/landers");

	const blogPosts: BlogPost[] = [];
	const landers: LanderPage[] = [];

	if (fs.existsSync(blogDir)) {
		for (const file of fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"))) {
			const parsed = parseFile(path.join(blogDir, file), "blog");
			if (parsed && parsed.kind === "blog") blogPosts.push(parsed);
		}
	}

	if (fs.existsSync(landerDir)) {
		for (const file of fs.readdirSync(landerDir).filter((f) => f.endsWith(".md"))) {
			const parsed = parseFile(path.join(landerDir, file), "lander");
			if (parsed && parsed.kind === "lander") landers.push(parsed);
		}
	}

	blogPosts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
	landers.sort((a, b) => {
		const ap = a.sortPriority ?? 999;
		const bp = b.sortPriority ?? 999;
		if (ap !== bp) return ap - bp;
		return a.title.localeCompare(b.title);
	});

	return {
		generatedAt: new Date().toISOString(),
		blogPosts,
		landers,
	};
}

export function absoluteUrl(pathname: string): string {
	const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${SITE_ORIGIN}${normalized}`;
}
