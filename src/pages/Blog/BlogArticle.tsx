import { Link, useParams } from "react-router-dom";

import SEO from "@/components/Common/SEO";
import { getBlogPostBySlug, getRelatedBlogPosts } from "@/content/contentApi";
import { ContentHubLinks } from "@/content/contentHubLinks";
import { blogPostingJsonLd, breadcrumbJsonLd, faqPageJsonLd, organizationJsonLd, softwareApplicationJsonLd } from "@/content/seoSchema";
import { useHideContentPrerender } from "@/content/useHideContentPrerender";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";

import "./contentPages.scss";

export function BlogArticle() {
	useHideContentPrerender();
	const { slug = "" } = useParams<{ slug: string }>();
	const post = getBlogPostBySlug(slug);

	if (!post) {
		return (
			<>
				<SEO title="Not found | ClutchComet" noIndex canonicalPath={`/blog/${slug}`} />
				<PageNotFound />
			</>
		);
	}

	const related = getRelatedBlogPosts(post);

	const jsonLd = [
		organizationJsonLd(),
		blogPostingJsonLd(post),
		breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Blog", path: "/blog" },
			{ name: post.title, path: post.canonicalPath },
		]),
	];
	if (post.schemaProfile === "aggregator") {
		jsonLd.push(softwareApplicationJsonLd());
	}
	const faqSchema = faqPageJsonLd(post.faqs);
	if (faqSchema) jsonLd.push(faqSchema);

	return (
		<div className="content-page">
			<SEO
				title={`${post.title} | ClutchComet`}
				description={post.description}
				keywords={post.seoKeywords ?? post.targetKeyword}
				canonicalPath={post.canonicalPath}
				type="article"
				jsonLd={jsonLd}
			/>
			<div className="content-container">
				<nav className="content-breadcrumb">
					<Link to="/">Home</Link>
					<span aria-hidden="true"> / </span>
					<Link to="/blog">Blog</Link>
				</nav>

				<article className="content-article">
					<header className="content-hero content-hero--article">
						<h1 className="content-title">{post.title}</h1>
						{post.directAnswer ? <p className="content-lead">{post.directAnswer}</p> : null}
					</header>

					<div
						className="content-body"
						dangerouslySetInnerHTML={{ __html: post.htmlBody }}
					/>

					{post.faqs.length > 0 ? (
						<section className="content-section content-faq-block" aria-label="FAQ">
							<h2 className="content-section-title">Frequently asked questions</h2>
							{post.faqs.map((faq) => (
								<div key={faq.question} className="content-faq-block__item">
									<h3 className="content-faq-block__question">{faq.question}</h3>
									<p className="content-faq-block__answer">{faq.answer}</p>
								</div>
							))}
						</section>
					) : null}

					{post.sources.length > 0 ? (
						<section className="content-section content-sources-block">
							<h2 className="content-section-title">Sources</h2>
							<ul>
								{post.sources.map((source) => (
									<li key={source.url}>
										<a href={source.url} target="_blank" rel="noopener noreferrer">
											{source.label}
										</a>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{related.length > 0 ? (
						<section className="content-section">
							<h2 className="content-section-title">Related guides</h2>
							<ul className="content-related-list">
								{related.map((item) => (
									<li key={item.slug}>
										<Link to={`/blog/${item.slug}`}>{item.title}</Link>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{!["what-is-a-prediction-market-aggregator", "esports-prediction-market-aggregator", "best-prediction-market-aggregators-2026"].includes(
						slug,
					) ? (
						<ContentHubLinks />
					) : null}

					<section className="content-section content-cta-block">
						<p className="content-body">
							ClutchComet executes on Polymarket, Kalshi, Limitless, and Predict from one balance,
							with smart order routing on matched events. ClutchComet also shows pricing from five
							comparison-only venues on All Odds: Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid.
						</p>
						<Link className="brand-outline-button" to="/">
							Start trading on ClutchComet
						</Link>
					</section>
				</article>
			</div>
		</div>
	);
}

export default BlogArticle;
