import { describe, expect, it } from "vitest";
import type { ExecuteLifiStepsOptions } from "@/trading/lifi/executeLifiSteps";
import { CHAIN_LIFI_IDS } from "../core/sor-types";
import {
	mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund,
	sorBasePrefundLifiShouldUseEmbeddedSigner,
} from "../prefund/sorPrefundLifiExecutionAlignment";

const BASE = CHAIN_LIFI_IDS.base;
const POLYGON = CHAIN_LIFI_IDS.polygon;

const embedded = "0x230294660af8a2FEF6bE4603272b86f475EAF933";
const scw = "0x9e44123456789012345678901234567890123456";

describe("mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund", () => {
	it("returns the same object when the prefund step does not originate on Base", () => {
		const built: ExecuteLifiStepsOptions = {
			allowanceOwnerByChainId: { [BASE]: scw },
		};
		const out = mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(
			built,
			POLYGON,
			embedded,
		);
		expect(out).toBe(built);
	});

	it("returns the same object when quote fromAddress is not a valid EVM address", () => {
		const built: ExecuteLifiStepsOptions = {
			allowanceOwnerByChainId: { [BASE]: scw },
		};
		const out = mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(
			built,
			BASE,
			"not-an-address",
		);
		expect(out).toBe(built);
	});

	it("overrides Base allowance owner to match LI.FI quote fromAddress (trimmed)", () => {
		const built: ExecuteLifiStepsOptions = {
			allowanceOwnerByChainId: {
				[BASE]: scw,
				[POLYGON]: "0xabc0000000000000000000000000000000000001",
			},
		};
		const spaced = `  ${embedded}  `;
		const out = mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(built, BASE, spaced);
		expect(out).not.toBe(built);
		expect(out.allowanceOwnerByChainId?.[BASE]).toBe(embedded);
		expect(out.allowanceOwnerByChainId?.[POLYGON]).toBe(
			"0xabc0000000000000000000000000000000000001",
		);
	});
});

describe("sorBasePrefundLifiShouldUseEmbeddedSigner", () => {
	it("is true only on Base when quote payer equals embedded EOA", () => {
		expect(
			sorBasePrefundLifiShouldUseEmbeddedSigner({
				chainId: POLYGON,
				quoteFromAddressRaw: embedded,
				embeddedEoaRaw: embedded,
			}),
		).toBe(false);

		expect(
			sorBasePrefundLifiShouldUseEmbeddedSigner({
				chainId: BASE,
				quoteFromAddressRaw: embedded,
				embeddedEoaRaw: embedded.toUpperCase(),
			}),
		).toBe(true);

		expect(
			sorBasePrefundLifiShouldUseEmbeddedSigner({
				chainId: BASE,
				quoteFromAddressRaw: scw,
				embeddedEoaRaw: embedded,
			}),
		).toBe(false);
	});

	it("is false when embedded EOA is missing", () => {
		expect(
			sorBasePrefundLifiShouldUseEmbeddedSigner({
				chainId: BASE,
				quoteFromAddressRaw: embedded,
				embeddedEoaRaw: "   ",
			}),
		).toBe(false);
	});

	it("is false when quote fromAddress is not a valid 20-byte hex string", () => {
		expect(
			sorBasePrefundLifiShouldUseEmbeddedSigner({
				chainId: BASE,
				quoteFromAddressRaw: "0xshort",
				embeddedEoaRaw: "0xshort",
			}),
		).toBe(false);
	});
});
