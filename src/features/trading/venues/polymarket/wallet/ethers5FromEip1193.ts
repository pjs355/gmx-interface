import { providers } from "ethers5";

export type Eip1193Like = {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const POLYGON_CHAIN_ID = 137;

/**
 * `ClobClient` expects an ethers v5 {@link JsonRpcSigner}. Privy exposes an
 * EIP-1193 provider; bridge it via ethers v5 `Web3Provider`.
 */
export function ethers5JsonRpcSignerFromEip1193(
	eip1193: Eip1193Like,
	accountAddress: string,
): providers.JsonRpcSigner {
	const web3 = new providers.Web3Provider(eip1193 as providers.ExternalProvider, {
		chainId: POLYGON_CHAIN_ID,
		name: "polygon",
	});
	return web3.getSigner(accountAddress);
}
