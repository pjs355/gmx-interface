import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePolymarketEoaWalletClient } from "./usePolymarketEoaWalletClient";
import { useSignerContext } from "context/SignerContext";
import { usePolymarketEnsureExecutionReady } from "./usePolymarketEnsureExecutionReady";

const LOG_TAG = "[PolymarketActivation]";

type IdleWindow = Window & {
	requestIdleCallback?: (
		cb: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void,
		opts?: { timeout?: number }
	) => number;
	cancelIdleCallback?: (handle: number) => void;
};

/** How long to wait before we force the callback even if the browser is busy. */
const IDLE_TIMEOUT_MS = 5_000;
/**
 * A small wall-clock delay before even scheduling idle work — keeps the first
 * paint lean on slow devices. Activation takes ~20-30s total when a user is
 * bootstrapping fresh, so 250ms of upfront slack is immaterial but avoids
 * fighting initial auth + query fan-out.
 */
const START_DELAY_MS = 250;

/**
 * Mounts {@link usePolymarketEnsureExecutionReady} for every authenticated
 * session and fires it during a browser idle window, so by the time the user
 * opens a trade box the SOR's `routingEligibility.polymarket.canExecute` is
 * already `true`.
 *
 * Renders nothing; all effects live inside the activation hook.
 *
 * We wait for:
 *  - Privy to report `authenticated: true`
 *  - The Privy embedded EOA wallet client to be hydrated (signer + provider)
 *  - `SignerContext` to settle so downstream queries resolve profileId
 *
 * Only then do we flip `enabled: true`, which lets the activation hook take
 * over its own state machine and backoff logic.
 */
export function PolymarketBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const eoa = usePolymarketEoaWalletClient();
	const signerCtx = useSignerContext();

	const [idleReached, setIdleReached] = useState(false);

	const prerequisitesReady =
		privyReady &&
		authenticated &&
		eoa.ready &&
		!!eoa.address &&
		!!eoa.eip1193Provider &&
		signerCtx.ready;

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
		});
		if (snapshot === lastPrereqSnapshotRef.current) return;
		lastPrereqSnapshotRef.current = snapshot;
		console.info(LOG_TAG, "bg:prereqChange", {
			prerequisitesReady,
			...JSON.parse(snapshot),
		});
	}, [
		privyReady,
		authenticated,
		eoa.ready,
		eoa.address,
		eoa.eip1193Provider,
		signerCtx.ready,
		prerequisitesReady,
	]);

	useEffect(() => {
		if (!prerequisitesReady) {
			setIdleReached(false);
			return;
		}
		if (idleReached) return;

		const w = window as IdleWindow;
		let idleHandle: number | null = null;
		let startTimer: ReturnType<typeof setTimeout> | null = null;
		let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

		const fire = () => {
			console.info(LOG_TAG, "bg:idleFired");
			setIdleReached(true);
		};

		startTimer = setTimeout(() => {
			startTimer = null;
			if (typeof w.requestIdleCallback === "function") {
				idleHandle = w.requestIdleCallback(fire, {
					timeout: IDLE_TIMEOUT_MS,
				});
			} else {
				// Safari / older browsers: fall back to a macrotask.
				fallbackTimer = setTimeout(fire, 0);
			}
		}, START_DELAY_MS);

		return () => {
			if (startTimer) clearTimeout(startTimer);
			if (fallbackTimer) clearTimeout(fallbackTimer);
			if (
				idleHandle !== null &&
				typeof w.cancelIdleCallback === "function"
			) {
				w.cancelIdleCallback(idleHandle);
			}
		};
	}, [prerequisitesReady, idleReached]);

	usePolymarketEnsureExecutionReady({
		enabled: prerequisitesReady && idleReached,
	});

	return null;
}
