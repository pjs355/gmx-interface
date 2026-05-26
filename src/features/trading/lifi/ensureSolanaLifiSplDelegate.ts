import {
	TOKEN_PROGRAM_ID,
	createApproveInstruction,
	getAccount,
	getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import type { LifiSolanaDelegateHint } from "@/types/trading";
import type { SolanaSignerCapable } from "@/features/trading/lifi/sendTransactionTypes";

const OWNER_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Ensures SPL token allowance (delegate) for LI.FI before the aggregator pulls USDC.
 * Skips when the ATA is missing (the main LI.FI tx typically creates it) or allowance is enough.
 */
export async function ensureSolanaSplDelegateAllowanceIfNeeded(args: {
	connection: Connection;
	ownerBase58: string;
	hint: LifiSolanaDelegateHint;
	solanaSigner: SolanaSignerCapable;
}): Promise<string | undefined> {
	const ownerStr = args.ownerBase58.trim();
	if (!OWNER_BASE58_RE.test(ownerStr)) {
		throw new Error("Invalid Solana owner address for LI.FI delegate preflight");
	}

	const owner = new PublicKey(ownerStr);
	const mint = new PublicKey(args.hint.mint.trim());
	const delegate = new PublicKey(args.hint.delegate.trim());

	let amount: bigint;
	try {
		amount = BigInt(args.hint.amountRaw);
	} catch {
		throw new Error("Invalid SPL delegate amount from LI.FI quote");
	}
	if (amount <= 0n) return undefined;

	const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID);

	let acct;
	try {
		acct = await getAccount(args.connection, ata, "confirmed", TOKEN_PROGRAM_ID);
	} catch {
		return undefined;
	}

	if (acct.isFrozen) {
		throw new Error("Solana token account is frozen — cannot approve delegate for LI.FI.");
	}

	const currentDelegate = acct.delegate;
	const delegated = acct.delegatedAmount;
	if (currentDelegate?.equals(delegate) && delegated >= amount) {
		return undefined;
	}

	const { blockhash, lastValidBlockHeight } = await args.connection.getLatestBlockhash("confirmed");

	const tx = new Transaction({
		feePayer: owner,
		recentBlockhash: blockhash,
	}).add(createApproveInstruction(ata, delegate, owner, amount, [], TOKEN_PROGRAM_ID));

	const serialized = tx.serialize({
		requireAllSignatures: false,
		verifySignatures: false,
	});

	const sig = await args.solanaSigner.signAndSendTransaction(serialized);

	await args.connection.confirmTransaction(
		{
			signature: sig,
			blockhash,
			lastValidBlockHeight,
		},
		"confirmed",
	);

	return sig;
}
