import {
	createAssociatedTokenAccountIdempotentInstruction,
	createTransferInstruction,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
	Connection,
	PublicKey,
	TransactionMessage,
	VersionedTransaction,
} from "@solana/web3.js";
import type { PrivySolanaSendTransaction } from "@/trading/solana/privySponsoredSolana";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";

/**
 * Same-chain SPL transfer for withdrawals (funding wallet → external recipient).
 * Creates recipient ATA idempotently when missing; payer is the owner (funding wallet).
 */
export async function executeDirectSolanaSplWithdraw(args: {
	mintAddress: string;
	ownerWalletAddress: string;
	recipientAddress: string;
	amountAtomic: bigint;
	connection: Connection;
	privySolanaSend: PrivySolanaSendTransaction;
}): Promise<string> {
	const mint = new PublicKey(args.mintAddress.trim());
	const owner = new PublicKey(args.ownerWalletAddress.trim());
	const recipient = new PublicKey(args.recipientAddress.trim());

	const sourceAta = await getAssociatedTokenAddress(
		mint,
		owner,
		false,
		TOKEN_PROGRAM_ID
	);
	const destAta = await getAssociatedTokenAddress(
		mint,
		recipient,
		false,
		TOKEN_PROGRAM_ID
	);

	const instructions = [];
	const destInfo = await args.connection.getAccountInfo(destAta);
	if (!destInfo) {
		instructions.push(
			createAssociatedTokenAccountIdempotentInstruction(
				owner,
				destAta,
				recipient,
				mint,
				TOKEN_PROGRAM_ID
			)
		);
	}
	instructions.push(
		createTransferInstruction(
			sourceAta,
			destAta,
			owner,
			args.amountAtomic,
			[],
			TOKEN_PROGRAM_ID
		)
	);

	const { blockhash } = await args.connection.getLatestBlockhash("confirmed");
	const message = new TransactionMessage({
		payerKey: owner,
		recentBlockhash: blockhash,
		instructions,
	}).compileToV0Message();

	const tx = new VersionedTransaction(message);
	return sendPrivySponsoredSolanaTransaction(
		args.privySolanaSend,
		tx,
		args.connection
	);
}
