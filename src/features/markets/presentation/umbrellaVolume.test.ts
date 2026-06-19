import { describe, expect, it } from "vitest";
import {
	formatUmbrellaCrossVenueVolumeLabel,
	shouldShowHomeCardUmbrellaVolume,
} from "./umbrellaVolume";

describe("umbrellaVolume", () => {
	it("formats cross-venue volume labels", () => {
		expect(formatUmbrellaCrossVenueVolumeLabel(null)).toBeNull();
		expect(formatUmbrellaCrossVenueVolumeLabel(0)).toBe("$0 Vol");
		expect(formatUmbrellaCrossVenueVolumeLabel(1234.2)).toBe("$1,235 Vol");
	});

	it("shows volume on esports match-winner and single-market cards", () => {
		expect(
			shouldShowHomeCardUmbrellaVolume({
				useEsportsMatchWinnerCard: true,
				displayChildrenCount: 3,
				isWorldCupListing: false,
			}),
		).toBe(true);
		expect(
			shouldShowHomeCardUmbrellaVolume({
				useEsportsMatchWinnerCard: false,
				displayChildrenCount: 1,
				isWorldCupListing: false,
			}),
		).toBe(true);
	});

	it("shows volume on World Cup games, groups, futures, and awards", () => {
		expect(
			shouldShowHomeCardUmbrellaVolume({
				useEsportsMatchWinnerCard: false,
				displayChildrenCount: 4,
				isWorldCupListing: true,
			}),
		).toBe(true);
	});

	it("hides volume on generic multi-market cards", () => {
		expect(
			shouldShowHomeCardUmbrellaVolume({
				useEsportsMatchWinnerCard: false,
				displayChildrenCount: 2,
				isWorldCupListing: false,
			}),
		).toBe(false);
	});
});
