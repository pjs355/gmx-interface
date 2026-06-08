import { describe, expect, it } from "vitest";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import {
	gameFilterResetSelection,
	homeDefaultSelectedTagLabel,
	isHiddenSidebarTagLabel,
	isUmbrellaEndedForHomeCatalog,
	LIVE_PILL_ID,
	LIVE_WINDOW_MS,
	STARTING_SOON_PILL_ID,
	resolveInitialHomeGameFilter,
	resolveStoredHomeGameFilter,
	WORLD_CUP_PILL_ID,
} from "./gameLinkFilters";

const ESPORTS_TAG_ID = "esports-tag-id";

function esportsUmbrella(eventDate: Date, overrides: Partial<Umbrella> = {}): Umbrella {
	return {
		_id: "u1",
		displayName: "Team A vs Team B",
		active: true,
		eventDate,
		children: [{ tagIds: [ESPORTS_TAG_ID] }],
		...overrides,
	} as Umbrella;
}

describe("homeDefaultSelectedTagLabel", () => {
	it("defaults to Live on first load", () => {
		expect(homeDefaultSelectedTagLabel([])).toBe(LIVE_PILL_ID);
		expect(gameFilterResetSelection([])).toBe(LIVE_PILL_ID);
	});
});

describe("resolveStoredHomeGameFilter", () => {
	const tags = [
		{ _id: "esports", label: "ESPORTS" },
		{ _id: "cs2", label: "CS2" },
	] as const;

	it("accepts live and starting soon pills", () => {
		expect(resolveStoredHomeGameFilter(LIVE_PILL_ID, tags as any)).toBe(LIVE_PILL_ID);
		expect(resolveStoredHomeGameFilter(STARTING_SOON_PILL_ID, tags as any)).toBe(
			STARTING_SOON_PILL_ID,
		);
	});

	it("accepts known game tag labels", () => {
		expect(resolveStoredHomeGameFilter("CS2", tags as any)).toBe("CS2");
	});

	it("rejects unknown labels", () => {
		expect(resolveStoredHomeGameFilter("Valorant", tags as any)).toBeNull();
		expect(resolveStoredHomeGameFilter(null, tags as any)).toBeNull();
	});

	it("redirects the hidden FIFA World Cup tag to the synthetic World Cup pill", () => {
		expect(resolveStoredHomeGameFilter("FIFA World Cup", tags as any)).toBe(WORLD_CUP_PILL_ID);
		// Casing / spacing variants normalize to the same hidden label.
		expect(resolveStoredHomeGameFilter("fifa world cup", tags as any)).toBe(WORLD_CUP_PILL_ID);
	});

	it("accepts the synthetic World Cup pill", () => {
		expect(resolveStoredHomeGameFilter(WORLD_CUP_PILL_ID, tags as any)).toBe(WORLD_CUP_PILL_ID);
	});
});

describe("isHiddenSidebarTagLabel", () => {
	it("matches FIFA World Cup label variants", () => {
		expect(isHiddenSidebarTagLabel("FIFA World Cup")).toBe(true);
		expect(isHiddenSidebarTagLabel("fifa world cup")).toBe(true);
		expect(isHiddenSidebarTagLabel("FIFA  World  Cup")).toBe(true);
	});

	it("leaves unrelated labels visible", () => {
		expect(isHiddenSidebarTagLabel("World Cup")).toBe(false);
		expect(isHiddenSidebarTagLabel("CS2")).toBe(false);
		expect(isHiddenSidebarTagLabel("FIFA")).toBe(false);
	});
});

describe("resolveInitialHomeGameFilter", () => {
	it("falls back to Live when stored filter is invalid", () => {
		expect(resolveInitialHomeGameFilter([])).toBe(LIVE_PILL_ID);
	});
});

describe("isUmbrellaEndedForHomeCatalog", () => {
	it("returns false for upcoming esports match", () => {
		const eventDate = new Date("2030-06-01T18:00:00Z");
		const now = eventDate.getTime() - 60 * 60 * 1000;
		expect(isUmbrellaEndedForHomeCatalog(esportsUmbrella(eventDate), now, ESPORTS_TAG_ID)).toBe(
			false,
		);
	});

	it("returns false during live window", () => {
		const eventDate = new Date("2030-06-01T18:00:00Z");
		const now = eventDate.getTime() + LIVE_WINDOW_MS - 60 * 1000;
		expect(isUmbrellaEndedForHomeCatalog(esportsUmbrella(eventDate), now, ESPORTS_TAG_ID)).toBe(
			false,
		);
	});

	it("returns true after live window", () => {
		const eventDate = new Date("2030-06-01T18:00:00Z");
		const now = eventDate.getTime() + LIVE_WINDOW_MS + 1;
		expect(isUmbrellaEndedForHomeCatalog(esportsUmbrella(eventDate), now, ESPORTS_TAG_ID)).toBe(
			true,
		);
	});

	it("returns false when esports umbrella has no event date", () => {
		const now = Date.now();
		expect(
			isUmbrellaEndedForHomeCatalog(
				esportsUmbrella(new Date("2030-01-01T00:00:00Z"), { eventDate: undefined }),
				now,
				ESPORTS_TAG_ID,
			),
		).toBe(false);
	});

	it("returns true for daily umbrella past endDate", () => {
		const endDate = new Date("2020-01-01T00:00:00Z");
		const umbrella = {
			_id: "daily",
			displayName: "Daily market",
			active: true,
			endDate,
			children: [{ tagIds: ["daily-tag"] }],
		} as unknown as Umbrella;
		expect(isUmbrellaEndedForHomeCatalog(umbrella, Date.now(), ESPORTS_TAG_ID)).toBe(true);
	});
});
