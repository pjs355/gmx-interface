import { describe, expect, it } from "vitest";
import type { VenueAddressChainMap } from "@/context/accountWallets";
import {
	DEPOSIT_DESTINATIONS,
	resolveBaseFiatTarget,
	resolveDepositTarget,
	SOLANA_CAIP2,
} from "./depositDestinations";
import { BSC_MAINNET_USDT_ADDRESS, SOLANA_USDC_MINT, USDC_ADDRESS } from "@/config/addresses";

const SCW = "0x479913a1b8aebc0476a4434fdffaeb14c6c23e9a";
const EOA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PREDICT_KERNEL = "0xdddddddddddddddddddddddddddddddddddddddd";
const SOL = "So11111111111111111111111111111111111111112";

function buildVacm(overrides?: Partial<{ predictMaker: string }>): VenueAddressChainMap {
	const predictMaker = overrides?.predictMaker ?? PREDICT_KERNEL;
	return {
		levelup: {
			venue: "levelup",
			chain: "base",
			walletAddress: SCW,
			signerAddress: SCW,
		},
		limitless: {
			venue: "limitless",
			chain: "base",
			walletAddress: EOA,
			signerAddress: EOA,
		},
		polymarket: {
			venue: "polymarket",
			chain: "polygon",
			walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			signerAddress: EOA,
		},
		predictfun: {
			venue: "predictfun",
			chain: "bnb",
			walletAddress: predictMaker,
			signerAddress: EOA,
		},
		dflow: {
			venue: "dflow",
			chain: "solana",
			walletAddress: SOL,
			signerAddress: SOL,
		},
	};
}

describe("DEPOSIT_DESTINATIONS", () => {
	it("defines exactly three user-facing deposit targets", () => {
		expect(DEPOSIT_DESTINATIONS).toHaveLength(3);
		expect(DEPOSIT_DESTINATIONS.map((d) => d.id)).toEqual([
			"base-usdc",
			"solana-usdc",
			"bnb-usdt",
		]);
	});
});

describe("resolveDepositTarget", () => {
	const vacm = buildVacm();

	it("resolves Base USDC to LevelUp SCW", () => {
		const t = resolveDepositTarget("base-usdc", vacm);
		expect(t).toEqual({
			id: "base-usdc",
			label: "Base USDC",
			chainCaip2: "eip155:8453",
			tokenAddress: USDC_ADDRESS,
			address: SCW,
		});
	});

	it("resolves Solana USDC to DFlow wallet with SPL mint", () => {
		const t = resolveDepositTarget("solana-usdc", vacm);
		expect(t).toEqual({
			id: "solana-usdc",
			label: "Solana USDC",
			chainCaip2: SOLANA_CAIP2,
			tokenAddress: SOLANA_USDC_MINT,
			address: SOL,
		});
	});

	it("resolves BNB USDT to embedded EOA (signerAddress), not predict maker", () => {
		const t = resolveDepositTarget("bnb-usdt", vacm);
		expect(t?.address).toBe(EOA);
		expect(t?.address).not.toBe(PREDICT_KERNEL);
		expect(t).toEqual({
			id: "bnb-usdt",
			label: "BNB USDT",
			chainCaip2: "eip155:56",
			tokenAddress: BSC_MAINNET_USDT_ADDRESS,
			address: EOA,
		});
	});

	it("returns null when vacm is null", () => {
		expect(resolveDepositTarget("base-usdc", null)).toBeNull();
	});

	it("returns null when address is missing", () => {
		const broken = buildVacm();
		broken.dflow.walletAddress = "";
		expect(resolveDepositTarget("solana-usdc", broken)).toBeNull();
	});

	it("returns null for invalid EVM address on BNB", () => {
		const broken = buildVacm();
		broken.predictfun.signerAddress = "not-an-address";
		expect(resolveDepositTarget("bnb-usdt", broken)).toBeNull();
	});
});

describe("resolveBaseFiatTarget", () => {
	it("always targets Base USDC SCW", () => {
		const t = resolveBaseFiatTarget(buildVacm());
		expect(t?.id).toBe("base-usdc");
		expect(t?.address).toBe(SCW);
	});
});
