import React from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import "./Prizes.scss";
import nintendoSwitch2 from "@/assets/img/Nintendo-Switch-2.png";
import nintendoSwitch2Box from "@/assets/img/Nintendo-Switch-2-box.jpeg";
import steam50 from "@/assets/img/steam-50.png";
import steam20 from "@/assets/img/steam-20.png";

export default function Prizes() {
	const navigate = useNavigate();
	const { authenticated, login } = usePrivy();

	const handlePrizeCardClick = () => {
		if (authenticated) {
			navigate("/leaderboard");
		} else {
			login();
		}
	};

	return (
		<div className="prizes-page-container">
			{/* Hero Section with Nintendo Switch */}
			<div className="prizes-hero-section">
				{/* Large "Win" Text - Behind the image */}
				<h1 className="prizes-win-text">Win</h1>

				{/* Nintendo Switch Image Container */}
				<div className="prizes-image-container">
					{/* Nintendo Switch Image */}
					<div className="prizes-image-wrapper">
						<img
							src={nintendoSwitch2}
							alt="Nintendo Switch 2"
							className="prizes-switch-image"
						/>
					</div>
				</div>

				{/* Subtitle Text */}
				<div className="prizes-subtitle-container">
					<p className="prizes-subtitle-text">
						Trade your favorite predictions for a chance to win.
						Ranking is based on profits made from trading.
					</p>
					<p className="prizes-subtitle-highlight">
						Absolutely free to play. No real money involved.
					</p>
				</div>
			</div>

			<div className="prizes-grid">
				{/* Grand Prize Card */}
				<div
					className="prize-card-modern prize-card-gold"
					onClick={handlePrizeCardClick}
					style={{ cursor: "pointer" }}
				>
					<div className="prize-card-image-container">
						<img
							src={nintendoSwitch2Box}
							alt="Nintendo Switch 2 Console"
							className="prize-card-image"
						/>
					</div>
					<div className="prize-card-content">
						<div className="prize-card-title prize-card-title-gold">
							Nintendo Switch 2
						</div>
						<div className="prize-card-description">
							1 winner. The ultimate portable console to level up
							your game.
						</div>
					</div>
				</div>

				{/* Second Place Card */}
				<div
					className="prize-card-modern prize-card-silver"
					onClick={handlePrizeCardClick}
					style={{ cursor: "pointer" }}
				>
					<div className="prize-card-image-container">
						<img
							src={steam50}
							alt="$50 Steam Gift Card"
							className="prize-card-image"
						/>
					</div>
					<div className="prize-card-content">
						<div className="prize-card-title prize-card-title-silver">
							3 × $50 Steam Gift Card
						</div>
						<div className="prize-card-description">
							Three winners. Load up your library with the latest
							hits.
						</div>
					</div>
				</div>

				{/* Third Place Card */}
				<div
					className="prize-card-modern prize-card-bronze"
					onClick={handlePrizeCardClick}
					style={{ cursor: "pointer" }}
				>
					<div className="prize-card-image-container">
						<img
							src={steam20}
							alt="$20 Steam Gift Card"
							className="prize-card-image"
						/>
					</div>
					<div className="prize-card-content">
						<div className="prize-card-title prize-card-title-bronze">
							5 × $20 Steam Gift Card
						</div>
						<div className="prize-card-description">
							Five winners. Grab DLCs, indies, or stash for a
							sale.
						</div>
					</div>
				</div>
			</div>

			{/* Full Width Disclaimer Section */}
			<div className="prizes-disclaimer-section">
				<div className="prizes-disclaimer-content">
					<div className="prizes-disclaimer-title">
						Official Giveaway Rules and Terms
					</div>
					<div>
						<p>
							Participants must be 18 years of age or older and
							reside in a jurisdiction where participation is
							legally permitted. Entry is void where prohibited by
							law, including but not limited to countries or
							territories subject to U.S. or international
							sanctions, such as Cuba, Iran, North Korea, Syria,
							Russia, Belarus, and Crimea (Ukraine).
						</p>
						<p>
							The LevelUp Beta Launch Giveaway ends on{" "}
							<strong>December 15, 2025, at 5:00 PM EST</strong>.
							All prizes, eligibility criteria, and distribution
							methods are subject to these official contest rules.
						</p>

						<h3>Determination of Winners</h3>
						<p>
							Winners are determined based on their prediction
							profit and loss during the competition period. The
							leaderboard ranks participants by highest overall
							profit ("Most Profitable Trader"). In the case of a
							tie, winners will be determined by the earliest
							submission time of their final prediction.
						</p>

						<h3>Prize Information</h3>
						<p>Prizes include:</p>
						<ul>
							<li>1 × Nintendo Switch 2</li>
							<li>3 × $50 Steam Gift Cards</li>
							<li>5 × $20 Steam Gift Cards</li>
						</ul>
						<p>
							If a winner cannot receive a physical or digital
							prize due to legal restrictions, shipping
							limitations, or other factors beyond LevelUp's
							control, the winner will receive the cash equivalent
							of that prize at LevelUp's sole discretion. The cash
							equivalent will be sent to the winner's LevelUp
							wallet in the form of USDC on Base.
						</p>

						<h3>Test Funds</h3>
						<ul>
							<li>
								Each verified participant will receive $500 in
								test money (NOT REAL MONEY) to use during
								the LevelUp Beta. NO REAL MONEY WILL BE USED AT ALL DURING THIS TIME. NO PAYMENTS WILL BE REQUIRED AT ANY TIME. 
							</li>
							<li>
								This test balance has no real-world monetary
								value and cannot be withdrawn, exchanged, or
								redeemed for any currency, product, or service.
							</li>
							<li>
								All predictions and rankings within the beta are
								based solely on virtual test funds, and outcomes
								do not represent or imply any real-money wagering
								activity.
							</li>
						</ul>

						<h3>Market Resolution and Timing</h3>
						<ul>
							<li>
								Some prediction markets may remain unresolved at
								the conclusion of the giveaway period due to
								external factors such as pending data, incomplete
								results, or delayed event outcomes.
							</li>
							<li>
								In such cases, unresolved markets will not
								contribute to the leaderboard calculation, and
								participants accept this as an inherent risk of
								the promotion.
							</li>
						</ul>

						<h3>Eligibility and Verification</h3>
						<ul>
							<li>
								Participants must have a verified LevelUp
								account with a valid email address.
							</li>
							<li>
								The email associated with your LevelUp account
								must be used to claim any prize.
							</li>
							<li>
								No other email address or third-party contact
								will be accepted for verification.
							</li>
							<li>
								Winners must respond to LevelUp's prize
								notification email within 90 days of the
								competition's conclusion. Failure to respond
								within that timeframe will result in forfeiture
								of the prize.
							</li>
						</ul>
						<p>
							Any user suspected of cheating, fraud, tampering,
							multiple account use, or automated participation
							will be disqualified and rendered ineligible to
							receive any prize.
						</p>

						<h3>Legal and Liability Terms</h3>
						<p>
							By entering, participants agree that LevelUp and its
							affiliates are not liable for:
						</p>
						<ul>
							<li>
								Technical issues, server downtime, or data
								errors affecting entries
							</li>
							<li>
								Lost, misdirected, or undeliverable
								communications
							</li>
							<li>
								Any damages, direct or consequential, arising
								from participation or prize use
							</li>
						</ul>
						<p>
							LevelUp reserves the right to modify, suspend, or
							cancel the giveaway at any time if circumstances
							beyond its control compromise the fairness or
							integrity of the competition.
						</p>
						<p>
							This promotion is in no way sponsored, endorsed,
							administered by, or associated with Nintendo Co.,
							Ltd., Valve Corporation, or any of their
							subsidiaries or affiliates. All trademarks and
							product names belong to their respective owners.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
