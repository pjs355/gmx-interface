import bs58 from "bs58";
import {
	Transaction,
	VersionedTransaction,
	type Connection,
} from "@solana/web3.js";
import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import { createSolanaConnectionForWalletSend } from "@/config/rpc";
import { formatPrivySponsoredSolanaFailureBlock } from "@/trading/solana/privyRpcSimulationDebug";

/**
 * Privy Solana TEE-backed sponsored submission.
 *
 * Requires:
 *   - `@privy-io/react-auth` 3.x
 *   - App migrated to Privy TEE execution (dashboard)
 *   - Solana gas sponsorship enabled in the dashboard with sufficient credits
 *
 * The embedded wallet does not need to hold SOL — Privy signs inside the TEE and pays fees
 * from dashboard sponsorship credits.
 */

type SolanaChain = "solana:mainnet" | "solana:devnet" | "solana:testnet";

export type PrivySolanaSignAndSendTransaction = (input: {
	transaction: Uint8Array;
	wallet: ConnectedStandardSolanaWallet;
	chain?: SolanaChain;
	options?: { sponsor?: boolean };
}) => Promise<{ signature: Uint8Array }>;

/** Max re-refresh + resubmit attempts when Privy rejects the blockhash. */
const BLOCKHASH_RETRY_ATTEMPTS = 3;

/** Errors whose root cause is a stale / unknown `recentBlockhash`. */
const BLOCKHASH_ERROR_PATTERNS = [
	/blockhash not found/i,
	/block ?hash/i,
	/expired/i,
];

let cachedConnection: Connection | null = null;
function getSolanaConnection(): Connection {
	if (!cachedConnection) cachedConnection = createSolanaConnectionForWalletSend();
	return cachedConnection;
}

type DeserializedTx =
	| { kind: "v0"; tx: VersionedTransaction }
	| { kind: "legacy"; tx: Transaction }
	| { kind: "unknown" };

function tryDeserialize(bytes: Uint8Array): DeserializedTx {
	try {
		return { kind: "v0", tx: VersionedTransaction.deserialize(bytes) };
	} catch {
		/* fall through */
	}
	try {
		// `Transaction.from` throws for v0 transactions but parses legacy ones.
		return { kind: "legacy", tx: Transaction.from(bytes) };
	} catch {
		return { kind: "unknown" };
	}
}

function hasAnySignature(tx: VersionedTransaction | Transaction): boolean {
	if (tx instanceof VersionedTransaction) {
		return tx.signatures.some((sig) => sig.some((byte) => byte !== 0));
	}
	return tx.signatures.some((s) => s.signature !== null);
}

/**
 * Replace `recentBlockhash` on the deserialized transaction with a fresh one fetched from
 * our RPC. LI.FI bridge quotes include a blockhash that is typically 30–60s old by the time
 * the user clicks "Sign" (and Privy TEE's submit RPC may not have seen that slot yet),
 * which surfaces as `Blockhash not found` during simulation.
 *
 * We only rewrite the blockhash when no signer has placed a signature yet — some Solana
 * bridge routes (e.g. deBridge, Mayan) ship the transaction partially-signed by the
 * partner, and changing the message would invalidate those signatures.
 *
 * Returns the refreshed bytes plus a tag used for retry logic.
 */
async function refreshBlockhashIfUnsigned(
	serializedTransaction: Uint8Array,
): Promise<{ bytes: Uint8Array; refreshed: boolean; reason: string }> {
	const parsed = tryDeserialize(serializedTransaction);
	if (parsed.kind === "unknown") {
		return { bytes: serializedTransaction, refreshed: false, reason: "not-deserializable" };
	}

	if (hasAnySignature(parsed.tx)) {
		return { bytes: serializedTransaction, refreshed: false, reason: "partner-pre-signed" };
	}

	try {
		const conn = getSolanaConnection();
		// Use `finalized` so every Solana RPC (including Privy's server-side simulate RPC,
		// which may differ from our client RPC) is guaranteed to know the hash. The
		// finalized lag (~12-15s) still leaves ~45s of the 150-slot validity window,
		// which is far more than we need for a TEE-sponsored send.
		const { blockhash } = await conn.getLatestBlockhash("finalized");
		if (parsed.kind === "v0") {
			parsed.tx.message.recentBlockhash = blockhash;
			return { bytes: parsed.tx.serialize(), refreshed: true, reason: "v0-refreshed" };
		}
		parsed.tx.recentBlockhash = blockhash;
		// Legacy `Transaction.serialize()` verifies signatures; use `serializeMessage` + empty sigs path.
		return {
			bytes: parsed.tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
			refreshed: true,
			reason: "legacy-refreshed",
		};
	} catch (err) {
		if (typeof console !== "undefined") {
			console.warn("[privySponsoredSolana] blockhash refresh failed", err);
		}
		return { bytes: serializedTransaction, refreshed: false, reason: "refresh-error" };
	}
}

