import {
	MAX_VALID_PRICE,
	MIN_VALID_PRICE,
} from "@/features/markets/pricing/venueBooksCells";
import { calculateDflowFee } from "@/features/trading/fees/dflow";
import { limitlessNetOutcomeSharesHeldAfterBuy } from "@/features/trading/fees/limitless";
import {
	calculatePolymarketFee,
	POLYMARKET_DEFAULT_FEE_RATE,
} from "@/features/trading/fees/polymarket";
import { predictFunNetOutcomeSharesHeldAfterBuy } from "@/features/trading/fees/predict";

/** Default Predict.fun fee when matched-markets omits per-market bps (matches SOR backend). */
export const ALL_ODDS_DEFAULT_PREDICT_FEE_BPS = 200;

/**
 * Default Myriad peak taker bps when routing omits per-market fees.
 * Sync with predictions/venue-pricing/arb-only/fees/arb-only-venue-fees.test.ts peak case.
 */
export const ALL_ODDS_DEFAULT_MYRIAD_PEAK_TAKER_BPS = 150;

/** Hyperliquid tier-0 taker rate on $1/share settlement — sync with predictions arb-only fees. */
export const HL_TIER0_SETTLEMENT_BPS = 4.5;

const GROSS_CONTRACTS = 1;

function finPrice(p: number): boolean {
	return Number.isFinite(p) && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE;
}

function clampValidPrice(p: number): number | null {
	if (!finPrice(p)) return null;
	return p;
}

function usdcTakerEffective(rawAsk: number, feeUsd: number): number | null {
	return clampValidPrice(rawAsk + feeUsd);
}

function tokenSkimEffective(rawAsk: number, netShares: number): number | null {
	if (!Number.isFinite(netShares) || netShares <= 0) return null;
	return clampValidPrice(rawAsk / netShares);
}

/** Myriad OB taker — sync with predictions/venue-pricing/arb-only/fees/arb-only-venue-fees.ts */
function myriadTakerFeeUsd(shares: number, price: number, peakBps: number): number {
	if (shares <= 0 || price <= 0 || price >= 1 || peakBps <= 0) return 0;
	const feeBps = (peakBps * Math.min(price, 1 - price)) / 0.5;
	return (shares * price * feeBps) / 10_000;
}

/** HL settlement fee on $1/share redemption for one contract. */
function hyperliquidSettlementFeeUsd(): number {
	return (GROSS_CONTRACTS * HL_TIER0_SETTLEMENT_BPS) / 10_000;
}

/** BetDEX 1% commission on For (back) profit at settlement — sync with predictions arb-only fees. */
function betdexForProfitCommissionOnPayout(decimalOdds: number): number {
	if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;
	return Math.round((decimalOdds - 1) * 0.01 * 1e5) / 1e5;
}

/**
 * Implied buy probability after fees for a single contract at the displayed ask.
 * Display-only — raw BBO in the view model is unchanged.
 */
export function effectiveBuyImpliedProb(venueId: string, rawAsk: number | null): number | null {
	if (rawAsk === null || !finPrice(rawAsk)) return null;

	const id = venueId.toLowerCase();

	switch (id) {
		case "polymarket":
			return usdcTakerEffective(
				rawAsk,
				calculatePolymarketFee(GROSS_CONTRACTS, rawAsk, POLYMARKET_DEFAULT_FEE_RATE),
			);
		case "kalshi":
			return usdcTakerEffective(rawAsk, calculateDflowFee(GROSS_CONTRACTS, rawAsk));
		case "predictfun":
			return tokenSkimEffective(
				rawAsk,
				predictFunNetOutcomeSharesHeldAfterBuy(
					GROSS_CONTRACTS,
					rawAsk,
					ALL_ODDS_DEFAULT_PREDICT_FEE_BPS,
				),
			);
		case "limitless":
			return tokenSkimEffective(
				rawAsk,
				limitlessNetOutcomeSharesHeldAfterBuy(GROSS_CONTRACTS, rawAsk),
			);
		case "myraid":
			return usdcTakerEffective(
				rawAsk,
				myriadTakerFeeUsd(GROSS_CONTRACTS, rawAsk, ALL_ODDS_DEFAULT_MYRIAD_PEAK_TAKER_BPS),
			);
		case "hyperliquid": {
			const settlementFee = hyperliquidSettlementFeeUsd();
			if (settlementFee >= 1) return null;
			return clampValidPrice(rawAsk / (1 - settlementFee));
		}
		case "betdex": {
			const feeOnPayout = betdexForProfitCommissionOnPayout(1 / rawAsk);
			if (feeOnPayout >= 1) return null;
			return clampValidPrice(rawAsk / (1 - feeOnPayout));
		}
		case "sxbet":
		case "forkast":
			return rawAsk;
		default:
			return rawAsk;
	}
}
