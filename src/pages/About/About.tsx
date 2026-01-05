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
			<div className="About-section">
				<h2 className="About-section-title">Welcome to Level Up</h2>
				<p className="About-section-text">
					LevelUp is where gamers flex their instincts.
					Every trailer, every tournament, and every rumor is your chance to call the shots before anyone else.
				</p>
			<p className="About-section-text">
				A place to turn hot takes into leaderboard wins. Whether it's who wins Valorant Champs or what price Steam Machine drops at, your predictions will earn you rank, XP, and bragging rights.
			</p>
		</div>
		<div className="About-section">
			<h2 className="About-section-title">How It Works</h2>
			<p className="About-section-text">
				<strong>Pick a Market</strong><br />
				Choose anything you've got a take on. From "Will GTA VI cost more than $80?" to "Who wins the next Valorant match?"
			</p>
			<p className="About-section-text">
				<strong>Buy Shares in Your Prediction</strong><br />
				Every bet (or "share") costs between 1¢ and 99¢.
				That price = the odds.
				If something's trading at 10¢, it means the market gives it about a 10% chance.
			</p>
			<p className="About-section-text">
				When you buy, you're locking in that prediction.
			</p>
			<p className="About-section-text">
				<strong>Win $1 Per Correct Share</strong><br />
				When the event settles, each correct share pays out $1.
				If you bought 10 shares at 10¢ each, that's $1 spent and if you're right, you win $10.
			</p>
			<p className="About-section-text">
				<strong>We Settle Every Market</strong><br />
				Once the real world result is confirmed (like official game data, Metacritic scores, or tournament outcomes), we resolve it and update the leaderboard.
			</p>
			<p className="About-section-text">
				All free. All fair. All fun.
			</p>
		</div>
		{/* Commented out for production - prizes page disabled */}
			{/* <div className="About-section">
			<h2 className="About-section-title">Trading Competition Live Now</h2>
				<p className="About-section-text">
					The beta season is on. The best players are already climbing the leaderboard. And the top prize? A brand new Nintendo Switch 2.
				</p>
				<div className="About-button-container center">
					<Link to="/prizes">
						<Button variant="primary">See Prizes</Button>
					</Link>
				</div>
				<p className="About-section-text">
					Jump in now, make your picks, and prove you're built different.
					No real money. Just ego, instinct, and a need for loot.
				</p>
			</div> */}
			<div className="About-section">
				<h2 className="About-section-title">Start Trading</h2>
				<p className="About-section-text">
					We're live and ready for you to start trading predictions on your favorite games.
					Fund your account and begin making predictions on major releases, esports events, and more.
				</p>
				<div className="About-button-container center">
					<Link to="/predictions">
						<Button variant="primary">Start Trading</Button>
					</Link>
				</div>
			</div>
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
