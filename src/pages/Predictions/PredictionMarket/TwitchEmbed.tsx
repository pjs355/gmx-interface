import "./TwitchEmbed.scss";

interface TwitchEmbedProps {
	channel: string;
	height?: string;
}

export function TwitchEmbed({ channel, height = "480" }: TwitchEmbedProps) {
	const hostname = window.location.hostname;

	// Build parent parameters - Twitch requires all possible parent domains
	const parents = [hostname];
	if (hostname === "localhost") {
		parents.push("127.0.0.1");
	}

	const parentParams = parents.map((p) => `parent=${p}`).join("&");
	const embedUrl = `https://embed.twitch.tv/embed/v1.html?channel=${channel}&${parentParams}&autoplay=false&muted=false`;

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
