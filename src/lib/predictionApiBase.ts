export function getPredictionApiBaseUrl(): string {
  try {
    // Prefer explicit override if ever provided at runtime
    const anyWindow = window as any;
    if (anyWindow && typeof anyWindow.__PREDICTION_API_BASE__ === "string" && anyWindow.__PREDICTION_API_BASE__) {
      return anyWindow.__PREDICTION_API_BASE__ as string;
    }
  } catch {}

  const isDev = typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.DEV;
  if (isDev) {
    return "http://localhost:8080";
  }
  return "https://prediction-api-production.up.railway.app";
}
