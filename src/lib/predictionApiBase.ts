export function getPredictionApiBaseUrl(): string {
	try {
		// Prefer explicit override if ever provided at runtime
		const anyWindow = window as any;
		if (
			anyWindow &&
			typeof anyWindow.__PREDICTION_API_BASE__ === "string" &&
			anyWindow.__PREDICTION_API_BASE__
		) {
			return anyWindow.__PREDICTION_API_BASE__ as string;
		}
	} catch {}
	const isPatrick = process.env.PATRICK;
	const isDev =
		typeof import.meta !== "undefined" &&
		(import.meta as any).env &&
		(import.meta as any).env.DEV;
	if (isPatrick && isDev) {
		return "http://localhost:8080";
	}
	if (isDev) {
		// Brendan uses proxy
		// Use Vite dev proxy. See vite.config.ts -> server.proxy['/api']
		return "/api";
	}
	return "https://prediction-api-production.up.railway.app";
}
