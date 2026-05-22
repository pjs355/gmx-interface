import { describe, expect, it } from "vitest";
import {
	assertAccountWalletRoles,
	buildVenueAddressChainMap,
	getAccountWalletGate,
	isVacmReady,
} from "./accountWallets";

const SCW = "0x479913a1b8aebc0476a4434fdffaeb14c6c23e9a";
const EOA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAFE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SOL = "So11111111111111111111111111111111111111112";

const PREDICT_KERNEL = "0xdddddddddddddddddddddddddddddddddddddddd";

const FULL = {
	baseSmartWallet: SCW,
	embeddedEoa: EOA,
	polygonSigner: EOA,
	predictMaker: EOA,
	polymarketSafe: SAFE,
	limitlessMakerBase: EOA,
	solanaAddress: SOL,
};

describe("assertAccountWalletRoles", () => {
	it("returns all roles when valid", () => {
		expect(assertAccountWalletRoles(FULL)).toEqual(FULL);
	});

	it("throws listing missing roles", () => {
		expect(() =>
			assertAccountWalletRoles({ ...FULL, polymarketSafe: undefined }),
		).toThrow(/Polymarket deposit wallet/);
	});
});

describe("getAccountWalletGate", () => {
	it("loading when not hydrated", () => {
		const g = getAccountWalletGate(FULL, false);
		expect(g.status).toBe("loading");
	});

	it("ready when hydrated and complete", () => {
		const g = getAccountWalletGate(FULL, true);
		expect(g.status).toBe("ready");
	});
});

describe("buildVenueAddressChainMap", () => {
	it("maps Limitless to embedded EOA", () => {
		const vacm = buildVenueAddressChainMap(assertAccountWalletRoles(FULL));
		expect(vacm.limitless.walletAddress).toBe(EOA);
		expect(vacm.levelup.walletAddress).toBe(SCW);
	});

	it("splits Polymarket deposit vs Polygon signer", () => {
		const vacm = buildVenueAddressChainMap(assertAccountWalletRoles(FULL));
		expect(vacm.polymarket.walletAddress).toBe(SAFE);
		expect(vacm.polymarket.signerAddress).toBe(EOA);
	});

	it("splits Predict maker vs BNB signer when kernel differs", () => {
		const vacm = buildVenueAddressChainMap(
			assertAccountWalletRoles({
				...FULL,
				predictMaker: PREDICT_KERNEL,
			}),
		);
		expect(vacm.predictfun.walletAddress).toBe(PREDICT_KERNEL);
		expect(vacm.predictfun.signerAddress).toBe(EOA);
	});

	it("throws when overview limitless maker does not match embedded EOA", () => {
		expect(() =>
			buildVenueAddressChainMap(
				assertAccountWalletRoles({
					...FULL,
					limitlessMakerBase: "0xcccccccccccccccccccccccccccccccccccccccc",
				}),
			),
		).toThrow(/does not match embedded EOA/i);
	});
});

describe("isVacmReady", () => {
	it("is false without map", () => {
		expect(
			isVacmReady({
				walletGate: { status: "ready", message: null },
				venueAddressChainMap: null,
			}),
		).toBe(false);
	});
});
