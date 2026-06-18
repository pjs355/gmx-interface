import { Link, useParams } from "react-router-dom";

import SEO from "@/components/Common/SEO";
import { getLanderBySlug, getLanders } from "@/content/contentApi";
import {
	breadcrumbJsonLd,
	faqPageJsonLd,
	organizationJsonLd,
	webPageJsonLd,
} from "@/content/seoSchema";
import { useHideContentPrerender } from "@/content/useHideContentPrerender";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";

import "../Blog/contentPages.scss";

export function LearnIndex() {
	useHideContentPrerender();
	const landers = getLanders();

	return (
		<div className="content-page">
			<SEO
				title="Learn | ClutchComet"
				description="Prediction market venue guides and esports trading resources from ClutchComet."
				canonicalPath="/learn"
				jsonLd={[organizationJsonLd()]}
			/>
			<div className="content-container">
				<header className="content-hero">
					<div className="content-eyebrow">Learn</div>
					<h1 className="content-title">Venue and market guides</h1>
					<p className="content-lead">
						Deep dives on prediction market venues, esports trading, and how ClutchComet compares
						odds across nine markets.
					</p>
				</header>
				<section className="content-section">
					<ul className="content-post-list">
						{landers.map((lander) => (
							<li key={lander.slug} className="content-post-list__item">
								<Link className="content-post-list__link" to={`/learn/${lander.slug}`}>
									<h2 className="content-post-list__title">{lander.title}</h2>
									<p className="content-post-list__desc">{lander.description}</p>
								</Link>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}

export function LearnPage() {
	useHideContentPrerender();
	const { slug = "" } = useParams<{ slug: string }>();
	const lander = getLanderBySlug(slug);

	if (!lander) {
		return (
			<>
				<SEO title="Not found | ClutchComet" noIndex canonicalPath={`/learn/${slug}`} />
				<PageNotFound />
			</>
		);
	}

	const jsonLd = [
		organizationJsonLd(),
		webPageJsonLd(lander),
		breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Learn", path: "/learn" },
			{ name: lander.title, path: lander.canonicalPath },
		]),
	];
	const faqSchema = faqPageJsonLd(lander.faqs);
	if (faqSchema) jsonLd.push(faqSchema);

	return (
		<div className="content-page">
			<SEO
				title={`${lander.title} | ClutchComet`}
				description={lander.description}
				keywords={lander.seoKeywords ?? lander.targetKeyword}
				canonicalPath={lander.canonicalPath}
				type="article"
				jsonLd={jsonLd}
			/>
			<div className="content-container">
				<nav className="content-breadcrumb">
					<Link to="/">Home</Link>
					<span aria-hidden="true"> / </span>
					<Link to="/learn">Learn</Link>
				</nav>

				<article className="content-article">
					<header className="content-hero content-hero--article">
						<h1 className="content-title">{lander.title}</h1>
						{lander.directAnswer ? <p className="content-lead">{lander.directAnswer}</p> : null}
					</header>

					<div
						className="content-body"
						dangerouslySetInnerHTML={{ __html: lander.htmlBody }}
					/>

					{lander.faqs.length > 0 ? (
						<section className="content-section content-faq-block" aria-label="FAQ">
							<h2 className="content-section-title">Frequently asked questions</h2>
							{lander.faqs.map((faq) => (
								<div key={faq.question} className="content-faq-block__item">
									<h3 className="content-faq-block__question">{faq.question}</h3>
									<p className="content-faq-block__answer">{faq.answer}</p>
								</div>
							))}
						</section>
					) : null}

					{lander.sources.length > 0 ? (
						<section className="content-section content-sources-block">
							<h2 className="content-section-title">Sources</h2>
							<ul>
								{lander.sources.map((source) => (
									<li key={source.url}>
										<a href={source.url} target="_blank" rel="noopener noreferrer">
											{source.label}
										</a>
									</li>
								))}
							</ul>
						</section>
					) : null}

					<section className="content-section content-cta-block">
						<p className="content-body">
							ClutchComet executes on Polymarket, Kalshi, Limitless, and Predict from one balance,
							with smart order routing on matched events. ClutchComet also shows pricing from five
							comparison-only venues on All Odds.
						</p>
						<Link className="brand-outline-button" to="/">
							Trade on ClutchComet
						</Link>
					</section>
				</article>
			</div>
		</div>
	);
}

export default LearnPage;
