import { Contract, JsonRpcProvider } from "ethers";
import { getCTFAddress } from "@/config/addresses";

const BATCH_SIZE = 20;

/** ERC1155 `balanceOf(wallet, tokenId)` for each id; returns only balances &gt; 0. */
export async function fetchNonZeroCtfBalancesRpc(
	provider: JsonRpcProvider,
	walletAddress: string,
	tokenIds: Iterable<string>,
): Promise<Array<{ tokenId: string; balance: string }>> {
	const ctfContract = new Contract(
		getCTFAddress(),
		["function balanceOf(address account, uint256 id) view returns (uint256)"],
		provider,
	);

	const results: Array<{ tokenId: string; balance: string }> = [];
	const tokenIdArray = Array.from(tokenIds);

	for (let i = 0; i < tokenIdArray.length; i += BATCH_SIZE) {
		const batch = tokenIdArray.slice(i, i + BATCH_SIZE);
		const balancePromises = batch.map(async (tokenId) => {
			try {
				const balance = await ctfContract.balanceOf(walletAddress, tokenId);
				if (balance > 0n) {
					return { tokenId, balance: balance.toString() };
				}
				return null;
			} catch (err) {
				console.error(
					`[fetchNonZeroCtfBalancesRpc] Error fetching tokenId ${tokenId}:`,
					err,
				);
				return null;
			}
		});

		const batchResults = await Promise.all(balancePromises);
		results.push(
			...batchResults.filter(
				(r): r is { tokenId: string; balance: string } => r !== null,
			),
		);
	}

	return results;
}
