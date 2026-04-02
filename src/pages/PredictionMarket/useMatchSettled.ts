import { useMemo, useEffect, useState } from "react";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import { usePrivy } from "@privy-io/react-auth";

export interface SettledInfo {
	isSettled: boolean;
	winnerName: string;
}

/**
 * Determines whether a match is settled by checking three sources in priority order:
 * 1. Odds monitor WebSocket — Amsterdam keeps finished matches with status:"finished" + winner
 * 2. Resolved markets in the prediction data context (LevelUp backend has settled)
 * 3. PandaScore API fallback (requires admin auth, may fail silently)
 */
export function useMatchSettled(
	umbrellaId: string | undefined,
	pandascoreMatchId: string | undefined
): SettledInfo | null {
	const { getResolvedQuestionsForUmbrella } = usePredictionData();
	const { appState: oddsAppState } = useOddsMonitor();
	const { getAccessToken } = usePrivy();
	const [pandaWinner, setPandaWinner] = useState<string | null>(null);

	const pandaId = pandascoreMatchId?.trim() ?? "";

	// Source 1: Odds monitor — instant, no API call
	const monitorInfo = useMemo<SettledInfo | null>(() => {
		if (!pandaId || !oddsAppState?.markets?.length) return null;
		const row = oddsAppState.markets.find(
			(m) => String(m.pandaMatchId) === pandaId
		);
		if (!row || row.status !== "finished" || !row.winner) return null;
		return {
			isSettled: true,
			winnerName: row.winner.name || row.winner.acronym || "Winner",
		};
	}, [pandaId, oddsAppState?.markets]);

	// Source 2: Resolved markets from context (backend settled the market)
	const resolvedInfo = useMemo<SettledInfo | null>(() => {
		if (monitorInfo) return null;
		if (!umbrellaId) return null;
		const resolved = getResolvedQuestionsForUmbrella(umbrellaId);
		if (resolved.length === 0) return null;

		const winner = resolved.find(
			(q: any) => q.resolvedOutcome === "yes"
		);
		if (!winner) return null;

		return {
			isSettled: true,
			winnerName: (winner as any).displayName || "Winner",
		};
	}, [umbrellaId, monitorInfo, getResolvedQuestionsForUmbrella]);

	// Source 3: PandaScore API fallback (only if sources 1+2 found nothing)
	useEffect(() => {
		if (monitorInfo || resolvedInfo || !pandaId) return;

		let cancelled = false;

		(async () => {
			try {
				const token = await getAccessToken();
				const match =
					await predictionMarketDataService.fetchMatchFromPandascore(
						pandaId,
						token
					);
				if (cancelled) return;
				if (match?.status === "finished" && match.winner) {
					setPandaWinner(
						match.winner.name ||
							match.winner.acronym ||
							"Winner"
					);
				}
			} catch {
				// Admin-only endpoint — fail silently for regular users
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [pandaId, monitorInfo, resolvedInfo, getAccessToken]);

	if (monitorInfo) return monitorInfo;
	if (resolvedInfo) return resolvedInfo;
	if (pandaWinner) return { isSettled: true, winnerName: pandaWinner };

	return null;
}
