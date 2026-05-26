import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { readFundingStableBalancesHuman } from "@/features/trading/sor/prefund/fundingStableBalances";

export const BRIDGE_FUNDING_BALANCES_QUERY_KEY = "bridge-funding-balances" as const;

export function useBridgeFundingBalances(opts: {
	baseSmartWallet?: string | null;
	/** Limitless delegated maker on Base — separate USDC pocket from SCW. */
	limitlessMakerBase?: string | null;
	polymarketSafe?: string | null;
	embeddedEoa?: string | null;
	solanaAddress?: string | null;
	enabled?: boolean;
}) {
	const {
		baseSmartWallet,
		limitlessMakerBase,
		polymarketSafe,
		embeddedEoa,
		solanaAddress,
		enabled = true,
	} = opts;
	const baseAddr =
		baseSmartWallet && /^0x[a-fA-F0-9]{40}$/.test(baseSmartWallet)
			? (baseSmartWallet as Address)
			: undefined;
	const safeAddr =
		polymarketSafe && /^0x[a-fA-F0-9]{40}$/.test(polymarketSafe)
			? (polymarketSafe as Address)
			: undefined;
	const limitlessAddr =
		limitlessMakerBase && /^0x[a-fA-F0-9]{40}$/.test(limitlessMakerBase)
			? (limitlessMakerBase as Address)
			: undefined;
	const bnbAddr =
		embeddedEoa && /^0x[a-fA-F0-9]{40}$/.test(embeddedEoa) ? (embeddedEoa as Address) : undefined;
	const solAddr =
		solanaAddress && solanaAddress.length >= 32 && solanaAddress.length <= 44
			? solanaAddress
			: undefined;

	return useQuery({
		queryKey: [
			BRIDGE_FUNDING_BALANCES_QUERY_KEY,
			baseAddr?.toLowerCase() ?? null,
			limitlessAddr?.toLowerCase() ?? null,
			safeAddr?.toLowerCase() ?? null,
			bnbAddr?.toLowerCase() ?? null,
			solAddr ?? null,
		],
		enabled: enabled && Boolean(baseAddr || limitlessAddr || safeAddr || bnbAddr || solAddr),
		staleTime: 15_000,
		queryFn: async () => {
			const row = await readFundingStableBalancesHuman({
				baseSmartWallet: baseAddr ?? null,
				limitlessMakerBase: limitlessAddr ?? null,
				polymarketSafe: safeAddr ?? null,
				embeddedEoa: bnbAddr ?? null,
				solanaAddress: solAddr ?? null,
			});
			const asHuman = (addr: unknown, n: number) => (addr ? n.toFixed(6) : null);
			return {
				baseUsdcHuman: asHuman(baseAddr, row.base),
				baseLimitlessUsdcHuman: asHuman(limitlessAddr, row.limitlessMakerBase ?? 0),
				polygonUsdcEHuman: asHuman(safeAddr, row.polygon),
				bscUsdtHuman: asHuman(bnbAddr, row.bnb),
				solanaUsdcHuman: asHuman(solAddr, row.solana),
			};
		},
	});
}
