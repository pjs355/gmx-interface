import type { MutableRefObject } from "react";
import type { Side, TickSize } from "@polymarket/clob-client-v2";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import type { Book } from "@predictdotfun/sdk";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import type { TradeExecutionParams } from "@/features/trading/trade-box/types";
import type {
	SolanaSignerCapable,
	SendTransactionCapable,
} from "@/features/trading/lifi/sendTransactionTypes";
import type { BaseSmartWalletPendingUsdc } from "@/types/trading";
import type {
	DflowOrderParams,
	DflowOrderStatusResponse,
	DflowOrderSubmitBody,
	DflowOrderSubmitResponse,
} from "@/services/privateApi/client";
import type { SorExecutionPhase } from "@/features/trading/sor/core/useSorExecution";
import type { BuildLimitlessSorOrderInput } from "@/features/trading/venues/limitless/trade/limitlessSignedClobOrder";
import type { LimitlessSignedOrderSubmit } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import type { AccountWalletGate, VenueAddressChainMap } from "@/context/accountWallets";
import type {
	ApprovalEnsureScope,
	TokenApprovalVenueKey,
} from "@/features/trading/approvals/types";
import type {
	ChainReadRequest,
	ChainReadResultFor,
} from "@/features/trading/chain-reads/chainReadTypes";

export interface UseSorLegExecutorDeps {
	tradeExecutionService: {
		executeTrade: (
			params: TradeExecutionParams,
			privyWallet: unknown,
		) => Promise<{ success: boolean; transactionHash?: string; error?: string }>;
	};
	polyClob: {
		ready: boolean;
		placeMarketOrder: (args: {
			tokenId: string;
			amount: number;
			side: typeof Side.BUY | typeof Side.SELL;
			tickStyle?: TickSize;
			negRisk?: boolean;
		}) => Promise<unknown>;
		placeLimitOrder: (args: {
			tokenId: string;
			price: number;
			size: number;
			side: typeof Side.BUY | typeof Side.SELL;
			tickStyle?: TickSize;
			negRisk?: boolean;
		}) => Promise<unknown>;
	};
	predictSession: {
		ready: boolean;
		placeMarketOrder: (args: {
			marketId: number;
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			amount: string;
			book?: Book | null;
			complementOrderbook?: boolean;
		}) => Promise<{ orderHash?: string }>;
		placeLimitOrder: (args: {
			market: PredictMarketDetail;
			tokenId: string;
			side: "buy" | "sell";
			priceCents: number;
			sizeShares: string;
		}) => Promise<{ orderHash?: string } | unknown>;
	};
	privateApi: {
		getDflowOrder: (params: DflowOrderParams) => Promise<{
			transaction?: string;
			outAmount?: string;
			lastValidBlockHeight?: number;
			code?: string;
			msg?: string;
		}>;
		postDflowOrder: (body: DflowOrderSubmitBody) => Promise<DflowOrderSubmitResponse>;
		getDflowOrderStatus: (
			signature: string,
			lastValidBlockHeight?: number,
		) => Promise<DflowOrderStatusResponse>;
		postFundingLifiQuote: (body: {
			fromChain: number;
			toChain: number;
			amountHuman: string;
			fromAddress: string;
			toAddress?: string;
			slippage?: number;
		}) => Promise<{
			steps?: unknown[];
			quote?: unknown;
			statusBridge?: string | null;
			tool?: string;
		}>;
		getFundingLifiStatus: (params: {
			txHash: string;
			tool?: string;
			fromChain?: number;
			toChain?: number;
		}) => Promise<unknown>;
		postLimitlessOrder: (body: LimitlessSignedOrderSubmit) => Promise<unknown>;
		postLimitlessVerifyAllowance: (slug: string, opts?: { tokenId?: string }) => Promise<unknown>;
		postChainRead: <R extends ChainReadRequest>(request: R) => Promise<ChainReadResultFor<R>>;
		postLimitlessPortfolioWithdraw: (input: {
			amountHuman: number;
			destination: string;
		}) => Promise<unknown>;
		getBaseSmartWalletPendingUsdc: () => Promise<BaseSmartWalletPendingUsdc>;
	};

	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null;
	umbrellaId?: string | null;
	predictNumericId: number | null;
	predictMarketDetail: PredictMarketDetail | null;
	account: string | undefined;

	getClientForChain: (opts: { id: number }) => Promise<
		| {
				sendTransaction: SendTransactionCapable["sendTransaction"];
		  }
		| null
		| undefined
	>;
	venueAddressChainMap: VenueAddressChainMap | null;
	walletGate: AccountWalletGate;
	solanaSigner: SolanaSignerCapable | null;
	getRelayClient: () => Promise<RelayClient | null>;

	dflowProofVerified: boolean;
	predictApprovalsOk: boolean;
	predictTokenId: string | null;
	ensureTokenApprovals?: <V extends TokenApprovalVenueKey>(
		venue: V,
		scope?: ApprovalEnsureScope<V>,
	) => Promise<void>;
	buildLimitlessSignedOrderFromMarket?: (
		input: BuildLimitlessSorOrderInput,
	) => Promise<LimitlessSignedOrderSubmit>;
	getLimitlessOwnerId?: () => number | null | undefined;
	getLimitlessMakerAddress?: () => string | null | undefined;
	ensureDflowProofVerified?: () => Promise<boolean>;
	reportExecutionPhaseRef?: MutableRefObject<((phase: SorExecutionPhase) => void) | undefined>;
}
