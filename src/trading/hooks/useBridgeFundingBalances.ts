import { useQuery } from "@tanstack/react-query";
import { readFundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";

export const BRIDGE_FUNDING_BALANCES_QUERY_KEY = "bridge-funding-balances" as const;

export function useBridgeFundingBalances(opts: {
	baseSmartWallet?: string | null;
	polymarketSafe?: string | null;
	embeddedEoa?: string | null;
	solanaAddress?: string | null;
	enabled?: boolean;
}) {
	const { baseSmartWallet, polymarketSafe, embeddedEoa, solanaAddress, enabled = true } = opts;
	const baseAddr =
		baseSmartWallet && /^0x[a-fA-F0-9]{40}$/.test(baseSmartWallet)
			? (baseSmartWallet as Address)
			: undefined;
	const safeAddr =
		polymarketSafe && /^0x[a-fA-F0-9]{40}$/.test(polymarketSafe)
			? (polymarketSafe as Address)
			: undefined;
	const bnbAddr =
		embeddedEoa && /^0x[a-fA-F0-9]{40}$/.test(embeddedEoa)
			? (embeddedEoa as Address)
			: undefined;
	const solAddr =
		solanaAddress && solanaAddress.length >= 32 && solanaAddress.length <= 44
			? solanaAddress
			: undefined;

	return useQuery({
		queryKey: [
			BRIDGE_FUNDING_BALANCES_QUERY_KEY,
			baseAddr?.toLowerCase() ?? null,
			safeAddr?.toLowerCase() ?? null,
			bnbAddr?.toLowerCase() ?? null,
			solAddr ?? null,
		],
		enabled: enabled && Boolean(baseAddr || safeAddr || bnbAddr || solAddr),
		staleTime: 15_000,
		queryFn: async () => {
			const row = await readFundingStableBalancesHuman({
				baseSmartWallet: baseAddr ?? null,
				polymarketSafe: safeAddr ?? null,
				embeddedEoa: bnbAddr ?? null,
				solanaAddress: solAddr ?? null,
			});
			const asHuman = (addr: unknown, n: number) => (addr ? n.toFixed(6) : null);
			return {
				baseUsdcHuman: asHuman(baseAddr, row.base),
				polygonUsdcEHuman: asHuman(safeAddr, row.polygon),
				bscUsdtHuman: asHuman(bnbAddr, row.bnb),
				solanaUsdcHuman: asHuman(solAddr, row.solana),
			};
		},
	});
}
