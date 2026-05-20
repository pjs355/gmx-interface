import { describe, expect, it } from "vitest";
import {
	isListingUntradeableEmptyBook,
	shouldSuppressBuyVenueQuotes,
} from "./predictionUtils";

describe("isListingUntradeableEmptyBook", () => {
	it("is true when both sides are missing", () => {
		expect(isListingUntradeableEmptyBook(null, null)).toBe(true);
		expect(isListingUntradeableEmptyBook(undefined, undefined)).toBe(true);
	});

	it("is true when both sides are ~0¢", () => {
		expect(isListingUntradeableEmptyBook(0, 0)).toBe(true);
		expect(isListingUntradeableEmptyBook(0.01, 0)).toBe(true);
	});

	it("is true when one side is missing and the other is ~0¢", () => {
		expect(isListingUntradeableEmptyBook(null, 0)).toBe(true);
		expect(isListingUntradeableEmptyBook(0, null)).toBe(true);
	});

	it("is false when at least one side has a tradeable quote", () => {
		expect(isListingUntradeableEmptyBook(0.5, null)).toBe(false);
		expect(isListingUntradeableEmptyBook(null, 0.45)).toBe(false);
		expect(isListingUntradeableEmptyBook(0.02, 0.98)).toBe(false);
	});
});

describe("shouldSuppressBuyVenueQuotes", () => {
	it("is false on sell", () => {
		expect(shouldSuppressBuyVenueQuotes("sell", null, null)).toBe(false);
	});

	it("is true when both sides are empty on buy", () => {
		expect(shouldSuppressBuyVenueQuotes("buy", null, null)).toBe(true);
	});

	it("is false when only one side is empty", () => {
		expect(shouldSuppressBuyVenueQuotes("buy", null, 0.55)).toBe(false);
		expect(shouldSuppressBuyVenueQuotes("buy", 0.45, null)).toBe(false);
	});
});
