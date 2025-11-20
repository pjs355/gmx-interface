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
						OFFICIAL RULES & ELIGIBILITY
					</div>
					<div>
						Participants must be 18 years of age or older and reside
						in a jurisdiction where participation is legally
						permitted. Prizes, eligibility criteria, and
						distribution methods are subject to official contest
						rules and regulations. Any user suspected of cheating,
						fraud, or tampering with the contest in any way will be
						immediately disqualified and ineligible to receive any
						prizes. In the event that a winner is unable to receive
						a physical prize due to geographic restrictions, legal
						limitations, or any other reason beyond their control,
						the winner will be provided with the equivalent cash
						value of the prize. This promotion is in no way
						sponsored, endorsed, administered by, or associated with
						Nintendo Co., Ltd., Valve Corporation, or any of their
						respective subsidiaries or affiliates. All trademarks
						and product names are the property of their respective
						owners.
					</div>
				</div>
			</div>
		</div>
	);
}
