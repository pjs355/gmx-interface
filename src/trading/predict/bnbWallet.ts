import { BrowserProvider, type Eip1193Provider } from "ethers";
import { PRIVY_SPONSOR_BSC_GAS } from "@/config/privyBscGas";

const BNB_MAINNET_HEX = "0x38";

const BNB_MAINNET_PARAMS = {
	chainId: BNB_MAINNET_HEX,
	chainName: "BNB Smart Chain",
	nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
	rpcUrls: ["https://bsc-dataseed.binance.org"],
	blockExplorerUrls: ["https://bscscan.com"],
} as const;

/** BSC mainnet only — fixed chain id for `BrowserProvider`. */
const BSC_MAINNET_CHAIN_ID = 56;

/**
 * Answer chain identity locally so ethers / Predict SDK do not ping the wallet RPC
 * (often a rate-limited public URL) before every `eth_call`.
 */
function wrapEthereumBscMainnetLocalChainMeta(
	ethereum: Eip1193Provider
): Eip1193Provider {
	return {
		request: (args) => {
			if (args.method === "eth_chainId") {
				return Promise.resolve(BNB_MAINNET_HEX);
			}
			if (args.method === "net_version") {
				return Promise.resolve("56");
			}
			return ethereum.request(args);
		},
	};
}

/**
 * When Privy sponsorship is off, pass `sponsor: false` on `eth_sendTransaction` so the
 * embedded wallet pays BNB gas (see Privy / viem extended tx fields).
 */
function wrapEthereumNoBscSponsor(
	ethereum: Eip1193Provider
): Eip1193Provider {
	if (PRIVY_SPONSOR_BSC_GAS) return ethereum;
	return {
		request: (args) => {
			if (
				args.method === "eth_sendTransaction" &&
				Array.isArray(args.params) &&
				args.params[0] &&
				typeof args.params[0] === "object"
			) {
				const tx = {
					...(args.params[0] as Record<string, unknown>),
					sponsor: false,
				};
				return ethereum.request({
					...args,
					params: [tx],
				} as Parameters<Eip1193Provider["request"]>[0]);
			}
			return ethereum.request(args);
		},
	};
}

export async function ensurePredictChain(ethereum: Eip1193Provider): Promise<void> {
	try {
		await ethereum.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: BNB_MAINNET_HEX }],
		});
	} catch (err: unknown) {
		const code = (err as { code?: number })?.code;
		if (code === 4902 || code === -32603) {
			await ethereum.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: BNB_MAINNET_PARAMS.chainId,
						chainName: BNB_MAINNET_PARAMS.chainName,
						nativeCurrency: BNB_MAINNET_PARAMS.nativeCurrency,
						rpcUrls: [...BNB_MAINNET_PARAMS.rpcUrls],
						blockExplorerUrls: [...BNB_MAINNET_PARAMS.blockExplorerUrls],
					},
				],
			});
			return;
		}
		throw err;
	}
}

export function getBscBrowserSigner(ethereum: Eip1193Provider) {
	const piped = wrapEthereumNoBscSponsor(
		wrapEthereumBscMainnetLocalChainMeta(ethereum)
	);
	const provider = new BrowserProvider(piped, BSC_MAINNET_CHAIN_ID);
	return provider.getSigner();
}
