import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import { useSignerContext } from "context/SignerContext";
import { useLimitlessEnsureExecutionReady } from "./useLimitlessEnsureExecutionReady";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[LimitlessActivation]";

/**
 * Global background activator for Limitless, mirroring
 * `PolymarketBackgroundActivation` and `PredictBackgroundActivation`.
 *
 * Activation chain: **Predict -> Limitless -> Polymarket**.
 *
 * Limitless sits in the middle. Its `ensure-account` call is pure
 * server work — zero Privy RPC from the client — so running it after
 * Predict's BSC signing burst gives the Privy embedded-wallet rate
 * bucket (shared across all chains, not per-chain) a productive
 * recovery window before Polymarket's visible activation fires its
 * approval-batch signature. Meanwhile,
 * `PolymarketDepositDeployBackgroundActivation` has been pre-warming
 * the Polymarket deposit-wallet deploy + relayer registry in parallel
 * with Predict, so the visible Polymarket activator that gates on
 * `limitlessReady` skips its slow "deploying-safe" phase entirely.
 *
 * Behavior:
 *  - Waits for Privy + signer context + Predict ready.
 *  - Mounts `useLimitlessEnsureExecutionReady` immediately on those
 *    prereqs (no `requestIdleCallback` deferral), which fires the
 *    idempotent `POST /api/limitless/ensure-account` and invalidates
 *    `accountOverview` so the SOR sees `limitless.canExecute: true`.
 *  - Reports its `setupInProgress` / `ready` to the shared
 *    `SetupActivationContext` so both the modal and the trade box can render
 *    coherent state without duplicate ensure calls, AND so the visible
 *    Polymarket activator knows when to start.
 */
export function LimitlessBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const signerCtx = useSignerContext();
	const setupActivation = useSetupActivationOptional();

	// Gate Limitless on Predict completing. Limitless does no Privy work
	// from the client, so it can start the moment Predict reports ready —
	// its server-side provisioning then naturally provides cooldown time
	// for the shared per-wallet Privy quota before the visible Polymarket
	// activator fires its `executeDepositWalletBatch` signature. See the
	// file header for the full rationale.
	const predictReady =
		setupActivation?.venues.predict.ready ?? false;

	const prerequisitesReady =
		privyReady && authenticated && signerCtx.ready && predictReady;

	// Surface the gate transition once so we can correlate slow first-run
	// `ensure-account` calls against when Limitless was actually unblocked.
	const gateLoggedRef = useRef(false);
	useEffect(() => {
		if (!prerequisitesReady) {
			gateLoggedRef.current = false;
			return;
		}
		if (gateLoggedRef.current) return;
		gateLoggedRef.current = true;
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG_TAG, "bg:gateOpened", {
				at: new Date().toISOString(),
				predictReady,
			});
		}
	}, [prerequisitesReady, predictReady]);

	const ensureState = useLimitlessEnsureExecutionReady({
		enabled: prerequisitesReady,
	});

	const reportVenueSnapshot = setupActivation?.reportVenueSnapshot;
	const lastSnapshotRef = useRef<string>("");
	useEffect(() => {
		if (!reportVenueSnapshot) return;
		const key = `${ensureState.setupInProgress ? 1 : 0}|${ensureState.ready ? 1 : 0}`;
		if (key === lastSnapshotRef.current) return;
		lastSnapshotRef.current = key;
		reportVenueSnapshot("limitless", {
			setupInProgress: ensureState.setupInProgress,
			ready: ensureState.ready,
		});
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG_TAG, "bg:snapshot", {
				at: new Date().toISOString(),
				setupInProgress: ensureState.setupInProgress,
				ready: ensureState.ready,
			});
		}
	}, [reportVenueSnapshot, ensureState.setupInProgress, ensureState.ready]);

	return null;
}
