import type {
	ChainReadClient,
	LimitlessApprovalsChainReadResult,
	LimitlessFokBuyUsdcPreflightChainReadResult,
} from "@/features/trading/chain-reads/chainReadTypes";
import type { LimitlessVerifyAllowanceResult } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";

function verifyPayload(verify: LimitlessVerifyAllowanceResult) {
	return {
		spender: verify.spender,
		usdcSpenders: verify.usdcSpenders,
		ctfAddress: verify.ctfAddress,
		venueAdapter: verify.venueAdapter,
	};
}

export async function fetchLimitlessApprovalsChainRead(
	chainRead: ChainReadClient,
	args: {
		maker: string;
		verify: LimitlessVerifyAllowanceResult;
	},
): Promise<LimitlessApprovalsChainReadResult> {
	return chainRead.postChainRead({
		venue: "limitless",
		kind: "approvals",
		walletAddress: args.maker,
		verify: verifyPayload(args.verify),
	});
}

export async function fetchLimitlessFokBuyUsdcPreflightChainRead(
	chainRead: ChainReadClient,
	args: {
		maker: string;
		verify: LimitlessVerifyAllowanceResult;
		wireUsd: number;
		feeUsd: number;
	},
): Promise<LimitlessFokBuyUsdcPreflightChainReadResult> {
	return chainRead.postChainRead({
		venue: "limitless",
		kind: "fok-buy-usdc-preflight",
		walletAddress: args.maker,
		verify: verifyPayload(args.verify),
		wireUsd: args.wireUsd,
		feeUsd: args.feeUsd,
	});
}
