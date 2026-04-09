import { useQuery } from "@tanstack/react-query";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface VenueBboEntry {
	venue: string;
	linked: boolean;
	bestAskA: number | null;
	bestAskB: number | null;
	status: "live" | "no_liquidity" | "awaiting_data";
}

export interface VenueBboResponse {
	pandaMatchId: string;
	pandaTeamA: string;
	pandaTeamB: string;
	venues: VenueBboEntry[];
	levelup: { bestAskA: number | null; bestAskB: number | null };
	timestamp: number;
}

async function fetchVenueBbo(pandascoreMatchId: string): Promise<VenueBboResponse> {
	const base = getPredictionApiBaseUrl();
	const res = await fetch(`${base}/api/venue-bbo/${pandascoreMatchId}`);
	if (!res.ok) throw new Error(`venue-bbo: ${res.status}`);
	const json = await res.json();
	if (!json.success) throw new Error(json.error ?? "venue-bbo failed");
	return json.data as VenueBboResponse;
}

/**
 * Fetches venue BBO data via REST. Fires eagerly on mount for instant first paint,
 * then polls as a background refresh. WS data takes over once connected.
 */
export function useVenueBbo(pandascoreMatchId: string | null | undefined, enabled: boolean) {
	return useQuery<VenueBboResponse>({
		queryKey: ["venue-bbo", pandascoreMatchId],
		queryFn: () => fetchVenueBbo(pandascoreMatchId!),
		enabled: enabled && Boolean(pandascoreMatchId),
		/** Poll only while venue-prices WS is down or stale — not on a 10s loop when live WS is primary. */
		refetchInterval: enabled ? 10_000 : false,
		staleTime: 3_000,
		retry: 2,
	});
}
