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
import {
	BSC_MAINNET_USDT_ADDRESS,
	SOLANA_USDC_MINT,
	getUSDCAddress,
} from "@/config/addresses";
import { BSC_RPC_URL, DEFAULT_RPC_URL, POLYGON_RPC_URL, SOLANA_RPC_URL } from "@/config/rpc";
import { POLYGON_USDC_E } from "@/trading/polymarket/constants";
import type { SorChain } from "./sor-types";

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

async function readSolanaUsdcHuman(walletAddress: string): Promise<number> {
	try {
		const owner = new PublicKey(walletAddress);
		const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT_PK, owner);
		const account = await getAccount(solanaConnection, ata);
		return Number(account.amount) / 1e6;
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "";
		if (
			msg.includes("could not find account") ||
			msg.includes("TokenAccountNotFoundError")
		) {
			return 0;
		}
		throw e;
	}
}

export type FundingAddressesInput = {
	baseSmartWallet?: string | null;
	polymarketSafe?: string | null;
	embeddedEoa?: string | null;
	solanaAddress?: string | null;
};

/**
 * Live funding-stable balances (human decimal strings / numbers) for each SOR chain.
 * Mirrors `useBridgeFundingBalances` query logic for use in prefund orchestration.
 */
export type FundingStableBalancesHuman = Record<SorChain, number>;

export async function readFundingStableBalancesHuman(
	addrs: FundingAddressesInput,
): Promise<FundingStableBalancesHuman> {
	const baseAddr =
		addrs.baseSmartWallet && /^0x[a-fA-F0-9]{40}$/i.test(addrs.baseSmartWallet)
			? (addrs.baseSmartWallet as Address)
			: undefined;
	const safeAddr =
		addrs.polymarketSafe && /^0x[a-fA-F0-9]{40}$/i.test(addrs.polymarketSafe)
			? (addrs.polymarketSafe as Address)
			: undefined;
	const bnbAddr =
		addrs.embeddedEoa && /^0x[a-fA-F0-9]{40}$/i.test(addrs.embeddedEoa)
			? (addrs.embeddedEoa as Address)
			: undefined;
	const solAddr =
		addrs.solanaAddress &&
		addrs.solanaAddress.length >= 32 &&
		addrs.solanaAddress.length <= 44
			? addrs.solanaAddress
			: undefined;

	const [baseHuman, polygonHuman, bscHuman, solanaHuman] = await Promise.all([
		baseAddr
			? basePublic
					.readContract({
						address: getUSDCAddress() as Address,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [baseAddr],
					})
					.then((raw) => Number(formatUnits(raw, 6)))
			: Promise.resolve(0),
		safeAddr
			? polygonPublic
					.readContract({
						address: POLYGON_USDC_E,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [safeAddr],
					})
					.then((raw) => Number(formatUnits(raw, 6)))
			: Promise.resolve(0),
		bnbAddr
			? bscPublic
					.readContract({
						address: BSC_MAINNET_USDT_ADDRESS,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [bnbAddr],
					})
					.then((raw) => Number(formatUnits(raw, 18)))
			: Promise.resolve(0),
		solAddr ? readSolanaUsdcHuman(solAddr) : Promise.resolve(0),
	]);

	return {
		base: baseHuman,
		polygon: polygonHuman,
		bnb: bscHuman,
		solana: solanaHuman,
	};
}
