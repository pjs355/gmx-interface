import { useMemo } from "react";
import "./StreamEmbed.scss";

interface StreamEmbedProps {
	streamUrl: string;
	height?: string;
}

function buildParentParams(hostname: string): string {
	const parents: string[] = [];
	const trimmedHost = hostname.trim();
	if (trimmedHost.length === 0) {
		return "";
	}
	if (trimmedHost === "localhost" || trimmedHost === "127.0.0.1") {
		parents.push("localhost");
		parents.push("127.0.0.1");
	} else {
		parents.push(trimmedHost);
	}
	return parents.map((parent) => `parent=${parent}`).join("&");
}

function buildTwitchEmbedUrl(url: URL, hostname: string): string {
	const pathSegment = url.pathname.replace(/^\//, "");
	if (pathSegment.length === 0) {
		return "";
	}
	const parentParams = buildParentParams(hostname);
	const paramSuffix = parentParams.length > 0 ? `&${parentParams}` : "";
	return `https://player.twitch.tv/?channel=${pathSegment}${paramSuffix}&autoplay=true&muted=false&controls=false`;
}

function buildKickEmbedUrl(url: URL): string {
	const pathSegment = url.pathname.replace(/^\//, "");
	if (pathSegment.length === 0) {
		return "";
	}
	return `https://player.kick.com/${pathSegment}?autoplay=true`;
}

function getStreamEmbedUrl(streamUrl: string, hostname: string): string {
	let parsed: URL;
	try {
		parsed = new URL(streamUrl);
	} catch (error) {
		console.error("error", error);
		return "";
	}
	const hostValue = parsed.hostname.toLowerCase();
	if (hostValue.includes("twitch.tv")) {
		return buildTwitchEmbedUrl(parsed, hostname);
	}
	if (hostValue.includes("kick.com")) {
		return buildKickEmbedUrl(parsed);
	}
	return "";
}

export function StreamEmbed({ streamUrl, height }: StreamEmbedProps) {
	const trimmedUrl = streamUrl.trim();
	if (trimmedUrl.length === 0) {
		return null;
	}
	const embedUrl = useMemo(() => {
		const hostname = window.location.hostname;
		return getStreamEmbedUrl(trimmedUrl, hostname);
	}, [trimmedUrl]);
	if (embedUrl.length === 0) {
		return null;
	}
	/* `height` is treated as a maximum so the container can never grow
	 * taller than the source layout expected. The container itself uses a
	 * 16:9 aspect ratio so the iframe matches the actual video frame —
	 * which eliminates the top/bottom black bars Twitch/Kick used to add
	 * when the iframe was forced to a fixed height. */
	const maxHeightPx =
		typeof height === "string"
			? height.includes("px")
				? height
				: `${height}px`
			: undefined;
	return (
		<div
			className="stream-embed-container"
			style={maxHeightPx ? { maxHeight: maxHeightPx } : undefined}
		>
			<iframe
				src={embedUrl}
				allowFullScreen
				frameBorder="0"
				scrolling="no"
				className="stream-embed"
			></iframe>
		</div>
	);
}
