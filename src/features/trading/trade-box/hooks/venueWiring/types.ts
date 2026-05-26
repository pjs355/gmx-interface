/**
 * Shared input types for venue wiring hooks (`useTradeBoxVenueWiring` subtree).
 */
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { TradingVenue } from "../../types";
import type { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import type { UseQueryResult } from "@tanstack/react-query";

export interface UseTradeBoxVenueWiringParams {
	state: {
		tradingVenue: TradingVenue;
		selectedPosition: "yes" | "no" | null;
	};
	multiVenueEnabled: boolean;
	authenticated: boolean;
	pandaId: string;
	matchedMonitor: MatchedMarket | null | undefined;
	yesTeamLabel: string;
	noTeamLabel: string;
	levelUpOrderbook: OrderbookSnapshot | null;
	oddsMonitorEnabled: boolean;
	oddsMonitorConnected: boolean;
	account: string | null | undefined;
	setupActivation: ReturnType<typeof useSetupActivationOptional>;
	profileId: string | undefined;
	limitlessEnsureQuery: UseQueryResult<unknown>;
	limitlessReady: boolean;
	limitlessEnsureGate: { ready: boolean; blockedReason: string | null };
}
