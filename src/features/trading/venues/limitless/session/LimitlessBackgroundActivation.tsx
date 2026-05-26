import { useEffect, useRef, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { useSignerContext } from "context/SignerContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { buildLimitlessEoaEnsureBodyFromSigner } from "./limitlessEnsureEoaBody";
import { useLimitlessEnsureExecutionReady } from "./useLimitlessEnsureExecutionReady";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[LimitlessActivation]";

/**
 * Global background activator for Limitless, mirroring
 * `PolymarketBackgroundActivation` and `PredictBackgroundActivation`.
 *
 * Activation chain: **Predict -> Limitless -> Polymarket**.
 *
 * Limitless sits in the middle. Its `ensure-account` call chains server-side
 * provisioning; first-time partner create requires a short **personal_sign**
 * on the plain signing message (wired via `buildEnsureAccountBody`).
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
 *  - Gate Limitless on Predict completing (see below).
 *  - Mounts `useLimitlessEnsureExecutionReady` with EOA proof when the embedded
 *    signer is available so first-time `ownerId` provisioning succeeds.
 *  - Reports its `setupInProgress` / `ready` to the shared
 *    `SetupActivationContext` so both the modal and the trade box can render
 *    coherent state without duplicate ensure calls, AND so the visible
 *    Polymarket activator knows when to start.
 */
export function LimitlessBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const signerCtx = useSignerContext();
	const api = usePrivateApiClient();
	const setupActivation = useSetupActivationOptional();

	const buildEnsureAccountBody = useCallback(async () => {
		if (!signerCtx.signer) return undefined;
		return buildLimitlessEoaEnsureBodyFromSigner({
			getPlainSigningMessage: () => api.getLimitlessAuthSigningMessage(),
			signer: signerCtx.signer,
		});
	}, [api, signerCtx.signer]);

	// Gate Limitless on Predict completing. Running after Predict still gives the
	// shared Privy rate bucket a breather before Polymarket's visible activation.
	const predictReady = setupActivation?.venues.predict.ready ?? false;

	const prerequisitesReady = privyReady && authenticated && signerCtx.ready && predictReady;

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
		buildEnsureAccountBody,
		runSignupTimeBaseApprovals: true,
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
