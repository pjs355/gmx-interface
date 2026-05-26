import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePolymarketEoaWalletClient } from "../wallet/usePolymarketEoaWalletClient";
import { useSignerContext } from "context/SignerContext";
import { usePolymarketEnsureExecutionReady } from "./usePolymarketEnsureExecutionReady";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[PolymarketActivation]";

/**
 * Mounts {@link usePolymarketEnsureExecutionReady} for every authenticated
 * session and fires it during a browser idle window, so by the time the user
 * opens a trade box the SOR's `routingEligibility.polymarket.canExecute` is
 * already `true`.
 *
 * Activation chain: **Predict -> Limitless -> Polymarket**. The visible
 * Polymarket activator runs **last** so that the slow steps of the
 * Polymarket flow (deposit-wallet deploy + relayer registry catch-up)
 * have already been completed in the background by
 * `PolymarketDepositDeployBackgroundActivation`, which fires at boot.
 * By the time this activator mounts the ensure hook, the deploy phase
 * is a no-op (`isDepositWalletDeployed` returns true) and
 * `executeDepositWalletBatch` lands on its first try without the
 * "wallet not registered" 400 + retry storm.
 *
 * Renders nothing; all effects live inside the activation hook.
 *
 * We wait for:
 *  - Privy to report `authenticated: true`
 *  - The Privy embedded EOA wallet client to be hydrated (signer + provider)
 *  - `SignerContext` to settle so downstream queries resolve profileId
 *  - Limitless ready (so we don't compete with Predict + Limitless for
 *    the shared per-wallet Privy bucket)
 *
 * Only then do we flip `enabled: true`, which lets the activation hook take
 * over its own state machine and backoff logic.
 */
export function PolymarketBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const eoa = usePolymarketEoaWalletClient();
	const signerCtx = useSignerContext();
	const setupActivation = useSetupActivationOptional();

	// Gate the visible Polymarket activation on Limitless completing.
	// The deposit-wallet deploy itself is already pre-warmed at boot by
	// `PolymarketDepositDeployBackgroundActivation` running in parallel
	// with Predict, so by the time Limitless reports ready the deploy
	// phase here is effectively a no-op and `executeDepositWalletBatch`
	// can submit its first batch without the relayer-registry retry
	// storm. See the file header for the full rationale.
	const limitlessReady = setupActivation?.venues.limitless.ready ?? false;

	const prerequisitesReady =
		privyReady &&
		authenticated &&
		eoa.ready &&
		!!eoa.address &&
		!!eoa.eip1193Provider &&
		signerCtx.ready &&
		limitlessReady;

	// Surface every gate flip so users can tell whether the mounted component
	// is actually arming the hook. This was invisible before, so a stuck
	// prereq (e.g. missing embedded EOA) looked identical to a code bug.
	const lastPrereqSnapshotRef = useRef<string>("");
	useEffect(() => {
		const snapshot = JSON.stringify({
			privyReady,
			authenticated,
			eoaReady: eoa.ready,
			hasEoaAddress: !!eoa.address,
			hasEip1193: !!eoa.eip1193Provider,
			signerReady: signerCtx.ready,
			limitlessReady,
		});
		if (snapshot === lastPrereqSnapshotRef.current) return;
		lastPrereqSnapshotRef.current = snapshot;
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG_TAG, "bg:prereqChange", {
				prerequisitesReady,
				...JSON.parse(snapshot),
			});
		}
	}, [
		privyReady,
		authenticated,
		eoa.ready,
		eoa.address,
		eoa.eip1193Provider,
		signerCtx.ready,
		limitlessReady,
		prerequisitesReady,
	]);

	// No idle gate. The activation hook owns its own gating + backoff
	// logic, and the visible activator already waits on `limitlessReady`
	// upstream — there's no reason to layer an additional 250ms +
	// requestIdleCallback delay on top of that. Fire as soon as
	// prereqs are satisfied.
	const activation = usePolymarketEnsureExecutionReady({
		enabled: prerequisitesReady,
	});

	const reportVenueSnapshot = setupActivation?.reportVenueSnapshot;
	useEffect(() => {
		if (!reportVenueSnapshot) return;
		reportVenueSnapshot("polymarket", {
			setupInProgress: activation.setupInProgress,
			ready: activation.ready,
		});
	}, [reportVenueSnapshot, activation.setupInProgress, activation.ready]);

	return null;
}
