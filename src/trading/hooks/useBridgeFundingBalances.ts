import { useQuery } from "@tanstack/react-query";
import {
	createPublicClient,
	erc20Abi,
	formatUnits,
	http,
	type Address,
} from "viem";
import { base, bsc, polygon } from "viem/chains";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { BSC_MAINNET_USDT_ADDRESS, SOLANA_USDC_MINT, getUSDCAddress } from "@/config/addresses";
import { BSC_RPC_URL, DEFAULT_RPC_URL, POLYGON_RPC_URL, SOLANA_RPC_URL } from "@/config/rpc";
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

const solanaConnection = new Connection(SOLANA_RPC_URL);
const SOLANA_USDC_MINT_PK = new PublicKey(SOLANA_USDC_MINT);

async function getSolanaUsdcBalance(
	walletAddress: string
): Promise<string | null> {
	try {
		const owner = new PublicKey(walletAddress);
		const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT_PK, owner);
		const account = await getAccount(solanaConnection, ata);
		const raw = account.amount;
		const n = Number(raw) / 1e6;
		return n.toFixed(6);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "";
		if (
			msg.includes("could not find account") ||
			msg.includes("TokenAccountNotFoundError")
		) {
			return "0";
		}
		return null;
	}
}

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
			const [baseHuman, polygonHuman, bscHuman, solanaHuman] = await Promise.all([
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
				solAddr ? getSolanaUsdcBalance(solAddr) : Promise.resolve(null),
			]);
			return {
				baseUsdcHuman: baseHuman,
				polygonUsdcEHuman: polygonHuman,
				bscUsdtHuman: bscHuman,
				solanaUsdcHuman: solanaHuman,
			};
		},
	});
}
