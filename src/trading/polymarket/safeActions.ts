import type {
	DepositWalletCall,
	RelayClient,
	RelayerTransaction,
	RelayerTransactionResponse,
	Transaction,
} from "@polymarket/builder-relayer-client";
import {
	buildPolymarketApprovalTransactions,
	checkPolymarketApprovals,
} from "./approvalTxs";

/**
 * The relayer reports `STATE_FAILED` when the deposit-wallet batch reverts on
 * Polygon. We surface a single sentinel so the LI.FI/SOR retry layer can
 * decide whether one auto-retry (fresh nonce + re-sign) is worth attempting.
 */
const POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL =
	"Polymarket deposit wallet relay transaction reverted on-chain";

/**
 * UX hint shown alongside relayed deposit-wallet failures. Most reverts after
 * the deposit wallet migration are insufficient pUSD / missing approval / EOA
 * signature replay; we keep the hint short and non-Safe-specific.
 */
export const POLYGON_POLYMARKET_RELAY_HINT =
	"Wait a few seconds and retry once; avoid running two Polygon spends from the same Polymarket deposit wallet at the same time.";

/**
 * Whether a failed Polygon Polymarket relay attempt is worth **one automatic
 * retry** (fresh `/nonce` + re-sign). Only true for full on-chain reverts —
 * not timeouts (those are ambiguous).
 */
export function isPolymarketSafeRelayOnchainRevert(err: unknown): boolean {
	const m = err instanceof Error ? err.message : String(err);
	return m.includes(POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL);
}

/** Tail of a promise chain — serializes all Polymarket relay usage (LI.FI, wrap, approvals). */
let polygonRelayMutexTail: Promise<unknown> = Promise.resolve();

/**
 * Ensures only one Polymarket `RelayClient` flow runs at a time across the app.
 * Concurrent batch calls share one wallet + one relayer nonce, so racing them
 * causes signature/nonce mismatches at the relayer.
 */
