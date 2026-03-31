import { useQuery } from "@tanstack/react-query";
import {
	createPublicClient,
	erc20Abi,
	formatUnits,
	http,
	type Address,
} from "viem";
import { base, bsc, polygon } from "viem/chains";
import { BSC_MAINNET_USDT_ADDRESS, getUSDCAddress } from "@/config/addresses";
import { BSC_RPC_URL, DEFAULT_RPC_URL, POLYGON_RPC_URL } from "@/config/rpc";
import { POLYGON_USDC_E } from "@/trading/polymarket/constants";

export const BRIDGE_FUNDING_BALANCES_QUERY_KEY = "bridge-funding-balances" as const;

const basePublic = createPublicClient({
	chain: base,
	transport: http(DEFAULT_RPC_URL),
});

const polygonPublic = createPublicClient({
	chain: polygon,
	transport: http(POLYGON_RPC_URL),
});

const bscPublic = createPublicClient({
	chain: bsc,
	transport: http(BSC_RPC_URL),
});

export function useBridgeFundingBalances(opts: {
	baseSmartWallet?: string | null;
	polymarketSafe?: string | null;
	embeddedEoa?: string | null;
	enabled?: boolean;
}) {
	const { baseSmartWallet, polymarketSafe, embeddedEoa, enabled = true } = opts;
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

	return useQuery({
		queryKey: [
			BRIDGE_FUNDING_BALANCES_QUERY_KEY,
			baseAddr?.toLowerCase() ?? null,
			safeAddr?.toLowerCase() ?? null,
			bnbAddr?.toLowerCase() ?? null,
		],
		enabled: enabled && Boolean(baseAddr || safeAddr || bnbAddr),
		staleTime: 15_000,
		queryFn: async () => {
			const [baseHuman, polygonHuman, bscHuman] = await Promise.all([
				baseAddr
					? basePublic
							.readContract({
								address: getUSDCAddress() as Address,
								abi: erc20Abi,
								functionName: "balanceOf",
								args: [baseAddr],
							})
							.then((raw) => formatUnits(raw, 6))
					: Promise.resolve(null),
				safeAddr
					? polygonPublic
							.readContract({
								address: POLYGON_USDC_E,
								abi: erc20Abi,
								functionName: "balanceOf",
								args: [safeAddr],
							})
							.then((raw) => formatUnits(raw, 6))
					: Promise.resolve(null),
				bnbAddr
					? bscPublic
							.readContract({
								address: BSC_MAINNET_USDT_ADDRESS,
								abi: erc20Abi,
								functionName: "balanceOf",
								args: [bnbAddr],
							})
							.then((raw) => formatUnits(raw, 18))
					: Promise.resolve(null),
			]);
			return {
				baseUsdcHuman: baseHuman,
				polygonUsdcEHuman: polygonHuman,
				bscUsdtHuman: bscHuman,
			};
		},
	});
}
