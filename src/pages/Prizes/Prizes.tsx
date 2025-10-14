import React from "react";

export default function Prizes() {
	return (
		<div style={{ padding: 24, color: "white" }}>
			<h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
				Prizes
			</h1>
			<p style={{ opacity: 0.85, marginBottom: 24 }}>
				Compete, climb the leaderboard, and win awesome prizes!
			</p>

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
						<div style={{ opacity: 0.85, marginTop: 6 }}>
							1 winner. The ultimate portable console to level up
							your game.
						</div>
					</div>
				</div>

				{/* Second Place */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "120px 1fr",
						gap: 16,
						alignItems: "center",
						padding: 16,
						border: "1px solid rgba(255,255,255,0.12)",
						borderRadius: 12,
						background: "rgba(0,0,0,0.35)",
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
							src="https://cdn.pixabay.com/photo/2016/11/29/09/08/gift-card-1869659_1280.jpg"
							alt="$50 Steam Gift Card"
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
							Second Place
						</div>
						<div
							style={{
								fontSize: 24,
								fontWeight: 900,
								color: "#9fe3a9",
							}}
						>
							3 × $50 Steam Gift Card
						</div>
						<div style={{ opacity: 0.85, marginTop: 6 }}>
							Three winners. Load up your library with the latest
							hits.
						</div>
					</div>
				</div>

				{/* Third Place */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "120px 1fr",
						gap: 16,
						alignItems: "center",
						padding: 16,
						border: "1px solid rgba(255,255,255,0.12)",
						borderRadius: 12,
						background: "rgba(0,0,0,0.35)",
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
							src="https://cdn.pixabay.com/photo/2016/11/29/09/08/gift-card-1869659_1280.jpg"
							alt="$25 Steam Gift Card"
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
							Third Place
						</div>
						<div
							style={{
								fontSize: 24,
								fontWeight: 900,
								color: "#ffd18b",
							}}
						>
							5 × $25 Steam Gift Card
						</div>
						<div style={{ opacity: 0.85, marginTop: 6 }}>
							Five winners. Grab DLCs, indies, or stash for a
							sale.
						</div>
					</div>
				</div>

				<div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
					Prizes, eligibility, and distribution are subject to the
					official rules. Prizes not affiliated with Nintendo or Valve
					Corporation.
				</div>
			</div>
		</div>
	);
}
