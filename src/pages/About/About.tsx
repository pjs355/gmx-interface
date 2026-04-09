import { Link } from "react-router-dom";
import Button from "components/Button/Button";

import "./About.scss";

export function About() {
	return (
		<div className="About">
			<div className="About-content">
		<div className="About-header">
			<h1 className="About-title">
				<span className="About-title-white">Think you know gaming?</span>
				<span className="About-title-purple">Prove it.</span>
			</h1>
			<p className="About-subtitle">
				Predict what happens next across esports, consoles, and your favorite titles. All for bragging rights, glory, and prizes.
			</p>
		</div>
				{/* Video temporarily disabled
				<div className="About-video-container">
					<iframe
						width="560"
						height="315"
						src="https://www.youtube.com/embed/Q4cVz67E4bU"
						title="YouTube video player"
						frameBorder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowFullScreen
					></iframe>
				</div>
			*/}

				{/* How It Works Section */}
			<div className="About-section">
					<h2 className="About-section-title">How It Works</h2>
					
					<div className="About-step">
						<div className="About-step-number">1</div>
						<div className="About-step-content">
							<h3 className="About-step-title">Pick a Market</h3>
							<p className="About-section-text">
								Choose anything you have a take on, from Steam player peaks to award winners.
							</p>
						</div>
					</div>

					<div className="About-step">
						<div className="About-step-number">2</div>
						<div className="About-step-content">
							<h3 className="About-step-title">Buy Shares</h3>
							<p className="About-section-text">
								Shares trade between 1 cent and 99 cents. That price is the market implied probability.
								10 cents means the market is pricing the outcome at 10 percent.
							</p>
						</div>
					</div>

					<div className="About-step">
						<div className="About-step-number">3</div>
						<div className="About-step-content">
							<h3 className="About-step-title">If You're Right, Your Shares Settle to $1</h3>
				<p className="About-section-text">
								When the outcome is confirmed, each correct share pays $1.
							</p>
							<div className="About-example">
								<h4 className="About-example-title">Example</h4>
								<ul className="About-example-list">
									<li>Buy 10 shares at 10 cents</li>
									<li>You spend $1</li>
									<li>If you're right, you receive $10</li>
								</ul>
							</div>
						</div>
					</div>

					<div className="About-step">
						<div className="About-step-number">4</div>
						<div className="About-step-content">
							<h3 className="About-step-title">Market Resolves</h3>
			<p className="About-section-text">
								Once the real world result is confirmed using the market's listed source, we resolve the market. You can claim your winnings under your portfolio page.
			</p>
		</div>
					</div>
				</div>

				{/* Funding Your Account Section */}
				<div className="About-section">
					<h2 className="About-section-title">Funding Your Account</h2>
					<p className="About-section-text">
						Adding funds is quick and happens right inside LevelUp. Your balance is held as USDC on Base. 
					</p>
					
					<h3 className="About-subsection-title">Deposit Options</h3>
					<ul className="About-list">
						<li>Debit card</li>
						<li>Apple Pay or Google Pay</li>
						<li>Transfer from Coinbase</li>
						<li>Send USDC on Base from a crypto wallet or another exchange</li>
					</ul>

					<div className="About-warning">
						<h3 className="About-warning-title">⚠️ Sending from a Wallet or Exchange</h3>
						<p className="About-section-text">
							Only send USDC on Base to your LevelUp wallet address.  We have NO control over your wallet / funds so if you send a different asset or send USDC on a different network, funds may be lost permanently.
						</p>
					</div>
				</div>

				{/* Withdrawals Section */}
				<div className="About-section">
					<h2 className="About-section-title">Withdrawals</h2>
					<p className="About-section-text">
						For now, withdrawals are crypto only. You can withdraw USDC on Base to:
					</p>
					<ul className="About-list">
						<li>Coinbase</li>
						<li>A private crypto wallet that supports Base</li>
						<li>Another exchange that supports USDC on Base</li>
					</ul>
					<p className="About-section-text">
						We will be adding more withdrawal options soon.
					</p>
				</div>

				{/* Start Trading Section */}
			<div className="About-section">
				<h2 className="About-section-title">Start Trading</h2>
				<p className="About-section-text">
					LevelUp is live and ready for you to start trading predictions on your favorite games.
					Fund your account and begin making predictions on major releases, esports events, and more.
				</p>
				<div className="About-button-container center">
					<Link to="/">
						<Button variant="primary">Start Trading</Button>
					</Link>
				</div>
			</div>

				{/* Contact Section */}
			<div className="About-section">
				<h2 className="About-section-title">Got Ideas?</h2>
				<p className="About-section-text">
					Have a wild market idea or want to collab?
					Hit us up because we actually read every message.
				</p>
				<div className="About-button-container center">
					<Button variant="primary" to="mailto:brendan@levelup.markets">
						Contact Us
					</Button>
				</div>
			</div>
			</div>
		</div>
	);
}

export default About;
