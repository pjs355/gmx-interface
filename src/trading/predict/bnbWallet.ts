import { BrowserProvider, type Eip1193Provider } from "ethers";
import {
	createPrivyBscSponsoredProvider,
	type PrivyEvmSendTransaction,
} from "@/trading/bsc/privyBscProvider";

const BNB_MAINNET_HEX = "0x38";

const BNB_MAINNET_PARAMS = {
	chainId: BNB_MAINNET_HEX,
	chainName: "BNB Smart Chain",
	nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
	rpcUrls: ["https://bsc-dataseed.binance.org"],
	blockExplorerUrls: ["https://bscscan.com"],
} as const;

const BSC_MAINNET_CHAIN_ID = 56;

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

/**
 * Returns an ethers `Signer` for BNB Smart Chain whose `sendTransaction` is routed through
 * Privy's TEE-sponsored EVM path. The caller must supply:
 *   - `ethereum`: the raw EIP-1193 provider from `embeddedWallet.getEthereumProvider()`
 *   - `address`: the embedded wallet address (used as `from` + Privy `address` option)
 *   - `sendTransaction`: `useSendTransaction().sendTransaction` from `@privy-io/react-auth`
 */
export function getBscBrowserSigner(args: {
	ethereum: Eip1193Provider;
	address: `0x${string}`;
	sendTransaction: PrivyEvmSendTransaction;
}) {
	const wrapped = createPrivyBscSponsoredProvider({
		baseProvider: args.ethereum,
		address: args.address,
		sendTransaction: args.sendTransaction,
	});
	const provider = new BrowserProvider(wrapped, BSC_MAINNET_CHAIN_ID);
	return provider.getSigner();
}
