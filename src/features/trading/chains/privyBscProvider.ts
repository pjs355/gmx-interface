import type { Eip1193Provider } from "ethers";
import type { UnsignedTransactionRequest } from "@privy-io/react-auth";

/**
 * Privy embedded EVM `eth_sendTransaction` does **not** natively support `sponsor` on
 * the raw EIP-1193 provider. To get TEE-backed gas sponsorship, we must call through
 * `useSendTransaction().sendTransaction(input, { sponsor: true })`.
 *
 * This module wraps the embedded wallet's EIP-1193 provider so that `eth_sendTransaction`
 * is transparently routed through the sponsored hook. Everything else is proxied to the
 * base provider unchanged, except `eth_chainId` / `net_version` which we answer locally
 * for BSC mainnet to avoid extra wallet-RPC roundtrips.
 */

/** Matches Privy's `useSendTransaction().sendTransaction` signature (EVM). */
export type PrivyEvmSendTransaction = (
	input: UnsignedTransactionRequest,
	options?: { sponsor?: boolean; address?: string },
) => Promise<{ hash: `0x${string}` }>;

const BSC_CHAIN_HEX = "0x38";
const BSC_CHAIN_ID = 56;

/**
 * Public BSC RPCs reject EIP-1559 txs when `maxPriorityFeePerGas` is too low.
 * Minimum observed in production: 100,000,000 wei (0.1 gwei).
 */
const BSC_MIN_MAX_PRIORITY_FEE_WEI = 100_000_000n;

function parseRpcQuantityHex(hex: unknown): bigint | null {
	if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) return null;
	try {
		return BigInt(hex);
	} catch {
		return null;
	}
}

function toRpcQuantityHex(n: bigint): string {
	const h = n.toString(16);
	return h.length % 2 === 0 ? `0x${h}` : `0x0${h}`;
}

function applyBscEip1559FeeFloors(tx: Record<string, unknown>): void {
	const pri = parseRpcQuantityHex(tx.maxPriorityFeePerGas);
	const max = parseRpcQuantityHex(tx.maxFeePerGas);
	if (pri === null && max === null) return;

	let newPri = pri ?? 0n;
	if (newPri < BSC_MIN_MAX_PRIORITY_FEE_WEI) {
		newPri = BSC_MIN_MAX_PRIORITY_FEE_WEI;
		tx.maxPriorityFeePerGas = toRpcQuantityHex(newPri);
	}
	if (max !== null && max < newPri) {
		tx.maxFeePerGas = toRpcQuantityHex(newPri * 2n);
	}
}

function firstEthSendTransactionParam(params: unknown): Record<string, unknown> | null {
	if (params == null) return null;
	if (Array.isArray(params) && params[0] && typeof params[0] === "object") {
		return params[0] as Record<string, unknown>;
	}
	if (typeof params === "object" && !Array.isArray(params)) {
		return params as Record<string, unknown>;
	}
	return null;
}

type Quantity = string | number | bigint;

/** Translate a raw EIP-1193 `eth_sendTransaction` param into Privy's `UnsignedTransactionRequest`. */
function toUnsignedTransactionRequest(
	raw: Record<string, unknown>,
	fallbackFrom: `0x${string}`,
): UnsignedTransactionRequest {
	const gasLimit = (raw.gasLimit ?? raw.gas) as Quantity | undefined;
	return {
		from: typeof raw.from === "string" ? raw.from : fallbackFrom,
		to: typeof raw.to === "string" ? raw.to : undefined,
		data: typeof raw.data === "string" ? raw.data : undefined,
		value: raw.value as Quantity | undefined,
		nonce: raw.nonce as Quantity | undefined,
		gasLimit,
		gasPrice: raw.gasPrice as Quantity | undefined,
		maxFeePerGas: raw.maxFeePerGas as Quantity | undefined,
		maxPriorityFeePerGas: raw.maxPriorityFeePerGas as Quantity | undefined,
		type: typeof raw.type === "number" ? raw.type : undefined,
		chainId: BSC_CHAIN_ID,
	};
}

/**
 * Serialize all sponsored `eth_sendTransaction` calls per embedded wallet so two
 * code paths can't fire concurrent Privy `signAndSubmit` requests for the same
 * wallet. Privy's TEE wallet RPC (`/api/v1/wallets/:id/rpc`) enforces a
 * per-wallet rate limit, and each sponsored send actually dispatches 2-3
 * internal RPC calls (`recoverEmbeddedWallet`, `signWithUserSigner`,
 * sponsorship validation) — concurrent fires from two unrelated callers
 * (e.g. JIT trade-box approval racing against the background activator)
 * would 429 the bucket immediately.
 *
 * Tasks run back-to-back with no artificial spacing: the post-completion
 * pad we used to insert here was needed back when `OrderBuilder.setApprovals()`
 * fired 10 cross-product approvals on cold onboarding. Now Predict only
 * fires 2 scoped sends per `usePredictTradingSession.setApprovals`, well
 * inside Privy's per-wallet bucket, so the only safeguard we still need is
 * the serialization itself. If a real 429 surfaces, `sendWithBackoffForBscPrivy`
 * picks it up and applies its own retry backoff schedule.
 */
const sponsoredSendQueues = new Map<string, Promise<unknown>>();

