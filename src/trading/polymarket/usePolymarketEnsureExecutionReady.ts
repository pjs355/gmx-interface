import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";

import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { PrivateApiError } from "@/services/privateApi/errors";
import type { PrivateApiClient } from "@/services/privateApi";
import type {
	PolymarketAccountResponse,
	PolymarketAccountState,
} from "@/types/trading";

/**
 * Mirrors the 404 → `_clientPolymarketAccountNotFound` translation in
 * `usePolymarketBuilder`. Used as the queryFn for `qc.fetchQuery` here so the
 * cache shape stays identical regardless of which observer populated it.
 */
async function fetchPolymarketAccountForCache(
	apiClient: PrivateApiClient
): Promise<PolymarketAccountResponse> {
	try {
		return await apiClient.getPolymarketAccount();
	} catch (e) {
		if (e instanceof PrivateApiError && e.status === 404) {
			return { _clientPolymarketAccountNotFound: true };
		}
		throw e;
	}
}
import { usePolymarketRelay } from "./usePolymarketRelay";
import { usePolymarketEoaWalletClient } from "./usePolymarketEoaWalletClient";
import {
	deployPolymarketDepositWalletIfNeeded,
	executePolymarketApprovalBatch,
} from "./safeActions";
import { checkPolymarketApprovals } from "./approvalTxs";

/**
 * `deploying-safe` is preserved verbatim because the rest of the activation UI
 * keys off this string. Behaviorally it now deploys the **deposit wallet**
 * (ERC-1967 proxy) — see `deployPolymarketDepositWalletIfNeeded`.
 */
export type PolymarketEnsureExecutionSetupPhase =
	| "idle"
	| "checking"
	| "deploying-safe"
	| "approving"
	| "verifying"
	| "ready"
	| "error";

export type PolymarketEnsureExecutionReadyState = {
	/** True while the hook is running setup (or waiting on backoff). */
	setupInProgress: boolean;
	/** True once the account has reached `executionReady` for this session. */
	ready: boolean;
	phase: PolymarketEnsureExecutionSetupPhase;
	error: string | null;
};

/** Retry schedule for a single user; resets once setup succeeds. */
const FAILURE_BACKOFF_MS = [3_000, 10_000, 30_000, 60_000];

/**
 * All activation logs use a single tag so users can filter them in devtools
 * (`[PolymarketActivation]`). Without this, a silent failure during eager
 * setup is invisible — the only symptom is `canExecute: false` on the SOR
 * response, which looks identical to "user never logged in".
 *
 * Normal-path traces use `console.info`, gated by `VITE_DEBUG_TRADING=true`
 * (`isTradingDebugLoggingEnabled`). Production also strips `console.info` via
 * `suppressConsole`.
 */
const LOG_TAG = "[PolymarketActivation]";
function logInfo(event: string, extra?: Record<string, unknown>): void {
	if (!isTradingDebugLoggingEnabled()) return;
	if (extra) console.info(LOG_TAG, event, extra);
	else console.info(LOG_TAG, event);
}
function logWarn(event: string, extra?: Record<string, unknown>): void {
	if (extra) console.warn(LOG_TAG, event, extra);
	else console.warn(LOG_TAG, event);
}
function logError(event: string, extra?: Record<string, unknown>): void {
	if (extra) console.error(LOG_TAG, event, extra);
	else console.error(LOG_TAG, event);
}

type BuilderReadiness = {
	executionReady?: boolean;
	safeDeployed?: boolean;
	apiCredsReady?: boolean;
	approvalsReady?: boolean;
	safeDerived?: boolean;
};

