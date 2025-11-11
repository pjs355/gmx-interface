import React from "react";

interface PandascoreFieldsProps {
	game: string;
	matchId: string;
	onGameChange: (value: string) => void;
	onMatchIdChange: (value: string) => void;
	disabled?: boolean;
}

const fieldStyles = {
	wrapper: { display: "grid", gap: 6 } as const,
	input: (disabled: boolean) => ({
		padding: 8,
		color: disabled ? "#888" : "cyan",
		border: "1px solid white",
		borderRadius: "4px",
		background: disabled ? "rgba(0,0,0,0.2)" : "transparent",
		cursor: disabled ? "not-allowed" : "text",
	}) as const,
};

export default function PandascoreFields({
	game,
	matchId,
	onGameChange,
	onMatchIdChange,
	disabled = false,
}: PandascoreFieldsProps) {
	return (
		<>
			<label style={fieldStyles.wrapper}>
				<span>Game</span>
				<input
					value={game}
					onChange={(event) => onGameChange(event.target.value)}
					placeholder="e.g., Counter-Strike, League of Legends"
					disabled={disabled}
					style={fieldStyles.input(disabled)}
				/>
			</label>
			<label style={fieldStyles.wrapper}>
				<span>PandaScore Match ID</span>
				<input
					value={matchId}
					onChange={(event) => onMatchIdChange(event.target.value)}
					placeholder="Leave empty if not from PandaScore"
					disabled={disabled}
					style={fieldStyles.input(disabled)}
				/>
			</label>
		</>
	);
}
