import { describe, expect, it } from "vitest";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	isPredictPositionResolvedLost,
	predictVenuePositionMatchesPagePredictWiring,
} from "../predictTradeBoxMatch";
import type { PredictMarketDetail } from "../../portfolio/predictMarketApi";

const METIZPORT_MARKET_ID = 190072;
const METIZPORT_TOKEN =
	"60521777463336569747204176263470833261583343446174346617269237026426940071191";
const TNC_UMBRELLA_ID = "69fbce6446e43ec45349c951";

function metizportPosition(): VenuePosition {
	return {
		venue: "predictfun",
		marketTitle: "Phantom vs Metizport - Match Winner",
		outcome: "Phantom",
		shares: 2.22,
		avgPrice: null,
		currentPrice: null,
		cost: null,
		currentValue: 0,
		pnl: null,
		pnlPercent: null,
		tokenId: METIZPORT_TOKEN,
		numericMarketId: METIZPORT_MARKET_ID,
	};
}

function tncPageMonitor(): MatchedMarket {
	return {
		pandaMatchId: "tnc",
		umbrellaId: TNC_UMBRELLA_ID,
		polyConditionId: "0x84cd",
		pandaTeamA: "Favbet",
		pandaTeamB: "TNC",
		polyTokenIdA: "a",
		polyTokenIdB: "b",
		sidesSwapped: false,
		predictFun: {
			marketIdA: "205999",
			tokenIdA: "111",
			tokenIdB: "222",
		},
	} as MatchedMarket;
}

describe("predictVenuePositionMatchesPagePredictWiring", () => {
	it("Metizport position does not match TNC page Predict wiring", () => {
		const pos = metizportPosition();
		const page = tncPageMonitor();
		expect(
			predictVenuePositionMatchesPagePredictWiring(pos, [page], TNC_UMBRELLA_ID, page, undefined),
		).toBe(false);
	});

	it("Metizport position matches when monitor wires Metizport market on that umbrella", () => {
		const pos = metizportPosition();
		const page: MatchedMarket = {
			...tncPageMonitor(),
			predictFun: {
				marketIdA: String(METIZPORT_MARKET_ID),
				tokenIdA: METIZPORT_TOKEN,
				tokenIdB: "other",
				decimalPrecision: 2,
			},
		};
		expect(
			predictVenuePositionMatchesPagePredictWiring(pos, [page], TNC_UMBRELLA_ID, page, undefined),
		).toBe(true);
	});
});

describe("isPredictPositionResolvedLost", () => {
	it("returns true for RESOLVED market with LOST held outcome", () => {
		const detail: PredictMarketDetail = {
			id: METIZPORT_MARKET_ID,
			title: "t",
			question: "q",
			isNegRisk: false,
			isYieldBearing: false,
			feeRateBps: 200,
			tradingStatus: "open",
			status: "RESOLVED",
			decimalPrecision: 2,
			outcomes: [
				{
					name: "Phantom",
					indexSet: 0,
					onChainId: METIZPORT_TOKEN,
					status: "LOST",
				},
				{ name: "Metizport", indexSet: 1, onChainId: "2", status: "WON" },
			],
			conditionId: "0xabc",
		};
		expect(isPredictPositionResolvedLost(metizportPosition(), detail)).toBe(true);
	});
});
