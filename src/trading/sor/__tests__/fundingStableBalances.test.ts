import { describe, expect, it, vi, beforeEach } from "vitest";

const { readContract } = vi.hoisted(() => ({
	readContract: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
	const actual = await importOriginal<typeof import("viem")>();
	return {
		...actual,
		createPublicClient: () => ({ readContract }),
	};
});

import {
	readFundingStableBalancesForChains,
	zeroFundingStableBalancesHuman,
} from "../prefund/fundingStableBalances";

vi.mock("@/config/polygonPublicClient", () => ({
	getPolygonPublicClient: () => ({ readContract }),
}));

vi.mock("@/config/rpc", () => ({
	DEFAULT_RPC_URL: "http://base.test",
	BSC_RPC_URL: "http://bsc.test",
	createSolanaConnectionForJsonRpcReads: () => ({}),
}));

vi.mock("@solana/spl-token", () => ({
	getAssociatedTokenAddress: vi.fn(),
	getAccount: vi.fn(),
}));

describe("readFundingStableBalancesForChains", () => {
	beforeEach(() => {
		readContract.mockReset();
		readContract.mockResolvedValue(10n ** 18n);
	});

	it("returns zeros for chains not requested", async () => {
		const row = await readFundingStableBalancesForChains(
			{
				embeddedEoa: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
			["bnb"],
		);
		expect(row.bnb).toBe(1);
		expect(row.base).toBe(0);
		expect(row.polygon).toBe(0);
		expect(row.solana).toBe(0);
		expect(readContract).toHaveBeenCalledTimes(1);
	});

	it("zeroFundingStableBalancesHuman matches full shape", () => {
		expect(zeroFundingStableBalancesHuman()).toEqual({
			base: 0,
			polygon: 0,
			bnb: 0,
			solana: 0,
			limitlessMakerBase: 0,
		});
	});
});
