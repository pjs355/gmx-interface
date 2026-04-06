import { useQuery } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { SOLANA_RPC_URL } from "@/config/rpc";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

/**
 * Reads the Token-2022 balance for a single DFlow outcome mint held by a wallet.
 * Returns the human-readable share count (uiAmount) or 0 if none held.
 */
export function useDflowOutcomeBalance(
	solanaAddress: string | null | undefined,
	outcomeMint: string | null | undefined,
) {
	return useQuery<number>({
		queryKey: ["dflow-outcome-balance", solanaAddress ?? null, outcomeMint ?? null],
		enabled: Boolean(solanaAddress) && Boolean(outcomeMint),
		staleTime: 10_000,
		queryFn: async () => {
			if (!solanaAddress || !outcomeMint) return 0;

			let owner: PublicKey;
			try {
				owner = new PublicKey(solanaAddress);
			} catch {
				return 0;
			}

			const resp = await connection.getParsedTokenAccountsByOwner(owner, {
				programId: TOKEN_2022_PROGRAM_ID,
				mint: new PublicKey(outcomeMint),
			});

			if (resp.value.length === 0) return 0;
			const info = resp.value[0].account.data.parsed?.info;
			return info?.tokenAmount?.uiAmount ?? 0;
		},
	});
}
