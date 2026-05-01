import type { ReactNode } from "react";
import Button from "components/Button/Button";

import "./About.scss";

const VENUES = ["Polymarket", "Kalshi", "Predict", "Limitless", "LevelUp"];

const STEPS: Array<{ title: string; body: ReactNode }> = [
	{
		title: "Create an account",
		body: "Sign up with your email and create your LevelUp account.",
	},
	{
		title: "Add funds",
		body: (
			<>
				Deposit into your LevelUp account using the built-in deposit flow.
				Your account has one balance — you do not need to manually move
				money between Polymarket, Kalshi, Predict, Limitless, and LevelUp.
				We handle the routing behind the scenes.
			</>
		),
	},
	{
		title: "Find a market",
		body: "Browse esports markets, compare prices across connected venues, and decide what you want to trade.",
	},
	{
		title: "Trade your way",
		body: "Choose the venue yourself, or use smart routing to get the best available price across supported markets.",
	},
	{
		title: "Track everything in one place",
		body: "Your positions, balance, trades, and winnings are all shown inside LevelUp.",
	},
];

export function About() {
	return (
		<div className="about-page">
			<div className="about-container">
				<header className="about-hero">
					<div className="about-eyebrow">
						Prediction Market Trading Aggregator
					</div>
					<h1 className="about-title">
						Trade prediction markets without jumping between apps.
					</h1>
					<p className="about-lead">
						LevelUp connects the biggest prediction markets into one
						simple trading screen.
					</p>
				</header>

				<section className="about-section">
					<div className="about-venues" aria-label="Supported venues">
						{VENUES.map((venue) => (
							<span key={venue} className="about-venues__chip">
								{venue}
							</span>
						))}
					</div>
					<p className="about-muted about-muted--small">
						More venues coming soon.
					</p>
					<p className="about-pull">
						See the best prices. Pick where you want to trade. Or use
						smart routing to get the best available execution across
						venues.
					</p>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">Built for esports first</h2>
					<p className="about-body">
						We are starting with Counter-Strike markets. More esports are
						coming soon. After that, we are adding broader sports markets
						and more prediction venues.
					</p>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">How it works</h2>
					<ol className="about-steps">
						{STEPS.map((step, index) => (
							<li key={step.title} className="about-step">
								<span className="about-step__num">
									{String(index + 1).padStart(2, "0")}
								</span>
								<div className="about-step__content">
									<h3 className="about-step__title">
										{step.title}
									</h3>
									<p className="about-step__body">{step.body}</p>
								</div>
							</li>
						))}
					</ol>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">
						One balance across markets
					</h2>
					<p className="about-body">
						LevelUp is built so you do not need to worry about where your
						funds are sitting. You deposit once. You trade across
						connected markets. We manage the bankroll routing
						automatically.
					</p>
					<p className="about-muted">
						Your funds are held in a Privy crypto wallet connected to
						your account. LevelUp does not have custody or control over
						your funds.
					</p>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">Enabling Kalshi trading</h2>
					<p className="about-body">
						Kalshi trading requires identity verification through DFlow.
					</p>
					<p className="about-body">
						You can enable Kalshi trading from your profile. Once
						verified, Kalshi markets can be traded through LevelUp where
						supported.
					</p>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">Funding your account</h2>
					<p className="about-body">
						Please use the normal deposit flow inside LevelUp.
					</p>
					<div className="about-warning">
						<h3 className="about-warning__title">
							Sending the wrong token or network can mean permanent
							loss.
						</h3>
						<p className="about-warning__body">
							If you deposit manually, only send the exact token and
							network shown on the Transfers page. We do not support
							token recovery right now.
						</p>
					</div>
				</section>

				<section className="about-section">
					<h2 className="about-section-title">Start trading</h2>
					<p className="about-body">
						There are a lot of places to trade predictions. LevelUp is
						built for the trader who wants the best available price
						without jumping between five different apps.
					</p>
					<p className="about-body">
						Create an account, fund once, compare every connected market,
						and trade smarter.
					</p>
					<div className="about-cta">
						<Button variant="primary" to="/">
							Start trading
						</Button>
					</div>
				</section>

				<section className="about-section about-section--last">
					<h2 className="about-section-title">Got ideas?</h2>
					<p className="about-body">
						Have a market idea, venue request, partnership idea, or
						feature you want us to build? Send it over. We actually read
						every message.
					</p>
					<div className="about-cta">
						<Button
							variant="secondary"
							to="mailto:brendan@levelup.markets"
						>
							Send a message
						</Button>
					</div>
				</section>
			</div>
		</div>
	);
}

export default About;
