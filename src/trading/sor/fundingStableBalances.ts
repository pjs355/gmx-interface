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
import { getPolygonPublicClient } from "@/config/polygonPublicClient";
import {
	BSC_RPC_URL,
	createSolanaConnectionForJsonRpcReads,
	DEFAULT_RPC_URL,
} from "@/config/rpc";
import { POLYGON_PUSD, POLYGON_USDC_E } from "@/trading/polymarket/constants";
import type { SorChain } from "./sor-types";

/** Keys aligned with `GET /portfolio/cash-summary` / collateral query slices. */
export type CollateralChainKey =
	| "base"
	| "polygon"
	| "bnb"
	| "solana"
	| "limitlessMakerBase";

const basePublic = createPublicClient({
	chain: base,
	transport: http(DEFAULT_RPC_URL),
});

const bscPublic = createPublicClient({
	chain: bsc,
	transport: http(BSC_RPC_URL),
});

/** Same Connection factory as DFlow reads — shares RPC failover with `rpc.ts`. */
const solanaConnection = createSolanaConnectionForJsonRpcReads();
const SOLANA_USDC_MINT_PK = new PublicKey(SOLANA_USDC_MINT);

function isLikelySolanaRpcOrTransportFailure(e: unknown): boolean {
	const text =
		e instanceof Error ? `${e.name} ${e.message} ${String((e as Error).cause ?? "")}` : String(e);
	const m = text.toLowerCase();
	return (
		m.includes("403") ||
		m.includes("-32052") ||
		m.includes("forbidden") ||
		m.includes("api key") ||
		m.includes("connection") ||
		m.includes("econn") ||
		m.includes("fetch") ||
		m.includes("network") ||
		m.includes("timeout") ||
		m.includes("aborted") ||
		m.includes("socket") ||
		m.includes("bad gateway") ||
		m.includes("502") ||
		m.includes("503") ||
		m.includes("504")
	);
}

async function readSolanaUsdcHuman(walletAddress: string): Promise<number> {
	try {
		const owner = new PublicKey(walletAddress);
		const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT_PK, owner);
		const account = await getAccount(solanaConnection, ata);
		return Number(account.amount) / 1e6;
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "";
		const errName = e instanceof Error ? e.name : "";
		// spl-token often throws TokenAccountNotFoundError with an empty `.message`
		// (name only). Treat as zero USDC — no SPL USDC ATA yet for this wallet.
		if (
			errName === "TokenAccountNotFoundError" ||
			msg.includes("could not find account") ||
			msg.includes("TokenAccountNotFoundError")
		) {
			return 0;
		}
		// Public Solana RPCs often 403 or drop connections; do not fail the whole
		// multi-chain `readFundingStableBalancesHuman` Promise.all (SOR prefund, Transfers).
		if (isLikelySolanaRpcOrTransportFailure(e)) {
			const detail = e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240);
			console.warn("[readSolanaUsdcHuman] RPC/transport failure; treating SPL USDC as 0", detail);
			return 0;
		}
		throw e;
	}
}

export type FundingAddressesInput = {
	baseSmartWallet?: string | null;
	/** Limitless server-wallet maker on Base — venue USDC for delegated Limitless legs. */
	limitlessMakerBase?: string | null;
	polymarketSafe?: string | null;
	embeddedEoa?: string | null;
	solanaAddress?: string | null;
};

/**
 * Live funding-stable balances (human decimal strings / numbers) for each SOR chain.
 * Mirrors `useBridgeFundingBalances` query logic for use in prefund orchestration.
 */
export type FundingStableBalancesHuman = Record<SorChain, number> & {
	/** Base USDC on the Limitless maker address (delegated sub-account), distinct from `base` (SCW). */
	limitlessMakerBase?: number;
};

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
	const limitlessAddr =
		addrs.limitlessMakerBase && /^0x[a-fA-F0-9]{40}$/i.test(addrs.limitlessMakerBase)
			? (addrs.limitlessMakerBase as Address)
			: undefined;

	const [baseHuman, polygonHuman, bscHuman, solanaHuman, limitlessHuman] = await Promise.all([
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
			? (() => {
					const pc = getPolygonPublicClient();
					return Promise.all([
						pc.readContract({
							address: POLYGON_PUSD,
							abi: erc20Abi,
							functionName: "balanceOf",
							args: [safeAddr],
						}),
						pc.readContract({
							address: POLYGON_USDC_E,
							abi: erc20Abi,
							functionName: "balanceOf",
							args: [safeAddr],
						}),
					]).then(([pusdRaw, usdceRaw]) =>
						Number(formatUnits(pusdRaw, 6)) + Number(formatUnits(usdceRaw, 6)),
					);
				})()
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
		limitlessAddr
			? basePublic
					.readContract({
						address: getUSDCAddress() as Address,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [limitlessAddr],
					})
					.then((raw) => Number(formatUnits(raw, 6)))
			: Promise.resolve(0),
	]);

	return {
		base: baseHuman,
		polygon: polygonHuman,
		bnb: bscHuman,
		solana: solanaHuman,
		limitlessMakerBase: limitlessHuman,
	};
}

/**
 * Native Base USDC (6 decimals) raw balance for the smart wallet — same contract as
 * {@link readFundingStableBalancesHuman} `base`, for bigint-safe Limitless SCW→maker sweeps.
 */
export async function readBaseScwUsdcBalanceRaw(
	baseSmartWallet: string | null | undefined,
): Promise<bigint> {
	const baseAddr =
		baseSmartWallet && /^0x[a-fA-F0-9]{40}$/i.test(baseSmartWallet)
			? (baseSmartWallet as Address)
			: undefined;
	if (!baseAddr) return 0n;
	return basePublic.readContract({
		address: getUSDCAddress() as Address,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [baseAddr],
	}) as Promise<bigint>;
}

/**
 * Native Base USDC (6 decimals) on the **Privy embedded EOA**.
 * {@link readFundingStableBalancesHuman} intentionally maps `base` to the SCW only;
 * this helper is for same-chain top-up when LevelUp runs with `bridge: null` (no
 * `executeBridge` / Li.FI prefund) but USDC sits on the embedded address on Base.
 */
export async function readBaseEmbeddedUsdcBalanceRaw(
	embeddedEoa: string | null | undefined,
): Promise<bigint> {
	const addr =
		embeddedEoa && /^0x[a-fA-F0-9]{40}$/i.test(embeddedEoa)
			? (embeddedEoa as Address)
			: undefined;
	if (!addr) return 0n;
	return basePublic.readContract({
		address: getUSDCAddress() as Address,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [addr],
	}) as Promise<bigint>;
}

/** On-chain BNB Chain USDT (BEP-20) balance in wei for LI.FI prefund caps (18 decimals). */
export async function readBnbUsdtBalanceWei(
	embeddedEoa: string | null | undefined,
): Promise<bigint> {
	const bnbAddr =
		embeddedEoa && /^0x[a-fA-F0-9]{40}$/i.test(embeddedEoa)
			? (embeddedEoa as Address)
			: undefined;
	if (!bnbAddr) return 0n;
	return bscPublic.readContract({
		address: BSC_MAINNET_USDT_ADDRESS,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [bnbAddr],
	}) as Promise<bigint>;
}
