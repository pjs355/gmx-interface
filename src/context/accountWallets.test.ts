import { describe, expect, it } from "vitest";
import type { WalletDescriptor } from "@/types/trading";
import {
	assertAccountWalletRoles,
	buildVenueAddressChainMap,
	getAccountWalletGate,
	isVacmReady,
	requireVenueAddressChainMapForExecute,
	overviewWalletIsEvmSmartWallet,
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

describe("requireVenueAddressChainMapForExecute", () => {
	it("returns map when gate is ready", () => {
		const vacm = buildVenueAddressChainMap(assertAccountWalletRoles(FULL));
		expect(
			requireVenueAddressChainMapForExecute(vacm, {
				status: "ready",
				message: null,
			}),
		).toBe(vacm);
	});

	it("throws when gate is blocked", () => {
		expect(() =>
			requireVenueAddressChainMapForExecute(null, {
				status: "blocked",
				message: "Missing Solana wallet.",
			}),
		).toThrow(/Solana wallet/);
	});

	it("throws when gate is ready but map is null", () => {
		expect(() =>
			requireVenueAddressChainMapForExecute(null, {
				status: "ready",
				message: null,
			}),
		).toThrow(/Finishing wallet setup/);
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

function firstSmartOverviewAddress(wallets: WalletDescriptor[]): string | undefined {
	const w = wallets.find(overviewWalletIsEvmSmartWallet);
	const a = typeof w?.address === "string" ? w.address.trim() : "";
	return a || undefined;
}

describe("overviewWalletIsEvmSmartWallet", () => {
	it("matches server AccountOverview shape walletType smart + chainFamily evm without kind", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			chainFamily: "evm",
			address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches walletType smart when chainFamily is omitted (server synthetic rows)", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("rejects walletType smart on solana chainFamily", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			chainFamily: "solana",
			address: "SoLana111",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(false);
	});

	it("matches legacy kind smart_wallet", () => {
		const w: WalletDescriptor = {
			kind: "smart_wallet",
			address: "0xcccccccccccccccccccccccccccccccccccccccc",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches legacy kind coinbase_smart_wallet", () => {
		const w: WalletDescriptor = {
			kind: "coinbase_smart_wallet",
			address: "0xdddddddddddddddddddddddddddddddddddddddd",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches evmSmartWallet role tag on evm row", () => {
		const w: WalletDescriptor = {
			chainFamily: "evm",
			walletRoleTags: ["evmSmartWallet"],
			address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("rejects embedded walletType", () => {
		const w: WalletDescriptor = {
			walletType: "embedded",
			chainFamily: "evm",
			address: "0xffffffffffffffffffffffffffffffffffffffff",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(false);
	});

	it("picks trimmed address from first matching row", () => {
		const wallets: WalletDescriptor[] = [
			{ walletType: "embedded", chainFamily: "evm", address: "0x1111111111111111111111111111111111111111" },
			{ walletType: "smart", chainFamily: "evm", address: "  0x2222222222222222222222222222222222222222  " },
		];
		expect(firstSmartOverviewAddress(wallets)).toBe("0x2222222222222222222222222222222222222222");
	});
});
