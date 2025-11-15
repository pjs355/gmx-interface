import React from "react";
import { useLogin } from "@privy-io/react-auth";
import nintendoSwitch2 from "@/assets/img/Nintendo-Switch-2.png";
import "./PromotionBar.scss";

export function PromotionBar() {
	const { login } = useLogin();

	const handleStartTrading = () => {
		// Open Privy login modal
		login();
	};

	return (
		<div className="promotion-bar">
			<div className="promotion-bar-container">
				<div className="promotion-bar-image">
					<img
						src={nintendoSwitch2}
						alt="Nintendo Switch 2"
						className="promotion-bar-image-img"
					/>
				</div>
				<div className="promotion-bar-content">
					<h2 className="promotion-bar-title">
						Trade predictions.{"\n"}Win a Nintendo Switch 2.
					</h2>
					<p className="promotion-bar-text">
						Earn the most from trading to win a Nintendo Switch 2 Console.
						We're in beta, so it is completely free to play! No real money
						just real prizes.{" "}
						<a href="/prizes" className="promotion-bar-link">
							See terms
						</a>
						.
					</p>
					<button
						className="promotion-bar-button"
						onClick={handleStartTrading}
					>
						Start trading
					</button>
				</div>
			</div>
		</div>
	);
}

