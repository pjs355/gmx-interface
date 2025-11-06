import "./TwitchEmbed.scss";

interface TwitchEmbedProps {
	channel: string;
	height?: string;
}

export function TwitchEmbed({ channel, height = "480" }: TwitchEmbedProps) {
	// Clean the channel name - trim whitespace
	const channelName = channel.trim();

	const hostname = window.location.hostname;

	// Build parent parameters - Twitch requires all possible parent domains
	const parents: string[] = [];
	if (hostname === "localhost" || hostname === "127.0.0.1") {
		parents.push("localhost");
		parents.push("127.0.0.1");
	} else {
		parents.push(hostname);
	}

	const parentParams = parents.map((p) => `parent=${p}`).join("&");
	const embedUrl = `https://player.twitch.tv/?channel=${channelName}&${parentParams}&autoplay=true&muted=false&controls=false`;

	return (
		<div className="twitch-embed-container">
			<iframe
				src={embedUrl}
				height={height}
				width="100%"
				allowFullScreen
				frameBorder="0"
				scrolling="no"
			></iframe>
		</div>
	);
}