export function withPolygonRelayMutex<T>(fn: () => Promise<T>): Promise<T> {
	const run = polygonRelayMutexTail.then(fn) as Promise<T>;
	polygonRelayMutexTail = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

/** Default deadline window for a deposit-wallet batch signature (10 minutes). */
const DEPOSIT_WALLET_BATCH_DEADLINE_S = 10 * 60;

function depositWalletDeadline(): string {
	return String(Math.floor(Date.now() / 1000) + DEPOSIT_WALLET_BATCH_DEADLINE_S);
}

/**
 * Convert the legacy `Transaction` shape (`to`/`value`/`data`) to the
 * deposit-wallet `DepositWalletCall` shape (`target`/`value`/`data`). The
 * fields are 1:1; we keep callers using `Transaction[]` so existing
 * approval / wrap / LI.FI tx builders don't need to change.
 */
function txsToDepositWalletCalls(txs: Transaction[]): DepositWalletCall[] {
	return txs.map((tx) => ({
		target: tx.to,
		value: tx.value,
		data: tx.data,
	}));
}

/**
 * Submit a batch of Polygon transactions through the deposit wallet under the
 * global mutex, then wait for the relayer to mine. Returns the on-chain tx
 * hash if available.
 *
 * If the relayer rejects the first attempt with `wallet is not registered`
 * (its /submit registry lags behind `getDeployed` by a few seconds after a
 * fresh deploy), we retry with `POST_DEPLOY_BATCH_RETRY_DELAYS_MS`.
 *
 * We also retry on `wallet busy: active action exists` — the relayer keeps an
 * in-flight action open briefly after a batch mines; back-to-back submits
 * (e.g. CTF redeem with pUSD then USDC.e) otherwise get HTTP 400 until the
 * slot clears.
 *
 * Every other relayer 400 is surfaced unchanged — those are genuine batch
 * errors (bad signature, expired deadline, revert) and must not be silently
 * retried.
 */
export async function executePolygonRelayAndWait(
	client: RelayClient,
	txs: Transaction[],
	walletAddress: string,
	description: string,
): Promise<string | undefined> {
	return withPolygonRelayMutex(async () => {
		const calls = txsToDepositWalletCalls(txs);
		const delays = POST_DEPLOY_BATCH_RETRY_DELAYS_MS;
		let lastErr: unknown;
		for (let attempt = 0; attempt <= delays.length; attempt += 1) {
			try {
				// Re-derive the deadline on every retry — the SDK rejects a
				// signed batch whose 10-minute window already started ticking
				// against the very first attempt.
				const resp = await client.executeDepositWalletBatch(
					calls,
					walletAddress,
					depositWalletDeadline(),
				);
				return await waitRelay(resp);
			} catch (err) {
				lastErr = err;
				const retryable =
					isRelayWalletNotRegisteredError(err) ||
					isRelayWalletBusyError(err);
				if (attempt === delays.length || !retryable) {
					throw err;
				}
				if (import.meta.env.DEV) {
					const reason = isRelayWalletBusyError(err)
						? "wallet busy"
						: "wallet not registered";
					console.debug(
						`[polymarket-relay] ${description}: ${reason}, retry ${attempt + 1}/${delays.length} in ${delays[attempt]}ms`,
					);
				}
				await new Promise((r) => setTimeout(r, delays[attempt]));
			}
		}
		throw lastErr;
	});
}

/**
 * Waits for a relayer response to reach a terminal state. Returns the
 * transaction hash if available.
 *
 * `resp.wait()` uses a fixed poll budget (~100 × 2s). On failure it returns
 * `undefined` even when the relayer already knows `STATE_FAILED` — we call
 * `getTransaction()` so users see **revert vs timeout** instead of a single
 * generic error.
 */
export async function waitRelay(
	resp: RelayerTransactionResponse,
): Promise<string | undefined> {
	const mined = await resp.wait();
	if (mined) {
		return mined.transactionHash || resp.transactionHash || undefined;
	}

	let last: RelayerTransaction | undefined;
	try {
		const txs = await resp.getTransaction();
		if (txs?.length) last = txs[0];
	} catch {
		/* relayer list may be empty transiently */
	}

	if (last?.state === "STATE_FAILED") {
		const h =
			last.transactionHash?.trim() ||
			resp.transactionHash?.trim() ||
			resp.hash?.trim() ||
			"";
		const explorer = h ? ` On Polygon, inspect tx ${h} on a block explorer.` : "";
		throw new Error(
			h
				? `${POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL} (tx ${h}).${explorer} Common causes: insufficient pUSD in the deposit wallet for this LI.FI leg, route/slippage mismatch, missing router approval, or replayed/expired EOA signature. ${POLYGON_POLYMARKET_RELAY_HINT}`
				: `${POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL} (STATE_FAILED). ${POLYGON_POLYMARKET_RELAY_HINT}`,
		);
	}

	const submitted = resp.transactionHash?.trim() || resp.hash?.trim() || "";
	throw new Error(
		submitted
			? `Polymarket relayer did not reach a mined confirmation within its poll window (submitted tx ${submitted}). The tx may still confirm — check Polygonscan; if it stays pending, retry the bridge when the network is calmer.`
			: "Polymarket relayer timed out before returning a confirmed transaction hash.",
	);
}

/**
 * Polymarket Polygon deposit wallet `getDeployed` lookup. The relayer needs
 * the wallet "type" to disambiguate Safe vs deposit wallet; we always pass
 * `WALLET` because Safe is fully deprecated on this codebase.
 */
async function isDepositWalletDeployed(
	client: RelayClient,
	walletAddress: string,
): Promise<boolean> {
	return client.getDeployed(walletAddress, "WALLET");
}

/**
 * After a deploy reaches STATE_MINED the wallet is on-chain, but the
 * relayer's wallet-registry index can lag a few seconds before it accepts
 * `executeDepositWalletBatch` for the address. Calling the batch too early
 * returns 400 `wallet registry validation failed: wallet ... is not registered`.
 *
 * We poll `getDeployed(WALLET)` (which is what the registry uses) until it
 * reports true, with a hard cap. Polling is cheap (single GET) and the
 * registry typically catches up within 2–6s.
 */
const REGISTRY_POLL_INTERVAL_MS = 1500;
const REGISTRY_POLL_MAX_ATTEMPTS = 20;

async function waitForDepositWalletRegistered(
	client: RelayClient,
	walletAddress: string,
): Promise<void> {
	for (let attempt = 0; attempt < REGISTRY_POLL_MAX_ATTEMPTS; attempt += 1) {
		try {
			if (await isDepositWalletDeployed(client, walletAddress)) return;
		} catch {
			/* transient; keep polling */
		}
		await new Promise((r) => setTimeout(r, REGISTRY_POLL_INTERVAL_MS));
	}
	throw new Error(
		`Polymarket relayer never registered deposit wallet ${walletAddress} after deploy. Retry in a few seconds; if it persists the relayer is lagging.`,
	);
}

/**
 * Detects the relayer's "wallet not registered" 400. The /submit endpoint's
 * acceptance index lags behind `getDeployed`, so the first batch after a
 * fresh deploy can fail even though `waitForDepositWalletRegistered` already
 * returned true. Catch that specific 400 and let the caller retry — every
 * other 400 (bad signature, stale deadline, malformed call) must surface
 * unchanged so genuine bugs are not silently retried into a long stall.
 */
function isRelayWalletNotRegisteredError(err: unknown): boolean {
	if (!err) return false;
	const msg = err instanceof Error ? err.message : String(err);
	const lc = msg.toLowerCase();
	return (
		lc.includes("wallet is not registered") ||
		lc.includes("wallet registry validation") ||
		(lc.includes("not registered") && lc.includes("wallet"))
	);
}

/** Relayer /submit 400 when another batch for this deposit wallet is still settling. */
function isRelayWalletBusyError(err: unknown): boolean {
	if (!err) return false;
	const msg = err instanceof Error ? err.message : String(err);
	const lc = msg.toLowerCase();
	return (
		lc.includes("wallet busy") ||
		lc.includes("active action exists") ||
		lc.includes("active action")
	);
}

/**
 * Backoff schedule for retrying a relay batch when the relayer's submission
 * index hasn't caught up yet. Total ceiling ~30s before we give up — past
 * that the lag is unusual and the activation hook's outer FAILURE_BACKOFF_MS
 * will pick the slack up on the next run.
 */
const POST_DEPLOY_BATCH_RETRY_DELAYS_MS = [
	1_500, 3_000, 5_000, 8_000, 13_000,
] as const;

/**
 * Deploy the Polymarket deposit wallet for the connected EOA if it has not
 * already been deployed on Polygon. Gasless: signed by the embedded EOA and
 * submitted by the Polymarket relayer.
 *
 * Returns `true` when a deploy was actually submitted, `false` when the
 * wallet was already on-chain. After a fresh deploy this also blocks until
 * the relayer's wallet-registry index sees the wallet (so the immediate next
 * `executeDepositWalletBatch` call doesn't 400 with "not registered").
 */
export async function deployPolymarketDepositWalletIfNeeded(
	client: RelayClient,
	signerAddress: `0x${string}`,
): Promise<boolean> {
	void signerAddress;
	const wallet = await client.deriveDepositWalletAddress();
	if (await isDepositWalletDeployed(client, wallet)) return false;
	await withPolygonRelayMutex(async () => {
		const resp = await client.deployDepositWallet();
		await waitRelay(resp);
	});
	await waitForDepositWalletRegistered(client, wallet);
	return true;
}

/**
 * One batched relay execute for all Polymarket pUSD + ERC-1155 approvals.
 * `walletAddress` is the user's deposit wallet (i.e. the value historically
 * stored as `safeWalletAddress`).
 */
export async function executePolymarketApprovalBatch(
	client: RelayClient,
	walletAddress: string,
): Promise<void> {
	const status = await checkPolymarketApprovals(walletAddress);
	if (status.allApproved) return;
	const txs = buildPolymarketApprovalTransactions();
	await executePolygonRelayAndWait(
		client,
		txs,
		walletAddress,
		"LevelUp Polymarket approvals",
	);
}
