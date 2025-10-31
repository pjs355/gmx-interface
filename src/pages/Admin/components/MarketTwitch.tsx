interface MarketTwitchProps {
	twitchEnabled: boolean;
	twitchChannel: string;
	onTwitchEnabledChange: (enabled: boolean) => void;
	onTwitchChannelChange: (channel: string) => void;
}

export default function MarketTwitch({
	twitchEnabled,
	twitchChannel,
	onTwitchEnabledChange,
	onTwitchChannelChange,
}: MarketTwitchProps) {
	return (
		<div style={{ display: "grid", gap: 6 }}>
			<span>Twitch Enabled</span>
			<div style={{ display: "flex", gap: 8 }}>
				<button
					type="button"
					onClick={() => onTwitchEnabledChange(false)}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: twitchEnabled
							? "transparent"
							: "rgba(255,255,255,0.2)",
						color: "white",
						cursor: "pointer",
					}}
				>
					Disabled
				</button>
				<button
					type="button"
					onClick={() => onTwitchEnabledChange(true)}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: twitchEnabled
							? "rgba(255,255,255,0.2)"
							: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					Enabled
				</button>
			</div>
			<label style={{ display: "grid", gap: 6 }}>
				<span>Twitch Channel</span>
				<input
					value={twitchChannel}
					onChange={(e) => onTwitchChannelChange(e.target.value)}
					placeholder="Enter Twitch channel name (e.g., shroud)"
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: "4px",
						background: "transparent",
					}}
				/>
				<span style={{ fontSize: 12, opacity: 0.8 }}>
					Enter the Twitch channel name without the URL. Leave blank
					if no stream is associated.
				</span>
			</label>
		</div>
	);
}

