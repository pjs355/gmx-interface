import { calculateFeeMatchingBackend } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLevelUp";
import { calculatePolymarketFee } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feePolymarket";
import { calculatePredictFee } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feePredict";
import { calculateDflowFee } from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeDflow";
import {
	calculateLimitlessFee,
	LIMITLESS_DEFAULT_FEE_RATE_BPS,
} from "@/pages/PredictionMarket/PredictionMarketTradeBox/feeLimitless";

export type TradingVenue = "all" | "levelup" | "polymarket" | "predictfun" | "dflow" | "limitless";

export interface FeeEstimateParams {
	contracts: number;
	/** Fill price as probability 0–1 */
	price: number;
	side: "buy" | "sell";
	/** Per-market basis-point rate (Predict) */
	feeRateBps?: number;
	/** Category-level taker rate (Polymarket) */
	feeRate?: number;
}

export interface EffectiveBudgetParams {
	/** Per-market basis-point rate (Predict) */
	feeRateBps?: number;
	/** Approximate fill price 0–1 (used by venues with price-dependent fees) */
	approxPrice?: number;
}

export interface VenueConfig {
	id: TradingVenue;
	displayName: string;
	collateral: "USDC" | "USDT";
	chain: "base" | "polygon" | "bnb" | "solana";
	supportsLimitOrders: boolean;
	supportsMarketOrders: boolean;
	supportsSell: boolean;
	requiresWholeShares: boolean;
	/** Returns estimated fee in collateral units (dollars / USDT). */
	estimateFee: (params: FeeEstimateParams) => number;
	/**
	 * Given the user's total buy amount, returns the portion that goes toward
	 * purchasing shares. The remainder is reserved for fees so the user never
	 * pays more than they entered.
	 */
	effectiveBuyBudget: (usdAmount: number, opts?: EffectiveBudgetParams) => number;
	/** Short human-readable label shown next to fee amount. */
	feeDescription: string;
	/** Longer tooltip explaining the fee formula. */
	feeTooltip: string;
}

export const VENUE_CONFIGS: Record<TradingVenue, VenueConfig> = {
	all: {
		id: "all",
		displayName: "All (Smart Route)",
		collateral: "USDC",
		chain: "base",
		supportsLimitOrders: false,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: false,
		estimateFee: () => 0,
		effectiveBuyBudget: (usd) => usd,
		feeDescription: "Blended across venues",
		feeTooltip:
			"Fees vary per venue. The optimizer minimizes total cost including all venue fees and bridge costs.",
	},

	levelup: {
		id: "levelup",
		displayName: "LevelUp",
		collateral: "USDC",
		chain: "base",
		supportsLimitOrders: true,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: true,
		estimateFee: ({ contracts, price }) => {
			const notional = contracts * price;
			return calculateFeeMatchingBackend(notional);
		},
		effectiveBuyBudget: (usd) => usd / 1.02,
		feeDescription: "2% fee",
		feeTooltip:
			"LevelUp charges a flat 2% taker fee on the notional value, rounded up to the nearest cent.",
	},

	polymarket: {
		id: "polymarket",
		displayName: "Polymarket",
		collateral: "USDC",
		chain: "polygon",
		supportsLimitOrders: true,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: false,
		estimateFee: ({ contracts, price, feeRate }) => {
			const rate = feeRate ?? 0.03;
			return calculatePolymarketFee(contracts, price, rate);
		},
		effectiveBuyBudget: (usd, opts) => {
			const p = opts?.approxPrice ?? 0.5;
			return usd / (1 + 0.03 * (1 - p));
		},
		feeDescription: "Sports taker fee",
		feeTooltip:
			"Polymarket Sports/Esports taker fee: C × 0.03 × p × (1 − p). Makers pay 0%. Fee rounded to 5 decimals.",
	},

	predictfun: {
		id: "predictfun",
		displayName: "Predict",
		collateral: "USDT",
		chain: "bnb",
		supportsLimitOrders: true,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: false,
		estimateFee: ({ contracts, price, feeRateBps }) => {
			return calculatePredictFee(contracts, price, feeRateBps ?? 0);
		},
		effectiveBuyBudget: (usd, opts) => {
			const bps = opts?.feeRateBps ?? 0;
			return bps > 0 ? usd / (1 + bps / 10_000) : usd;
		},
		feeDescription: "Market fee",
		feeTooltip:
			"Predict fee is per-market (feeRateBps from API): contracts × price × feeRateBps / 10 000.",
	},

	limitless: {
		id: "limitless",
		displayName: "Limitless",
		collateral: "USDC",
		chain: "base",
		supportsLimitOrders: true,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: false,
		estimateFee: ({ contracts, price, feeRateBps }) => {
			const notional = contracts * price;
			return calculateLimitlessFee(
				notional,
				feeRateBps ?? LIMITLESS_DEFAULT_FEE_RATE_BPS,
			);
		},
		effectiveBuyBudget: (usd, opts) => {
			const bps = opts?.feeRateBps ?? LIMITLESS_DEFAULT_FEE_RATE_BPS;
			return bps > 0 ? usd / (1 + bps / 10_000) : usd;
		},
		feeDescription: "Limitless fee",
		feeTooltip: "Limitless taker fee is 3% on notional.",
	},

	dflow: {
		id: "dflow",
		displayName: "Kalshi",
		collateral: "USDC",
		chain: "solana",
		supportsLimitOrders: false,
		supportsMarketOrders: true,
		supportsSell: true,
		requiresWholeShares: false,
		estimateFee: ({ contracts, price }) => {
			return calculateDflowFee(contracts, price);
		},
		effectiveBuyBudget: (usd, opts) => {
			const p = opts?.approxPrice ?? 0.5;
			return usd / (1 + 0.08 * (1 - p));
		},
		feeDescription: "~8% probability-weighted",
		feeTooltip:
			"Kalshi Frost-tier fee: roundup(0.07 × C × p × (1−p)) + 0.01 × C × p × (1−p). Fee is in contracts, shown as USDC equivalent.",
	},
};

export function getVenueConfig(venue: TradingVenue): VenueConfig {
	return VENUE_CONFIGS[venue];
}
