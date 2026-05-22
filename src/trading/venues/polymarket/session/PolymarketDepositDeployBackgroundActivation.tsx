import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { usePolymarketEoaWalletClient } from "../wallet/usePolymarketEoaWalletClient";
import { usePolymarketEnsureDepositWalletDeployed } from "./usePolymarketEnsureDepositWalletDeployed";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[PolymarketDepositDeployEarly]";

/**
 * Silent background activator that pre-warms the Polymarket deposit
 * wallet deployment **at boot**, in parallel with Predict's activation.
 *
 * The visible activation order is now Predict -> Limitless -> Polymarket.
 * The deposit-wallet deploy + relayer registry propagation is the
 * dominant cost (~12-15s of Polymarket's ~22s total) and runs entirely
 * in parallel with the user-visible Predict + Limitless steps, so by
 * the time the user reaches the Polymarket row of the checklist the
 * deploy is already on-chain and the relayer's registry index has
 * caught up. Net effect: the visible Polymarket activation skips its
 * "deploying-safe" phase and avoids the "wallet not registered" 400 +
 * retry storm in `executePolygonRelayAndWait`.
 *
 * This component renders nothing and never publishes to
 * `SetupActivationContext`. The user must not see "Polymarket setup"
 * UI for this step — `PolymarketBackgroundActivation` owns the visible
 * row, and it kicks in later (gated on `limitlessReady`).
 *
 * Prerequisites for firing the early deploy:
 *  - Privy auth resolved
 *  - Embedded EOA wallet client hydrated (so we can sign the relayer
 *    deploy message)
 *  - `SignerContext` ready (so downstream profile-id queries resolve)
 *
 * No idle gate — we want this as fast as the embedded wallet allows.
 */
export function PolymarketDepositDeployBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const eoa = usePolymarketEoaWalletClient();
	const signerCtx = useSignerContext();

	const prerequisitesReady =
		privyReady &&
		authenticated &&
		eoa.ready &&
		!!eoa.address &&
		!!eoa.eip1193Provider &&
		signerCtx.ready;

	const lastPrereqSnapshotRef = useRef<string>("");
	useEffect(() => {
		const snapshot = JSON.stringify({
			privyReady,
			authenticated,
			eoaReady: eoa.ready,
			hasEoaAddress: !!eoa.address,
			signerReady: signerCtx.ready,
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
		signerCtx.ready,
		prerequisitesReady,
	]);

	usePolymarketEnsureDepositWalletDeployed({
		enabled: prerequisitesReady,
	});

	return null;
}
