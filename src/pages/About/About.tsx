import { Link } from "react-router-dom";
import Footer from "components/Footer/Footer";
import Button from "components/Button/Button";

import "./About.scss";

export function About() {
	return (
		<div className="About">
			<div className="About-content">
				<div className="About-header">
					<h1 className="About-title">
						A Prediction Market For Gamers, By Gamers
					</h1>
				</div>
				<div className="About-section">
					<h2 className="About-section-title">Welcome to Level Up</h2>
					<p className="About-section-text">
						Level Up is a prediction market platform where gamers
						can bet on the outcomes of their favorite games and
						esports events. We're built by gamers, for gamers, and
						we're passionate about bringing the excitement of
						prediction markets to the gaming community.
					</p>
				</div>

				<div className="About-section About-section-highlight">
					<h2 className="About-section-title">Trading Competition</h2>
					<p className="About-section-text">
						We're currently in our <strong>test phase</strong>, and
						we're running a trading competition for all early
						adopters! The competition is your chance to win amazing
						prizes, including a <strong>Nintendo Switch</strong>!
					</p>
					<p className="About-section-text">
						Test out the platform, trade on your favorite markets,
						and compete against other gamers for the top spot on the
						leaderboard.
					</p>
					<div className="About-button-container">
						<Link to="/prizes">
							<Button variant="primary">
								View Prizes & Leaderboard
							</Button>
						</Link>
					</div>
				</div>

				<div className="About-section">
					<h2 className="About-section-title">Coming Soon</h2>
					<p className="About-section-text">
						Once the trading competition concludes, we'll be going
						live shortly thereafter. We're working hard to bring you
						the best prediction market experience for gaming and
						esports.
					</p>
				</div>

				<div className="About-section About-section-important">
					<h2 className="About-section-title">
						Important Information
					</h2>
					<p className="About-section-text">
						We are currently working on obtaining our license from
						the{" "}
						<strong>
							CFTC (Commodity Futures Trading Commission)
						</strong>{" "}
						in the United States. While we work through this
						regulatory process, we will not be available for live
						trading in the United States.
					</p>
					<p className="About-section-text">
						However,{" "}
						<strong>
							Americans are allowed to participate in our trading
							competition
						</strong>{" "}
						during this test phase. This is your chance to try out
						the platform and win great prizes!
					</p>
				</div>

				<div className="About-section">
					<h2 className="About-section-title">What's Next?</h2>
					<p className="About-section-text">
						Join us now to get a head start on the competition,
						learn how the platform works, and be ready when we go
						live. Login, claim your test USD, and start trading on
						your favorite gaming markets today!
					</p>
					<div className="About-button-container">
						<Link to="/predictions">
							<Button variant="secondary">Explore Markets</Button>
						</Link>
						<Link to="/get_test_usdc">
							<Button variant="primary">Get Test USD</Button>
						</Link>
					</div>
				</div>
			</div>

			<Footer />
		</div>
	);
}

export default About;
