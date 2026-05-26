import { useRPG } from "@/context/RPGContext";
import { useMedia } from "react-use";
import "./RPGPane.scss";

interface RPGPaneProps {
	profilePicture?: string | null;
}

export default function RPGPane({ profilePicture }: RPGPaneProps) {
	const { level, frameAsset, frameName, progress, loading, error } = useRPG();
	const isMobile = useMedia("(max-width: 768px)");

	if (loading) {
		return (
			<div className="RPGPane">
				<div className="RPGPane-loading">Loading experience...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="RPGPane">
				<div className="RPGPane-error">{error}</div>
			</div>
		);
	}

	return (
		<div className="RPGPane" style={{ flexDirection: isMobile ? "column" : "row" }}>
			{/* Left Pane - Experience */}
			<div className="RPGPane-left">
				<div className="RPGPane-header">
					<div className="RPGPane-title">Experience</div>
				</div>

				<div className="RPGPane-content">
					<div className="RPGPane-row">
						<div className="RPGPane-avatar-container">
							{profilePicture ? (
								<img
									src={profilePicture}
									alt="Profile"
									className="RPGPane-avatar"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = "none";
									}}
								/>
							) : (
								<div className="RPGPane-avatar-placeholder">?</div>
							)}
							{frameAsset && (
								<img
									src={frameAsset}
									alt={`${frameName} Frame`}
									className="RPGPane-frame-overlay"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = "none";
									}}
								/>
							)}
						</div>

						<div className="RPGPane-exp-section">
							<div className="RPGPane-exp-bar-container">
								<div
									className="RPGPane-exp-bar-fill"
									style={{
										width: `${progress.progress * 100}%`,
									}}
								/>
								<div className="RPGPane-exp-bar-text">
									<span>
										{progress.current} / {progress.next} XP
									</span>
								</div>
							</div>
							<div className="RPGPane-level-text">
								<span className="RPGPane-level">Level {level}</span>
								<span className="RPGPane-rank">{frameName}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Right Pane - Prizes (temporarily hidden)
			<div className="RPGPane-right">
				<div className="RPGPane-header">
					<div className="RPGPane-title">Prizes</div>
				</div>

				<div className="RPGPane-prizes">
					{PRIZES.map((prize, index) => {
						const isUnlocked = level >= prize.requiredLevel;
						return (
							<div
								key={index}
								className={`RPGPane-prize ${
									isUnlocked ? "unlocked" : "locked"
								}`}
							>
								<div className="RPGPane-prize-name">
									{isUnlocked ? "✓" : "🔒"} {prize.name}
								</div>
								<div className="RPGPane-prize-description">
									{prize.description}
								</div>
								{!isUnlocked && (
									<div className="RPGPane-prize-requirement">
										Unlocks at Level {prize.requiredLevel}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			*/}
		</div>
	);
}
