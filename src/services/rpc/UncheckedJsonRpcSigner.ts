import { JsonRpcSigner, TransactionRequest, TransactionResponse } from "ethers";

export const BASE_CHAIN_ID = 8453;

export function useChainId() {
	return BASE_CHAIN_ID;
}

export function getChainName(chainId: number) {
	return chainId === BASE_CHAIN_ID ? "Base" : "Unknown";
}

export const SUPPORTED_CHAINS = [BASE_CHAIN_ID];

export class UncheckedJsonRpcSigner extends JsonRpcSigner {
	async estimateGas(tx: TransactionRequest): Promise<bigint> {
		await this.assertNetwork();

		return super.estimateGas(tx);
	}

	async sendTransaction(
		transaction: TransactionRequest
	): Promise<TransactionResponse> {
		await this.assertNetwork();

		return this.sendUncheckedTransaction(transaction).then((hash) => {
			return {
				hash,
				nonce: null,
				gasLimit: null,
				gasPrice: null,
				data: null,
				value: null,
				chainId: null,
				confirmations: 0,
				from: null,
				wait: (confirmations?: number) => {
					return this.provider.waitForTransaction(
						hash,
						confirmations
					);
				},
			} as unknown as TransactionResponse;
		});
	}

	private async assertNetwork() {
		// Sometimes getNetwork call asserts the network itself, but its metamask, so we need to check it again
		const assumedChainId = Number(
			(await this.provider.getNetwork()).chainId
		);
		const realChainId = 8453;

		if (realChainId !== undefined && assumedChainId !== realChainId) {
			throw new Error(
				`Invalid network: wallet is connected to ${realChainId}, but the app is on ${assumedChainId}`
			);
		}
	}
}
