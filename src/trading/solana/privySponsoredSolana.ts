import type { Connection, VersionedTransaction } from "@solana/web3.js";

/**
 * Privy Solana `useSendTransaction` shape — fee payer / gas sponsorship when `sponsor: true`.
 */
export type PrivySolanaSendTransaction = (args: {
	transaction: VersionedTransaction;
	connection: Connection;
	sponsor?: boolean;
}) => Promise<{ signature: string }>;

export async function sendPrivySponsoredSolanaTransaction(
	send: PrivySolanaSendTransaction,
	transaction: VersionedTransaction,
	connection: Connection,
): Promise<string> {
	const receipt = await send({
		transaction,
		connection,
		sponsor: true,
	});
	return receipt.signature;
}
