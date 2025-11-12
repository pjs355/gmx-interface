interface MarketStreamProps {
	streamEnabled: boolean;
	streamUrl: string;
	onStreamEnabledChange: (enabled: boolean) => void;
	onStreamUrlChange: (url: string) => void;
}

export default function MarketTwitch({
	streamEnabled,
	streamUrl,
	onStreamEnabledChange,
	onStreamUrlChange,
}: MarketStreamProps) {
	return (
		<div style={{ display: "grid", gap: 6 }}>
			<span>Stream Enabled</span>
			<div style={{ display: "flex", gap: 8 }}>
				<button
					type="button"
					onClick={() => onStreamEnabledChange(false)}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: streamEnabled
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
					onClick={() => onStreamEnabledChange(true)}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: streamEnabled
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
				<span>Stream URL</span>
				<input
					value={streamUrl}
					onChange={(e) => onStreamUrlChange(e.target.value)}
					placeholder="Enter full stream URL (e.g., https://www.twitch.tv/shroud)"
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: "4px",
						background: "transparent",
					}}
				/>
				<span style={{ fontSize: 12, opacity: 0.8 }}>
					Provide a full streaming URL (Twitch, Kick, etc.). Leave blank
					if no stream is associated.
				</span>
			</label>
		</div>
	);
}

