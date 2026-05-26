import { useCallback, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";

import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { findVenueSetup } from "@/features/trading/hooks/venueSetup";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { PrivateApiError } from "@/services/privateApi/errors";
import type { PrivateApiClient } from "@/services/privateApi";
import type { PolymarketAccountResponse, PolymarketAccountState } from "@/types/trading";
import type { VenueSetupSlice } from "@/types/trading/venueSetup";
import type { EnsureFailureState } from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	computeEnsureSetupInProgress,
	markEnsureSetupCompleted,
	recordEnsureSetupFailure,
} from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	isEnsureRunnerExhausted,
	useVenueEnsureExecutionRunner,
} from "@/features/trading/ensure-execution/useVenueEnsureExecutionRunner";

/**
 * Mirrors the 404 → `_clientPolymarketAccountNotFound` translation in
 * `usePolymarketBuilder`. Used as the queryFn for `qc.fetchQuery` here so the
 * cache shape stays identical regardless of which observer populated it.
 */
async function fetchPolymarketAccountForCache(
	apiClient: PrivateApiClient,
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
import { usePolymarketEoaWalletClient } from "../wallet/usePolymarketEoaWalletClient";
import {
	deployPolymarketDepositWalletIfNeeded,
	executePolymarketApprovalBatch,
} from "./safeActions";
import { checkPolymarketApprovals } from "../trade/approvalTxs";

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
	/** True once venue setup is complete for this session (`setup.sorCanInclude`). */
	ready: boolean;
	phase: PolymarketEnsureExecutionSetupPhase;
	error: string | null;
};

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

	const [phase, setPhase] = useState<PolymarketEnsureExecutionSetupPhase>("idle");
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
	const failuresByKeyRef = useRef<Map<string, EnsureFailureState>>(new Map());
	const mountedRef = useRef(true);

	/** Unique per EOA so a user switching wallets triggers a fresh run. */
	const runKey = useMemo(() => {
		if (!eoa.address) return null;
		return `polymarket:${eoa.address.toLowerCase()}`;
	}, [eoa.address]);

	const prerequisitesReady = eoa.ready && Boolean(eoa.address) && Boolean(eoa.eip1193Provider);

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

			let setupFromOverview: VenueSetupSlice | null = null;

			if (currentProfileId) {
				try {
					const overview = await qc.fetchQuery({
						queryKey: tradingQueryKeys.accountOverview(currentProfileId),
						queryFn: () => apiClient.getAccountOverview(currentProfileId),
					});
					setupFromOverview = findVenueSetup(overview, "polymarket");
					logInfo("overview:setup", {
						sorCanInclude: setupFromOverview?.sorCanInclude,
						tradingWalletDeployed: setupFromOverview?.tradingWalletDeployed,
						blocking: setupFromOverview?.blockingReasons,
					});
					if (setupFromOverview?.sorCanInclude === true) {
						markEnsureSetupCompleted(completedKeyRef, failuresByKeyRef.current, runKey);
						if (mountedRef.current) setPhase("ready");
						logInfo("ready:fastPath", {
							source: "accountOverview.setup",
							elapsedMs: Date.now() - startedAt,
						});
						return;
					}
				} catch (overviewErr: unknown) {
					const msg = overviewErr instanceof Error ? overviewErr.message : String(overviewErr);
					logWarn("overview:fetchFailed", { message: msg });
				}
			}

			// Polymarket account row — wallet address when overview says not ready.
			const account: PolymarketAccountResponse = await qc.fetchQuery({
				queryKey: tradingQueryKeys.polymarketAccount,
				queryFn: () => fetchPolymarketAccountForCache(apiClient),
			});
			if (account._clientPolymarketAccountNotFound) {
				throw new Error("Polymarket account not available on server");
			}
			const state: PolymarketAccountState = account.polymarketAccount ?? {};
			logInfo("account:fetched", {
				tradingWalletDeployed: setupFromOverview?.tradingWalletDeployed,
				safeWalletAddress: state.safeWalletAddress,
			});

			// `safeWalletAddress` is the historical field name; for the
			// deposit-wallet flow it stores the deposit wallet address.
			const storedSafe =
				typeof state.safeWalletAddress === "string" ? state.safeWalletAddress.trim() : "";

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
			if (setupFromOverview?.tradingWalletDeployed !== true) {
				if (mountedRef.current) setPhase("deploying-safe");
				logInfo("phase:deploying-safe", { safe });
				const deployed = await deployPolymarketDepositWalletIfNeeded(client, eoaAddress);
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
			const approvalStatus = await checkPolymarketApprovals(safe, apiClient);
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
				await executePolymarketApprovalBatch(client, safe, apiClient);
				const postBatchStatus = await checkPolymarketApprovals(safe, apiClient);
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

			markEnsureSetupCompleted(completedKeyRef, failuresByKeyRef.current, runKey);
			if (mountedRef.current) setPhase("ready");
			logInfo("ready:activated", {
				elapsedMs: Date.now() - startedAt,
			});
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			const stack = e instanceof Error ? e.stack : undefined;
			const { attempts, backoffMs } = recordEnsureSetupFailure(failuresByKeyRef.current, runKey);
			if (mountedRef.current) {
				setError(msg);
				setPhase("error");
			}
			logError("runSetup:failed", {
				message: msg,
				attempts,
				retryInMs: backoffMs,
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

	useVenueEnsureExecutionRunner({
		enabled,
		authenticated,
		runKey,
		prerequisitesReady,
		runSetup,
		refs: { inFlightRef, completedKeyRef, failuresByKeyRef },
		mountedRef,
		onDisabled: () => {
			setPhase("idle");
		},
		onPrerequisitesWaiting: () => {
			logInfo("gate:waitingForEoa", {
				ready: eoa.ready,
				hasAddress: !!eoa.address,
				hasEip1193: !!eoa.eip1193Provider,
			});
		},
		onRetryScheduled: ({ attempts, delayMs }) => {
			logWarn("gate:backoffScheduled", {
				attempts,
				delayMs,
			});
		},
	});

	const ready = phase === "ready";
	const exhausted = isEnsureRunnerExhausted(failuresByKeyRef, runKey);
	const setupInProgress = computeEnsureSetupInProgress({
		enabled,
		authenticated,
		ready,
		phase,
		exhausted,
	});

	return { setupInProgress, ready, phase, error };
}
