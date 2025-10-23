export function getPredictionApiBaseUrl(): string {
	return "http://localhost:8080";
}

export function getPredictionWebSocketUrl(): string {
	// Use wss:// for production, ws:// for local dev
	const isLocal = window.location.hostname === "localhost";
	if (isLocal) {
		return "ws://localhost:8080";
	}
	return "wss://prediction-api-production.up.railway.app";
}
