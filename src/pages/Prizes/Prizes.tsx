import React from "react";
import { Link } from "react-router-dom";
import "./Prizes.scss";
import nintendoSwitch2 from "@/assets/img/nintendo-switch-2.webp";
import steam50 from "@/assets/game-logos/steam-50.jpg";
import steam20 from "@/assets/game-logos/steam-20.jpg";

export default function Prizes() {
	return (
		<div className="prizes-container">
			<h1 className="prizes-title">Prizes</h1>
			<p className="prizes-subtitle">
				Compete, climb the leaderboard, and win awesome prizes!
			</p>

			<div className="prizes-info-box">
				<p>
					Our trading competition will conclude{" "}
					<strong>December 7th</strong>.
				</p>
				<p>
					You must have created an account with an email in order to
					participate. If you logged in with an external wallet, your
					trades will not be tracked.
				</p>
				<p>
					Be sure to navigate to{" "}
					<Link to="/profile" className="prizes-link">
						Profile
					</Link>{" "}
					to set a username.
				</p>
			</div>

			<div className="prizes-grid">
				{/* Grand Prize */}
				<div className="prize-card grand-prize">
					<div className="prize-image-wrapper">
						<img
							src={nintendoSwitch2}
							alt="Nintendo Switch 2"
							className="prize-image"
						/>
					</div>
					<div>
						<div className="prize-rank">Grand Prize</div>
						<div className="prize-name grand">
							Nintendo Switch 2
						</div>
						<div className="prize-description">
							1 winner. The ultimate portable console to level up
							your game.
						</div>
					</div>
				</div>

				{/* Second Place */}
				<div className="prize-card">
					<div className="prize-image-wrapper">
						<img
							src={steam50}
							alt="$50 Steam Gift Card"
							className="prize-image"
						/>
					</div>
					<div>
						<div className="prize-rank">Second Place</div>
						<div className="prize-name second">
							3 × $50 Steam Gift Card
						</div>
						<div className="prize-description">
							Three winners. Load up your library with the latest
							hits.
						</div>
					</div>
				</div>

				{/* Third Place */}
				<div className="prize-card">
					<div className="prize-image-wrapper">
						<img
							src={steam20}
							alt="$25 Steam Gift Card"
							className="prize-image"
						/>
					</div>
					<div>
						<div className="prize-rank">Third Place</div>
						<div className="prize-name third">
							5 × $20 Steam Gift Card
						</div>
						<div className="prize-description">
							Five winners. Grab DLCs, indies, or stash for a
							sale.
						</div>
					</div>
				</div>

				<div className="prizes-disclaimer">
					Prizes, eligibility, and distribution are subject to the
					official rules. Prizes not affiliated with Nintendo or Valve
					Corporation.
				</div>
			</div>
		</div>
	);
}