function isBlockhashError(err: unknown): boolean {
	const msg =
		err instanceof Error
			? err.message
			: typeof err === "string"
				? err
				: "";
	return BLOCKHASH_ERROR_PATTERNS.some((re) => re.test(msg));
}

function extractPrivyErrorMessage(err: unknown): string {
	if (!err) return "unknown";
	if (err instanceof Error) return err.message;
	if (typeof err === "object") {
		// Privy sometimes throws plain objects with `{ message, code, data }`.
		const anyErr = err as { message?: unknown; error?: unknown; data?: unknown };
		if (typeof anyErr.message === "string") return anyErr.message;
		if (typeof anyErr.error === "string") return anyErr.error;
		try {
			return JSON.stringify(err);
		} catch {
			return String(err);
		}
	}
	return String(err);
}

/**
 * Send a Solana transaction via Privy's sponsored path and return the base58 signature.
 *
 * Retries on blockhash-expiry errors with a freshly fetched blockhash each time, up to
 * `BLOCKHASH_RETRY_ATTEMPTS`. Non-blockhash errors are rethrown immediately with the
 * Privy error message surfaced so callers/UI can display a meaningful reason instead
 * of the opaque `Bad Request` status.
 */
export async function sendPrivySponsoredSolanaTransaction(
	signAndSendTransaction: PrivySolanaSignAndSendTransaction,
	wallet: ConnectedStandardSolanaWallet,
	serializedTransaction: Uint8Array,
	chain: SolanaChain = "solana:mainnet",
): Promise<string> {
	let lastError: unknown;
	let bytesToSend = serializedTransaction;

	for (let attempt = 0; attempt < BLOCKHASH_RETRY_ATTEMPTS; attempt++) {
		const { bytes, refreshed, reason } = await refreshBlockhashIfUnsigned(bytesToSend);
		bytesToSend = bytes;

		if (typeof console !== "undefined") {
			console.debug(
				`[privySponsoredSolana] attempt=${attempt} refresh=${refreshed} reason=${reason}`,
			);
		}

		try {
			const { signature } = await signAndSendTransaction({
				transaction: bytesToSend,
				wallet,
				chain,
				options: { sponsor: true },
			});
			return bs58.encode(signature);
		} catch (err) {
			lastError = err;
			const msg = extractPrivyErrorMessage(err);
			if (typeof console !== "undefined") {
				console.warn(
					`[privySponsoredSolana] send failed (attempt ${attempt}): ${msg}`,
				);
				console.warn(
					formatPrivySponsoredSolanaFailureBlock({
						serializedTx: bytesToSend,
						privyThrownError: err,
					}),
				);
			}

			// Only retry on blockhash errors — and only when we can rewrite the blockhash
			// (unsigned v0/legacy). For partner-pre-signed txs, a retry can't help.
			if (!isBlockhashError(err) || reason === "partner-pre-signed") {
				const wrapped = new Error(msg);
				(wrapped as { cause?: unknown }).cause = err;
				throw wrapped;
			}
			// Loop to refresh blockhash and retry.
		}
	}

	const finalMsg = extractPrivyErrorMessage(lastError);
	const wrapped = new Error(
		`Solana transaction rejected after ${BLOCKHASH_RETRY_ATTEMPTS} attempts: ${finalMsg}`,
	);
	(wrapped as { cause?: unknown }).cause = lastError;
	throw wrapped;
}