function enqueueSponsoredSend<T>(address: `0x${string}`, task: () => Promise<T>): Promise<T> {
	const key = address.toLowerCase();
	const prev = sponsoredSendQueues.get(key) ?? Promise.resolve();
	const next = prev
		.catch(() => {
			/* chain survives prior failures */
		})
		.then(task);
	sponsoredSendQueues.set(key, next);
	// GC: clear slot once this task settles so Map doesn't grow unbounded.
	// `.catch(() => {})` is required: `next.finally(...)` returns a sibling
	// promise that re-rejects when `next` rejects. Without swallowing it
	// here we'd produce a duplicate "Uncaught (in promise)" alongside the
	// caller's own awaited rejection — which is what shows up as repeated
	// "Sponsoring is only supported for wallets on the TEE stack" lines in
	// the console for non-TEE users.
	next
		.finally(() => {
			if (sponsoredSendQueues.get(key) === next) {
				sponsoredSendQueues.delete(key);
			}
		})
		.catch(() => {
			/* caller's await owns the real error */
		});
	return next;
}

/**
 * Privy throws this exact message from `useSendTransaction({ sponsor: true })`
 * when the embedded wallet is not (yet) on the TEE execution stack. With
 * automatic migration enabled (the default and only sane setting), this is
 * *transient*: existing wallets get migrated on next login and brand-new
 * wallets are TEE-native, but the migration is asynchronous — the SDK exposes
 * the wallet as "ready" before the on-server TEE provisioning finishes. If we
 * fire a sponsored send inside that window, Privy reports the wallet's *prior*
 * stack and rejects sponsorship.
 *
 * Treated as retryable below: the existing 4-step backoff will land outside
 * the migration window. We deliberately do *not* fall back to `sponsor: false`
 * — these users have zero BNB, so an unsponsored send only swaps one error
 * for another while hiding the real cause.
 */
export function isPrivyTeeSponsorError(err: unknown): boolean {
	const m =
		err instanceof Error
			? err.message
			: typeof err === "string"
				? err
				: typeof err === "object" && err && "message" in err
					? String((err as { message?: unknown }).message ?? "")
					: "";
	return m.includes("Sponsoring is only supported for wallets on the TEE stack");
}

/** Retryable statuses from Privy's wallet-RPC. */
function isRetryableSendError(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	if (isPrivyTeeSponsorError(err)) return true;
	const e = err as { status?: number; code?: number; message?: string };
	if (
		e.status === 429 ||
		e.status === 408 ||
		e.status === 502 ||
		e.status === 503 ||
		e.status === 504
	) {
		return true;
	}
	const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
	return (
		msg.includes("too many requests") ||
		msg.includes("rate limit") ||
		msg.includes("timeout") ||
		msg.includes("timed out")
	);
}

/** Queue per embedded wallet so LI.FI / Predict bursts do not 400/429 Privy's wallet RPC. */
export function runQueuedBnbPrivyTask<T>(
	address: `0x${string}`,
	task: () => Promise<T>,
): Promise<T> {
	return enqueueSponsoredSend(address, task);
}

/**
 * Privy's per-wallet rate-limit bucket replenishes on the order of seconds, not
 * milliseconds, so the first retry needs to wait long enough for the window to
 * actually move. The previous schedule started at 500ms and exhausted all four
 * retries before the bucket recovered, producing 13s+ stalls per approval tx
 * and uncaught `PrivyApiError: Too many requests` rejections at the end.
 */
const BSC_PRIVY_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const;

export async function sendWithBackoffForBscPrivy<T>(
	fn: () => Promise<T>,
	label: string,
): Promise<T> {
	const delays = BSC_PRIVY_RETRY_DELAYS_MS;
	let lastErr: unknown;
	for (let i = 0; i <= delays.length; i++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (i === delays.length || !isRetryableSendError(err)) throw err;
			if (import.meta.env.DEV) {
				console.warn(
					`[privyBscProvider] ${label} retry ${i + 1}/${delays.length} after ${delays[i]}ms`,
					err,
				);
			}
			await new Promise((r) => setTimeout(r, delays[i]));
		}
	}
	throw lastErr;
}

/**
 * Wraps a Privy embedded EVM provider so that all `eth_sendTransaction` calls are
 * routed through Privy's `useSendTransaction({ sponsor: true })` for TEE gas sponsorship
 * on BNB Smart Chain. Adds per-wallet serialization + exponential-backoff retry on 429s
 * so bursty SDK flows (e.g. Predict.fun `setApprovals()`) don't trip Privy's rate limit.
 */
export function createPrivyBscSponsoredProvider(args: {
	baseProvider: Eip1193Provider;
	address: `0x${string}`;
	sendTransaction: PrivyEvmSendTransaction;
}): Eip1193Provider {
	const { baseProvider, address, sendTransaction } = args;
	return {
		request: async (req) => {
			if (req.method === "eth_chainId") return BSC_CHAIN_HEX;
			if (req.method === "net_version") return "56";
			if (req.method === "eth_sendTransaction") {
				const raw = firstEthSendTransactionParam(req.params);
				if (raw) {
					applyBscEip1559FeeFloors(raw);
					const input = toUnsignedTransactionRequest(raw, address);
					return runQueuedBnbPrivyTask(address, async () => {
						const { hash } = await sendWithBackoffForBscPrivy(
							() => sendTransaction(input, { sponsor: true, address }),
							`eth_sendTransaction(to=${input.to ?? "?"})`,
						);
						return hash;
					});
				}
			}
			return baseProvider.request(req);
		},
	};
}
