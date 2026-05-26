import { describe, expect, it } from "vitest";
import {
	formatErrorForUser,
	formatLifiErrorForUser,
	formatSorRouteFailureMessage,
	mapDflowOrderError,
	mapPolymarketClobError,
	mapSorApiHttpError,
} from "../normalize";
import { DFLOW_ROUTE_EXPIRED } from "../catalog/trade-execution";
import { LIFI_NO_BRIDGE_STEPS } from "../catalog/lifi";
import { SOR_API_HTTP_ERROR } from "../catalog/sor";
import { POLYMARKET_NO_MARKET_LIQUIDITY, POLYMARKET_RELAYER_WALLET_BUSY } from "../catalog/venues";
import { SOR_NO_SHARES_AVAILABLE } from "../catalog/sor";
import { userMessage } from "../messages";

describe("mapPolymarketClobError", () => {
	it("maps clob-client no match to market liquidity copy", () => {
		expect(mapPolymarketClobError("no match", undefined, "market order")).toBe(
			userMessage(POLYMARKET_NO_MARKET_LIQUIDITY),
		);
	});

	it("maps balance / allowance errors", () => {
		expect(
			mapPolymarketClobError("not enough balance / allowance: balance: 0", 400, "market order"),
		).toMatch(/balance is too low/i);
	});
});

describe("formatErrorForUser", () => {
	it("maps Polymarket relayer wallet busy JSON", () => {
		const err = new Error(
			JSON.stringify({
				error: "request error",
				status: 400,
				data: { error: "wallet busy: active action exists" },
			}),
		);
		expect(formatErrorForUser(err)).toBe(userMessage(POLYMARKET_RELAYER_WALLET_BUSY));
	});

	it("maps Error(no match) for leg / toast display", () => {
		expect(formatErrorForUser(new Error("no match"))).toBe(
			userMessage(POLYMARKET_NO_MARKET_LIQUIDITY),
		);
	});
});

describe("mapSorApiHttpError", () => {
	it("does not include raw body for 500", () => {
		const msg = mapSorApiHttpError(500, '{"error":"internal","stack":"..."}');
		expect(msg).toBe(userMessage(SOR_API_HTTP_ERROR));
		expect(msg).not.toContain("internal");
	});
});

describe("mapDflowOrderError", () => {
	it("maps expired route codes", () => {
		expect(mapDflowOrderError("ROUTE_EXPIRED", "quote expired")).toBe(
			userMessage(DFLOW_ROUTE_EXPIRED),
		);
	});
});

describe("formatLifiErrorForUser", () => {
	it("maps LI.FI bridge step errors", () => {
		expect(formatLifiErrorForUser(new Error("LI.FI returned no bridge steps"))).toBe(
			userMessage(LIFI_NO_BRIDGE_STEPS),
		);
	});
});

describe("formatSorRouteFailureMessage", () => {
	it("maps NO_BOOKS_AVAILABLE buy side to no shares", () => {
		expect(
			formatSorRouteFailureMessage(
				{
					success: false,
					code: "NO_BOOKS_AVAILABLE",
					error: "internal detail only",
				},
				undefined,
				"buy",
			),
		).toBe(userMessage(SOR_NO_SHARES_AVAILABLE));
	});

	it("passes through EXECUTION_NOT_READY server error when present", () => {
		expect(
			formatSorRouteFailureMessage(
				{
					success: false,
					code: "EXECUTION_NOT_READY",
					error: "Complete setup for: Polymarket",
				},
				undefined,
				"buy",
			),
		).toBe("Complete setup for: Polymarket");
	});

	it("does not pass through server error prose as UI copy", () => {
		const msg = formatSorRouteFailureMessage(
			{
				success: false,
				code: "AMOUNT_TOO_SMALL",
				error: "Minimum order size is $5 on Polymarket",
			},
			undefined,
			"buy",
		);
		expect(msg).not.toContain("Polymarket");
		expect(msg).toMatch(/Below trade minimum/i);
	});
});
