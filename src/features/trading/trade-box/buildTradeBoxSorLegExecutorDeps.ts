/**
 * Assembles `UseSorLegExecutorDeps` for the trade box SOR pipeline.
 *
 * Pure factory (not a hook): maps venue wiring, approvals, relay, Solana signer,
 * and Limitless signed-order builder into the object passed to `useSorLegExecutor`.
 *
 * Called once per render from `PredictionMarketTradeBox` after approvals + wiring
 * are ready. Lives under `sor/` (not `hooks/`) — pure factory, not a React hook.
 */
import type { ethers } from "ethers";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { UseSorLegExecutorDeps } from "@/features/trading/sor/core/useSorLegExecutor";
import type { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import type { useTradeExecutionService } from "@/components/PredictionMarketTradeBox/TradeExecutionService";
import type { useTradeBoxVenueWiring } from "./hooks/useTradeBoxVenueWiring";
import type { useTradeBoxApprovals } from "./hooks/useTradeBoxApprovals";
import type { SolanaSignerCapable } from "@/features/trading/lifi/sendTransactionTypes";
import type { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import type { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import {
	buildLimitlessSignedOrderFromMarket,
	type BuildLimitlessSorOrderInput,
} from "@/features/trading/venues/limitless/trade/limitlessSignedClobOrder";

export function buildTradeBoxSorLegExecutorDeps(args: {
	tradeExecutionService: ReturnType<typeof useTradeExecutionService>;
	venueWiring: Pick<
		ReturnType<typeof useTradeBoxVenueWiring>,
		| "polyClob"
		| "predictSession"
		| "predictNumericId"
		| "predictMarketDetail"
		| "predictTokenIdForPosition"
		| "predictApprovalsQuery"
	>;
	privateApi: ReturnType<typeof usePrivateApiClient>;
	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null | undefined;
	propUmbrellaId?: string;
	account: string | null | undefined;
	getClientForChain: UseSorLegExecutorDeps["getClientForChain"];
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	solanaSigner: SolanaSignerCapable | null;
	relay: ReturnType<typeof usePolymarketRelay>;
	dflowProof: ReturnType<typeof useDflowProofStatus>;
	approvalGate: Pick<
		ReturnType<typeof useTradeBoxApprovals>,
		"ensureTokenApprovalsForSor" | "ensureDflowProofVerified"
	>;
	getLimitlessOwnerId: () => number | undefined;
	signer: ethers.Signer | null | undefined;
}): UseSorLegExecutorDeps {
	const {
		tradeExecutionService,
		venueWiring,
		privateApi,
		market,
		matchedMonitor,
		propUmbrellaId,
		account,
		getClientForChain,
		venueAddressChainMap,
		walletGate,
		solanaSigner,
		relay,
		dflowProof,
		approvalGate,
		getLimitlessOwnerId,
		signer,
	} = args;

	const getLimitlessMakerAddress = () => venueAddressChainMap?.limitless.walletAddress ?? undefined;

	const buildLimitlessSignedOrderFromMarketCb = (input: BuildLimitlessSorOrderInput) => {
		if (!signer) {
			return Promise.reject(new Error("Wallet signer unavailable for Limitless orders."));
		}
		return buildLimitlessSignedOrderFromMarket(privateApi, signer as ethers.Signer, input);
	};

	return {
		tradeExecutionService,
		polyClob: venueWiring.polyClob,
		predictSession: venueWiring.predictSession,
		privateApi,
		market,
		matchedMonitor: matchedMonitor ?? null,
		umbrellaId: propUmbrellaId ?? null,
		predictNumericId: venueWiring.predictNumericId,
		predictMarketDetail: venueWiring.predictMarketDetail,
		account: account ?? undefined,
		getClientForChain,
		venueAddressChainMap,
		walletGate,
		solanaSigner,
		getRelayClient: relay.getRelayClient,
		dflowProofVerified: dflowProof.isVerified,
		predictApprovalsOk: venueWiring.predictApprovalsQuery.data === true,
		predictTokenId: venueWiring.predictTokenIdForPosition,
		ensureTokenApprovals: approvalGate.ensureTokenApprovalsForSor,
		ensureDflowProofVerified: approvalGate.ensureDflowProofVerified,
		getLimitlessOwnerId,
		getLimitlessMakerAddress,
		buildLimitlessSignedOrderFromMarket: buildLimitlessSignedOrderFromMarketCb,
	};
}
