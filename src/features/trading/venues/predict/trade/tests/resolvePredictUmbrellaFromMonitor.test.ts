import { describe, expect, it } from "vitest";
import { titlesMatchVenue } from "@/features/markets/presentation/umbrellaDisplayName";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	buildPredictUmbrellaLookup,
	matchVenuePositionToUmbrella,
	predictPositionMatchesUmbrellaInLookup,
} from "../resolvePredictUmbrellaFromMonitor";

const METIZPORT_MARKET_ID = 190072;
const METIZPORT_TOKEN =
	"60521777463336569747204176263470833261583343446174346617269237026426940071191";
const METIZPORT_UMBRELLA_ID = "umbrella-metizport";
const TNC_UMBRELLA_ID = "69fbce6446e43ec45349c951";

function metizportUmbrella(): Umbrella {
	return {
		_id: METIZPORT_UMBRELLA_ID,
		displayName: "Phantom vs Metizport - Match Winner",
		exchangeMatching: {
			predictFun: {
				marketIdA: String(METIZPORT_MARKET_ID),
				tokenIdA: METIZPORT_TOKEN,
				tokenIdB: "999",
			},
		},
	} as Umbrella;
}

function tncUmbrella(): Umbrella {
	return {
		_id: TNC_UMBRELLA_ID,
		displayName: "Favbet vs TNC - Match Winner",
		exchangeMatching: {
			predictFun: {
				marketIdA: "205999",
				tokenIdA: "111",
				tokenIdB: "222",
			},
		},
	} as Umbrella;
}

function metizportPosition(overrides: Partial<VenuePosition> = {}): VenuePosition {
	return {
		venue: "predictfun",
		marketTitle: "Counter-Strike: Phantom vs Metizport (BO3)",
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
		...overrides,
	};
}

describe("titlesMatchVenue Metizport vs TNC", () => {
	it("does not match raw Metizport question to TNC umbrella", () => {
		expect(
			titlesMatchVenue(
				"Favbet vs TNC - Match Winner",
				"Counter-Strike: Phantom vs Metizport (BO3) - European Pro League",
			),
		).toBe(false);
	});
});

describe("predictPositionMatchesUmbrellaInLookup", () => {
	it("maps Metizport token to Metizport umbrella only", () => {
		const lookup = buildPredictUmbrellaLookup(null, [metizportUmbrella(), tncUmbrella()]);
		const pos = metizportPosition();
		expect(predictPositionMatchesUmbrellaInLookup(pos, METIZPORT_UMBRELLA_ID, lookup)).toBe(true);
		expect(predictPositionMatchesUmbrellaInLookup(pos, TNC_UMBRELLA_ID, lookup)).toBe(false);
	});
});

describe("matchVenuePositionToUmbrella predictfun server id", () => {
	it("rejects wrong levelUpUmbrellaId when lookup maps token to another umbrella", () => {
		const umbrellas = [metizportUmbrella(), tncUmbrella()];
		const lookup = buildPredictUmbrellaLookup(null, umbrellas);
		const pos = metizportPosition({
			levelUpUmbrellaId: TNC_UMBRELLA_ID,
			levelUpUmbrellaDisplayName: "Favbet vs TNC - Match Winner",
		});
		const matched = matchVenuePositionToUmbrella(pos, "predictfun", new Map(), umbrellas, lookup);
		expect(matched?._id).toBe(METIZPORT_UMBRELLA_ID);
	});
});
