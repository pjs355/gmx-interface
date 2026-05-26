import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import type { VenueTokenApprovalRead } from "@/features/trading/approvals/venueTokenApprovalTypes";
import type { LimitlessVerifyAllowanceResult } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import { fetchLimitlessApprovalsChainRead } from "@/features/trading/chain-reads/limitlessChainRead";
import type { ChainReadClient } from "@/features/trading/chain-reads/chainReadTypes";

export const LIMITLESS_APPROVALS_QUERY_KEY = "limitless-approvals" as const;

async function readLimitlessTokenApprovalRead(args: {
	maker: string;
	marketSlug: string;
	chainRead: ChainReadClient;
	postVerifyAllowance: (
		slug: string,
		opts?: { tokenId?: string },
	) => Promise<LimitlessVerifyAllowanceResult>;
}): Promise<VenueTokenApprovalRead> {
	const verify = await args.postVerifyAllowance(args.marketSlug);
	const read = await fetchLimitlessApprovalsChainRead(args.chainRead, {
		maker: args.maker,
		verify,
	});
	return {
		ready: read.ready,
		ctf: read.ctf,
		collateral: read.collateral,
	};
}

/**
 * Read-only Limitless token approvals on Base (USDC + CTF operators).
 * Uses verify-allowance for spender addresses, then server-side chain reads.
 */
export function useLimitlessApprovalsStatus(
	makerAddress: string | null | undefined,
	marketSlug: string | null | undefined,
	enabled: boolean,
) {
	const api = usePrivateApiClient();
	const maker = makerAddress?.trim() ?? "";
	const slug = marketSlug?.trim() ?? "";
	const queryEnabled = enabled && maker.startsWith("0x") && slug.length > 0;

	return useQuery<VenueTokenApprovalRead>({
		queryKey: [LIMITLESS_APPROVALS_QUERY_KEY, maker.toLowerCase(), slug],
		enabled: queryEnabled,
		staleTime: 15_000,
		retry: 1,
		queryFn: () =>
			readLimitlessTokenApprovalRead({
				maker,
				marketSlug: slug,
				chainRead: api,
				postVerifyAllowance: (s, o) =>
					api.postLimitlessVerifyAllowance(s, o) as Promise<LimitlessVerifyAllowanceResult>,
			}),
		meta: { errorMessage: "Limitless approvals" },
	});
}
