import { describe, expect, it } from "vitest";
import {
	appendFormatQuery,
	formatQueryParamValue,
	parseFormatQueryParam,
	searchParamsFormatMatches,
	syncFormatInSearchParams,
} from "../oddsFormatQuery";

describe("parseFormatQueryParam", () => {
	it("maps cents alias to default", () => {
		expect(parseFormatQueryParam("cents")).toBe("default");
		expect(parseFormatQueryParam("american")).toBe("american");
	});

	it("falls back for unknown values", () => {
		expect(parseFormatQueryParam("fancy")).toBe("default");
		expect(parseFormatQueryParam(null)).toBe("default");
	});
});

describe("formatQueryParamValue", () => {
	it("returns null for default", () => {
		expect(formatQueryParamValue("default")).toBeNull();
		expect(formatQueryParamValue("american")).toBe("american");
	});
});

describe("appendFormatQuery", () => {
	it("omits param for default", () => {
		expect(appendFormatQuery("https://clutchcomet.com/predictions/umbrella/x", "default")).toBe(
			"https://clutchcomet.com/predictions/umbrella/x",
		);
	});

	it("appends format for non-default", () => {
		expect(appendFormatQuery("https://clutchcomet.com/predictions/umbrella/x", "decimal")).toBe(
			"https://clutchcomet.com/predictions/umbrella/x?format=decimal",
		);
	});
});

describe("syncFormatInSearchParams", () => {
	it("adds and removes format param", () => {
		const base = new URLSearchParams("foo=1");
		const withFormat = syncFormatInSearchParams(base, "american");
		expect(withFormat.get("format")).toBe("american");
		expect(withFormat.get("foo")).toBe("1");

		const cleared = syncFormatInSearchParams(withFormat, "default");
		expect(cleared.has("format")).toBe(false);
	});
});

describe("searchParamsFormatMatches", () => {
	it("matches default when param absent", () => {
		expect(searchParamsFormatMatches(new URLSearchParams(), "default")).toBe(true);
		expect(searchParamsFormatMatches(new URLSearchParams("format=american"), "default")).toBe(
			false,
		);
	});
});
