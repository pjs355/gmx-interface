export function getPredictionApiBaseUrl(): string {
	const isLocal = window.location.hostname === "localhost";

	if (isLocal) {
		return "http://localhost:8080";
	}
	return "https://prediction-api-production.up.railway.app";
}

export function getPredictionWebSocketUrl(): string {
	// Use wss:// for production, ws:// for local dev
	const isLocal = window.location.hostname === "localhost";
	if (isLocal) {
		return "wss://prediction-api-production.up.railway.app";
	}
	return "wss://prediction-api-production.up.railway.app";
}