/**
 * Automates Polymarket builder activation so the SOR always includes
 * Polymarket in All Markets plans.
 *
 * Flow when `enabled` + Privy EOA is hydrated:
 *  1. GET /polymarket/account; fast-path if `builderReadiness.executionReady`.
 *  2. Deploy the deterministic **deposit wallet** (ERC-1967 proxy from the
 *     deposit wallet factory) via the Polymarket relayer
 *     (`relay.deployDepositWallet()`, gasless — one EOA signature).
 *  3. Check on-chain allowances; if any are missing, run the batched pUSD +
 *     ERC-1155 `setApprovalForAll` calls via
 *     `relay.executeDepositWalletBatch(...)` (gasless — one EOA batch
 *     signature scoped to a 10-minute deadline).
 *  4. POST `/polymarket/account/verify-on-chain` — the server re-reads
 *     deposit wallet deployment + allowances and flips `tradingEnabled: true`
 *     atomically (see `register-polymarket.ts` and `trading-enabled-gate.ts`).
 *  5. Invalidate the `polymarketAccount` and `accountOverview` queries so
 *     the next SOR quote sees `canExecute: true`.
 *
 * L2 CLOB credentials are intentionally **not** derived or persisted here.
 * They are derived client-side on demand in `usePolymarketClobTradingSession`
 * (session-scoped, cached in `sessionStorage`) because order signing happens
 * entirely in the browser. Doing it there avoids making silent activation
 * depend on `POLYMARKET_L2_CREDS_ENCRYPTION_KEY` being configured.
 *
 * Failures back off exponentially per EOA so transient errors (relayer 429,
 * RPC hiccup) don't tight-loop.
 */
