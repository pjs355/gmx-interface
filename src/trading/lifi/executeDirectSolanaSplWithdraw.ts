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
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";

const BLOCKHASH_SEND_MAX_ATTEMPTS = 8;
const BLOCKHASH_RETRY_BASE_MS = 500;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Flatten Privy / web3 errors (custom objects, nested `cause`, `message`). */
function collectErrorText(err: unknown): string {
	const parts: string[] = [];
	const visit = (e: unknown, depth: number) => {
		if (e == null || depth > 8) return;
		if (typeof e === "string") {
			parts.push(e);
			return;
		}
		if (e instanceof Error) {
			if (e.message) parts.push(e.message);
			visit((e as Error & { cause?: unknown }).cause, depth + 1);
			return;
		}
		if (typeof e === "object") {
			const o = e as Record<string, unknown>;
			for (const k of ["message", "detail", "reason", "description"] as const) {
				if (typeof o[k] === "string") parts.push(o[k] as string);
			}
			visit(o.cause, depth + 1);
		}
	};
	visit(err, 0);
	return parts.join("\n");
}

/** Simulation / send failed because `recentBlockhash` is unknown or no longer valid. */
function isRecoverableBlockhashError(err: unknown): boolean {
	const msg = collectErrorText(err) || String(err);
	return (
		/blockhash not found/i.test(msg) ||
		(/simulation failed/i.test(msg) && /blockhash/i.test(msg)) ||
		/expired blockhash/i.test(msg) ||
		/block height exceeded/i.test(msg) ||
		/transaction expired/i.test(msg) ||
		/transaction is not valid until/i.test(msg) ||
		/old blockhash|blockhash.*expired|expired.*blockhash/i.test(msg)
	);
}

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
	solanaSigner: SolanaSignerCapable;
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

	for (let attempt = 0; attempt < BLOCKHASH_SEND_MAX_ATTEMPTS; attempt++) {
		if (attempt > 0) {
			await delay(BLOCKHASH_RETRY_BASE_MS + attempt * 300);
		}

		const instructions = [];
		const destInfo = await args.connection.getAccountInfo(destAta, {
			commitment: "confirmed",
		});
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

		/** Fresh `confirmed` blockhash maximizes remaining validity slots after Privy signs/sponsors. */
		const { blockhash } = await args.connection.getLatestBlockhash("confirmed");
		const message = new TransactionMessage({
			payerKey: owner,
			recentBlockhash: blockhash,
			instructions,
		}).compileToV0Message();

		const tx = new VersionedTransaction(message);
		try {
			return await args.solanaSigner.signAndSendTransaction(tx.serialize());
		} catch (err) {
			if (
				isRecoverableBlockhashError(err) &&
				attempt < BLOCKHASH_SEND_MAX_ATTEMPTS - 1
			) {
				continue;
			}
			throw err;
		}
	}

	throw new Error("Solana withdraw send failed after retries");
}
