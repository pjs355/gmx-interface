import React from "react";

// Load all game logo images from the local game-logos directory using Vite's glob import
const logoModules = import.meta.glob(
	"../../assets/game-logos/*.{png,jpg,jpeg,svg}",
	{
		eager: true,
		as: "url",
	}
) as Record<string, string>;

const gameLogos = Object.entries(logoModules)
	.map(([path, url]) => {
		const fileName = path.split("/").pop() || "";
		const name = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
		return { url, name };
	})
	.sort((a, b) => a.name.localeCompare(b.name));

export default function ImageBanner() {
	if (gameLogos.length === 0) return null;

	const repetitions = 4;
	const repeatedLogos = Array.from({ length: repetitions }).flatMap(
		() => gameLogos
	);

	return (
		<div className="game-logos-slider">
			<div
				className="game-logos-track"
				style={{ ["--scroll-duration" as any]: "30s" }}
			>
				{repeatedLogos.map((logo, idx) => (
					<div className="game-logo-item" key={`${logo.url}-${idx}`}>
						<img
							className="game-logo"
							src={logo.url}
							alt={logo.name}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
