import { describe, expect, it } from "vitest";
import {
	chainsForBridgeCorridor,
	chainsForBridgePrefund,
	hasFundingAddressForChain,
} from "./fundingStableBalanceChains";
import type { FundingAddressesInput } from "./fundingStableBalances";

const SCW = "0x479913a1b8aebc0476a4434fdffaeb14c6c23e9a";
const EOA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAFE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MAKER = "0xcccccccccccccccccccccccccccccccccccccccc";
const SOL = "So11111111111111111111111111111111111111112";

describe("hasFundingAddressForChain", () => {
	it("requires valid EVM addresses for base, polygon, bnb, and maker", () => {
		const addrs: FundingAddressesInput = {
			baseSmartWallet: SCW,
			polymarketSafe: SAFE,
			embeddedEoa: EOA,
			limitlessMakerBase: MAKER,
			solanaAddress: SOL,
		};
		expect(hasFundingAddressForChain("base", addrs)).toBe(true);
		expect(hasFundingAddressForChain("polygon", addrs)).toBe(true);
		expect(hasFundingAddressForChain("bnb", addrs)).toBe(true);
		expect(hasFundingAddressForChain("limitlessMakerBase", addrs)).toBe(true);
		expect(hasFundingAddressForChain("solana", addrs)).toBe(true);
	});

	it("returns false when the wallet for that chain is missing", () => {
		expect(hasFundingAddressForChain("polygon", { baseSmartWallet: SCW })).toBe(
			false,
		);
	});
});

describe("chainsForBridgeCorridor", () => {
	it("reads base, bnb, and limitless maker for Base→BNB (Base prefund may split SCW vs maker)", () => {
		const chains = chainsForBridgeCorridor({
			bridge: {
				fromChain: "base",
				toChain: "bnb",
				amount: 5,
				estimatedCost: 0.5,
				estimatedTimeSeconds: 60,
			},
			limitlessBaseDest: false,
		});
		expect(new Set(chains)).toEqual(
			new Set(["base", "bnb", "limitlessMakerBase"]),
		);
	});

	it("does not include polygon or solana when they are not in the corridor", () => {
		const chains = chainsForBridgeCorridor({
			bridge: {
				fromChain: "base",
				toChain: "bnb",
				amount: 5,
				estimatedCost: 0.5,
				estimatedTimeSeconds: 60,
			},
			limitlessBaseDest: false,
		});
		expect(chains).not.toContain("polygon");
		expect(chains).not.toContain("solana");
	});

	it("includes limitless maker when destination is Limitless on Base", () => {
		const chains = chainsForBridgeCorridor({
			bridge: {
				fromChain: "polygon",
				toChain: "base",
				amount: 10,
				estimatedCost: 1,
				estimatedTimeSeconds: 120,
			},
			limitlessBaseDest: true,
		});
		expect(chains).toContain("limitlessMakerBase");
		expect(chains).toContain("base");
		expect(chains).not.toContain("bnb");
	});
});

describe("chainsForBridgePrefund (Transfers compat)", () => {
	it("filters corridor chains to configured wallets only", () => {
		const chains = chainsForBridgePrefund({
			bridge: {
				fromChain: "base",
				toChain: "bnb",
				amount: 5,
				estimatedCost: 0.5,
				estimatedTimeSeconds: 60,
			},
			limitlessBaseDest: false,
			fundingAddresses: {
				baseSmartWallet: SCW,
				embeddedEoa: EOA,
			},
		});
		expect(chains.sort()).toEqual(["base", "bnb"].sort());
	});
});
