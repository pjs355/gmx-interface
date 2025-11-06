import React from "react";
import { Link } from "react-router-dom";
import "./Prizes.scss";
import nintendoSwitch2 from "@/assets/img/nintendo-switch-2.webp";
import steam50 from "@/assets/game-logos/steam-50.jpg";
import steam20 from "@/assets/game-logos/steam-20.jpg";

export default function Prizes() {
	return (
		<div style={{ padding: 24, color: "white" }}>
			{/* Hero Section with Nintendo Switch */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					textAlign: "center",
					marginBottom: 60,
				}}
			>
				{/* Image Container with Overlay Text */}
				<div
					style={{
						position: "relative",
						width: "100%",
						maxWidth: "800px",
						marginBottom: 40,
					}}
				>
					{/* Placeholder Image - Replace with actual Nintendo Switch image */}
					<div
						style={{
							width: "100%",
							height: "500px",
							background:
								"linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
							borderRadius: "20px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							position: "relative",
							overflow: "hidden",
							boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
						}}
					>
						{/* Placeholder for Nintendo Switch Image */}
						<div
							style={{
								fontSize: 24,
								opacity: 0.3,
								fontWeight: 600,
							}}
						>
							Nintendo Switch Image Placeholder
						</div>

						{/* Overlay Text */}
						<h1
							style={{
								position: "absolute",
								top: "50%",
								left: "50%",
								transform: "translate(-50%, -50%)",
								fontSize: "72px",
								fontWeight: 900,
								margin: 0,
								textShadow: "0 4px 20px rgba(0,0,0,0.8)",
								lineHeight: 1.2,
								zIndex: 10,
							}}
						>
							Win a Nintendo Switch 2
						</h1>
					</div>
				</div>

				{/* Subtitle Text */}
				<p
					style={{
						fontSize: "32px",
						fontWeight: 600,
						maxWidth: "800px",
						lineHeight: 1.4,
						margin: 0,
						opacity: 0.95,
					}}
				>
					Trade your favorite game predictions for a chance to win a
					Nintendo Switch. Absolutely free to play.
				</p>
			</div>

			<div style={{ display: "grid", gap: 20 }}>
				{/* Grand Prize */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "120px 1fr",
						gap: 16,
						alignItems: "center",
						padding: 16,
						border: "1px solid rgba(255,255,255,0.15)",
						borderRadius: 12,
						background:
							"linear-gradient(180deg, rgba(146,133,243,0.15), rgba(0,0,0,0.4))",
					}}
				>
					<div
						style={{
							width: 120,
							height: 120,
							borderRadius: 12,
							overflow: "hidden",
							background: "#111",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							border: "1px solid rgba(255,255,255,0.12)",
						}}
					>
						<img
							src="https://www.nintendo.com/content/dam/noa/en_US/hardware/switch/nintendo-switch/console/console-blue-red.png"
							alt="Nintendo Switch Console"
							style={{
								width: "100%",
								height: "100%",
								objectFit: "cover",
							}}
						/>
					</div>
					<div>
						<div
							style={{
								fontSize: 20,
								fontWeight: 800,
								marginBottom: 6,
							}}
						>
							Grand Prize
						</div>
						<div
							style={{
								fontSize: 28,
								fontWeight: 900,
								color: "#c9c5ff",
								letterSpacing: 0.5,
							}}
						>
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
