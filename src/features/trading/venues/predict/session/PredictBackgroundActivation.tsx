import { useEffect, useMemo, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { useSignerContext } from "context/SignerContext";
import { usePredictTradingSession } from "./usePredictTradingSession";
import { usePredictEnsureExecutionReady } from "./usePredictEnsureExecutionReady";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[PredictActivation]";

/**
 * Global background activator for Predict.fun.
 *
 * Activation order is now **Predict -> Limitless -> Polymarket**.
 * Predict runs first because:
 *
 *  - Its on-chain step is the cheapest (with the scoped 2-tx
 *    `setApprovals` it costs ~3 sponsored Privy sends instead of the
 *    SDK's full 10-tx cross-product, well inside Privy's per-wallet
 *    bucket).
 *  - Polymarket's slow path is the deposit-wallet deploy + relayer
 *    registry propagation, which is now fired in parallel by
 *    `PolymarketDepositDeployBackgroundActivation` at boot. That
 *    activator is silent and does NOT publish to
 *    `SetupActivationContext`; the user sees Predict + Limitless run
 *    while the Polymarket wallet quietly comes online.
 *  - By the time the visible Polymarket activator runs (gated on
 *    `limitlessReady`), the deposit wallet is deployed and the
 *    relayer registry has caught up, so the Polymarket row of the
 *    checklist no longer pays the ~12-15s deploy + "wallet not
 *    registered" retry tax.
 *
 * Activation steps (run silently; no UI prompts thanks to Privy
 * embedded-wallet auto-signing + TEE-sponsored gas):
 *  1. Resolve the embedded EOA via `useWallets`.
 *  2. Open a Predict trading session (`usePredictTradingSession`) — signs the
 *     auth message, exchanges it for a JWT, hydrates the order builder.
 *  3. Run `usePredictEnsureExecutionReady` for the **default** (non-negRisk,
 *     non-yieldBearing) market shape, which covers ~all common markets and
 *     flips `routingEligibility.predictFun.canExecute: true` on the SOR.
 *
 * Per-market activation for negRisk / yield-bearing markets still happens
 * inside the trade box (the same hook with a different `approvalSubject`
 * shape), but for those markets the ensure call fast-paths because JWT +
 * baseline approvals are already in place.
 *
 * The activator fires the moment its prereqs are satisfied — no
 * `requestIdleCallback` deferral, no wall-clock pad. Predict's ensure
 * hook owns its own gating + retry/backoff state machine, and the
 * scoped 2-tx approvals comfortably fit inside Privy's per-wallet
 * bucket on a fresh boot.
 */
export function PredictBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const { wallets } = useWallets();
	const signerCtx = useSignerContext();
	const setupActivation = useSetupActivationOptional();

	// Predict approvals + auth happen against the Privy embedded EOA on BSC,
	// matching the trade-box's existing `predictApprovalSubject` resolution.
	// `VITE_PREDICT_ACCOUNT_ADDRESS` is an existing dev override (already in
	// use elsewhere) — no new env var introduced.
	const approvalSubject = useMemo<string | null>(() => {
		const fromEnv = (import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS ?? "").toString().trim();
		if (fromEnv) return fromEnv;
		const embedded = (wallets ?? []).find(
			(w) =>
				(w as { walletClientType?: string }).walletClientType === "privy" ||
				(w as { connectorType?: string }).connectorType === "embedded",
		);
		return embedded?.address ?? null;
	}, [wallets]);

	// Predict has no upstream gate now — it kicks off the moment the
	// embedded EOA is hydrated. The chain is Predict -> Limitless ->
	// Polymarket, with Polymarket's slow deposit-wallet deploy
	// happening silently in parallel via
	// `PolymarketDepositDeployBackgroundActivation`.
	//
	// Privy bucket pressure: with the scoped Predict approvals (2 sends
	// per the `OrderBuilder.setApprovals` rewrite) plus a single
	// `signTypedData` for the parallel Polymarket deploy, the embedded
	// EOA's per-wallet bucket sees ~4 signing ops in the boot burst —
	// well below the threshold that previously triggered 429s when the
	// SDK was firing 10 cross-product approvals.
	const prerequisitesReady =
		privyReady && authenticated && signerCtx.ready && Boolean(approvalSubject);

	const sessionEnabled = prerequisitesReady;
	const predictSession = usePredictTradingSession(sessionEnabled);

	const ensureState = usePredictEnsureExecutionReady({
		enabled: sessionEnabled && predictSession.ready,
		predictSession,
		approvalSubject,
		isNegRisk: false,
		isYieldBearing: false,
	});

	const reportVenueSnapshot = setupActivation?.reportVenueSnapshot;
	const lastSnapshotRef = useRef<string>("");
	useEffect(() => {
		if (!reportVenueSnapshot) return;
		// Setup is "in progress" until the ensure hook reports ready. Predict
		// has two staged steps — opening the session, then running ensure — so
		// surface "in progress" while the session is still loading too.
		const inProgress =
			sessionEnabled &&
			(predictSession.loading || !predictSession.ready || ensureState.setupInProgress);
		const ready = ensureState.ready;
		const key = `${inProgress ? 1 : 0}|${ready ? 1 : 0}`;
		if (key === lastSnapshotRef.current) return;
		lastSnapshotRef.current = key;
		reportVenueSnapshot("predict", { setupInProgress: inProgress, ready });
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG_TAG, "bg:snapshot", {
				at: new Date().toISOString(),
				setupInProgress: inProgress,
				ready,
				phase: ensureState.phase,
			});
		}
	}, [
		reportVenueSnapshot,
		sessionEnabled,
		predictSession.loading,
		predictSession.ready,
		ensureState.setupInProgress,
		ensureState.ready,
		ensureState.phase,
	]);

	return null;
}
