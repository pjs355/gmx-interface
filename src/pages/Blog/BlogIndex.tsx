import { Link } from "react-router-dom";

import SEO from "@/components/Common/SEO";
import { getBlogPosts } from "@/content/contentApi";
import { ContentHubLinks } from "@/content/contentHubLinks";
import { organizationJsonLd, webSiteJsonLd } from "@/content/seoSchema";
import { SITE_KEYWORDS } from "@/config/siteMetadata";

import "./contentPages.scss";

export function BlogIndex() {
	const posts = getBlogPosts();

	return (
		<div className="content-page">
			<SEO
				title="Prediction Market Aggregator Blog | ClutchComet"
				description="Prediction market aggregator guides, odds explainers, and line shopping resources from ClutchComet."
				keywords={SITE_KEYWORDS}
				canonicalPath="/blog"
				jsonLd={[organizationJsonLd(), webSiteJsonLd()]}
			/>
			<div className="content-container">
				<header className="content-hero">
					<div className="content-eyebrow">ClutchComet Blog</div>
					<h1 className="content-title">Prediction market aggregator guides</h1>
					<p className="content-lead">
						Learn how prediction markets work, how to compare odds across Polymarket, Kalshi, and other
						venues, and how ClutchComet aggregates nine markets from one balance.
					</p>
				</header>

				<ContentHubLinks />

				<section className="content-section">
					<ul className="content-post-list">
						{posts.map((post) => (
							<li key={post.slug} className="content-post-list__item">
								<Link className="content-post-list__link" to={`/blog/${post.slug}`}>
									<h2 className="content-post-list__title">{post.title}</h2>
									<p className="content-post-list__desc">{post.description}</p>
									<span className="content-post-list__meta">{post.publishedAt}</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}

export default BlogIndex;