export function usePolymarketEnsureExecutionReady(args: {
	enabled: boolean;
}): PolymarketEnsureExecutionReadyState {
	const { enabled } = args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const profileQuery = useCurrentProfile({
		enabled: enabled && authenticated,
	});
	const profileId = profileQuery.data?._id;
	const relay = usePolymarketRelay();
	const eoa = usePolymarketEoaWalletClient();

	const [phase, setPhase] = useState<PolymarketEnsureExecutionSetupPhase>(
		"idle"
	);
	const [error, setError] = useState<string | null>(null);

	// Latest values held via refs so `runSetup`'s identity is driven solely by
	// `runKey`; avoids tearing when Privy re-renders mid-flight.
	const apiRef = useRef(api);
	apiRef.current = api;
	const relayRef = useRef(relay);
	relayRef.current = relay;
	const eoaRef = useRef(eoa);
	eoaRef.current = eoa;
	const profileIdRef = useRef<string | undefined>(profileId);
	profileIdRef.current = profileId;

	const inFlightRef = useRef(false);
	const completedKeyRef = useRef<string | null>(null);
	const failuresByKeyRef = useRef<
		Map<string, { attempts: number; nextAllowedAt: number }>
	>(new Map());
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);

	/** Unique per EOA so a user switching wallets triggers a fresh run. */
	const runKey = useMemo(() => {
		if (!eoa.address) return null;
		return `polymarket:${eoa.address.toLowerCase()}`;
	}, [eoa.address]);

	const runSetup = useCallback(async () => {
		if (!runKey || inFlightRef.current) return;
		inFlightRef.current = true;
		if (mountedRef.current) setError(null);
		const startedAt = Date.now();
		logInfo("runSetup:start", { runKey });

		try {
			const apiClient = apiRef.current;
			const currentEoa = eoaRef.current;
			const currentRelay = relayRef.current;
			const currentProfileId = profileIdRef.current;

			const eoaAddress = currentEoa.address;
			if (!eoaAddress || !currentEoa.eip1193Provider) {
				throw new Error("Polymarket EOA not hydrated");
			}

			if (mountedRef.current) setPhase("checking");
			logInfo("phase:checking", { eoa: eoaAddress });
			// Read through the canonical TanStack cache so the result is shared
			// with `usePolymarketBuilder` / `AccountDataContext` instead of
			// firing a duplicate `GET /polymarket/account` per setup attempt.
			const account: PolymarketAccountResponse = await qc.fetchQuery({
				queryKey: tradingQueryKeys.polymarketAccount,
				queryFn: () => fetchPolymarketAccountForCache(apiClient),
			});
			if (account._clientPolymarketAccountNotFound) {
				// 404 means the backend has no Polymarket row for this user and
				// no sync route was hit — cannot silently bootstrap, stay idle.
				throw new Error("Polymarket account not available on server");
			}
			const readiness = (account.builderReadiness ?? {}) as BuilderReadiness;
			const state: PolymarketAccountState = account.polymarketAccount ?? {};
			logInfo("account:fetched", {
				safeDeployed: readiness.safeDeployed,
				approvalsReady: readiness.approvalsReady,
				apiCredsReady: readiness.apiCredsReady,
				executionReady: readiness.executionReady,
				tradingEnabled: state.tradingEnabled,
				hasApiCredentials: state.hasApiCredentials,
				apiCredentialsValid: state.apiCredentialsValid,
				hasL2CredsEncrypted: !!state.l2ApiCredsEncrypted,
				safeWalletAddress: state.safeWalletAddress,
			});

			if (readiness.executionReady === true) {
				completedKeyRef.current = runKey;
				failuresByKeyRef.current.delete(runKey);
				if (mountedRef.current) setPhase("ready");
				logInfo("ready:fastPath", {
					elapsedMs: Date.now() - startedAt,
				});
				return;
			}

			// `safeWalletAddress` is the historical field name; for the
			// deposit-wallet flow it stores the deposit wallet address.
			const storedSafe =
				typeof state.safeWalletAddress === "string"
					? state.safeWalletAddress.trim()
					: "";

			// The deposit wallet address is fully deterministic from the EOA +
			// the relayer's factory/implementation config — derive it from the
			// SDK as the source of truth. This is the single fix for the class
			// of bugs where a legacy account still has the old Safe address
			// stored in `safeWalletAddress`: deploys would succeed for the
			// real deposit wallet but `executeDepositWalletBatch` would 400
			// because the relayer's wallet registry has no record of the old
			// Safe at this address.
			const client = await currentRelay.getRelayClient();
			if (!client) throw new Error("Polymarket relay client unavailable");
			const safe = await client.deriveDepositWalletAddress();
			if (storedSafe && storedSafe.toLowerCase() !== safe.toLowerCase()) {
				logWarn("depositWallet:storedAddressMismatch", {
					storedSafe,
					derivedSafe: safe,
				});
			}

			// Phase 2: deploy the deposit wallet if needed.
			if (readiness.safeDeployed !== true) {
				if (mountedRef.current) setPhase("deploying-safe");
				logInfo("phase:deploying-safe", { safe });
				const deployed = await deployPolymarketDepositWalletIfNeeded(
					client,
					eoaAddress,
				);
				logInfo("depositWallet:deployResult", {
					safe,
					deployedThisCall: deployed,
				});
			} else {
				logInfo("phase:depositWalletAlreadyDeployed", { safe });
			}

			// Phase 3: approvals. Re-check on-chain even when server says
			// approved — the user may have revoked from a different app.
			//
			// `collateral` covers the two pre-set wrap/unwrap allowances
			// (USDC.e -> Onramp, pUSD -> Offramp) so wrap/unwrap relay
			// batches can ship as a single call instead of `[approve, wrap]`.
			// Visible in this log so it's easy to confirm in devtools that
			// onboarding submitted (and verify-on-chain saw) all 9 approvals.
			const approvalStatus = await checkPolymarketApprovals(safe);
			logInfo("approvals:check", {
				safe,
				usdc: approvalStatus.usdc,
				erc1155: approvalStatus.erc1155,
				collateral: approvalStatus.collateral,
				all: approvalStatus.allApproved,
			});
			if (!approvalStatus.allApproved) {
				if (mountedRef.current) setPhase("approving");
				logInfo("phase:approving", { safe });
				await executePolymarketApprovalBatch(client, safe);
				const postBatchStatus = await checkPolymarketApprovals(safe);
				logInfo("approvals:batchSubmitted", {
					safe,
					usdc: postBatchStatus.usdc,
					erc1155: postBatchStatus.erc1155,
					collateral: postBatchStatus.collateral,
					all: postBatchStatus.allApproved,
				});
			}

			// Phase 4: verify-on-chain. Server re-reads deposit wallet
			// deployment + allowances and flips `tradingEnabled: true`
			// atomically (see register-polymarket.ts and
			// trading-enabled-gate.ts). L2 creds are intentionally out of
			// this path — see the module doc-block.
			if (mountedRef.current) setPhase("verifying");
			logInfo("phase:verifying");
			const verifyRes = await apiClient.postPolymarketVerifyOnChain({});
			logInfo("verify:result", { res: verifyRes });

			// Phase 5: invalidate consumers so SOR eligibility refreshes.
			await qc.invalidateQueries({
				queryKey: tradingQueryKeys.polymarketAccount,
			});
			if (currentProfileId) {
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(currentProfileId),
				});
			}

			completedKeyRef.current = runKey;
			failuresByKeyRef.current.delete(runKey);
			if (mountedRef.current) setPhase("ready");
			logInfo("ready:activated", {
				elapsedMs: Date.now() - startedAt,
			});
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			const stack = e instanceof Error ? e.stack : undefined;
			const prev = failuresByKeyRef.current.get(runKey) ?? {
				attempts: 0,
				nextAllowedAt: 0,
			};
			const attempts = prev.attempts + 1;
			const backoff =
				FAILURE_BACKOFF_MS[
					Math.min(attempts - 1, FAILURE_BACKOFF_MS.length - 1)
				];
			failuresByKeyRef.current.set(runKey, {
				attempts,
				nextAllowedAt: Date.now() + backoff,
			});
			if (mountedRef.current) {
				setError(msg);
				setPhase("error");
			}
			logError("runSetup:failed", {
				message: msg,
				attempts,
				retryInMs: backoff,
				stack,
			});
			// Best-effort: record `lastError` on the server for ops visibility.
			try {
				await apiRef.current.postPolymarketSync({
					lastError: msg.slice(0, 500),
				});
			} catch {
				/* ignore secondary sync failures */
			}
		} finally {
			inFlightRef.current = false;
		}
	}, [qc, runKey]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!enabled || !authenticated) {
			setPhase("idle");
			return;
		}
		if (!eoa.ready || !eoa.address || !eoa.eip1193Provider) {
			// Useful when a user reports "nothing happens" — tells us the
			// hook is mounted but an upstream Privy gate hasn't fulfilled.
			logInfo("gate:waitingForEoa", {
				ready: eoa.ready,
				hasAddress: !!eoa.address,
				hasEip1193: !!eoa.eip1193Provider,
			});
			return;
		}
		if (!runKey) return;
		if (completedKeyRef.current === runKey) return;
		if (inFlightRef.current) return;

		const failState = failuresByKeyRef.current.get(runKey);
		const now = Date.now();
		if (failState && now < failState.nextAllowedAt) {
			if (retryTimerRef.current) return;
			const delay = failState.nextAllowedAt - now;
			logWarn("gate:backoffScheduled", {
				attempts: failState.attempts,
				delayMs: delay,
			});
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				if (
					!inFlightRef.current &&
					completedKeyRef.current !== runKey &&
					mountedRef.current
				) {
					void runSetup();
				}
			}, delay);
			return;
		}

		void runSetup();
	}, [
		enabled,
		authenticated,
		eoa.ready,
		eoa.address,
		eoa.eip1193Provider,
		runKey,
		runSetup,
	]);

	const ready = phase === "ready";
	const failState = runKey ? failuresByKeyRef.current.get(runKey) : undefined;
	const exhausted =
		!!failState && failState.attempts >= FAILURE_BACKOFF_MS.length;
	const setupInProgress =
		enabled && authenticated && !ready && !(phase === "error" && exhausted);

	return { setupInProgress, ready, phase, error };
}
