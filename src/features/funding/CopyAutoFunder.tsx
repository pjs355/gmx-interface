import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccountCash, useAccountData } from "@/context/AccountDataContext";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { useSweepBaseToPolymarket } from "@/features/funding/useSweepBaseToPolymarket";

/** Below this we don't bother sweeping — LI.FI rejects dust and it isn't worth the fee. */
const MIN_BASE_USD = 1;

/** After any sweep attempt, wait this long before trying again (avoids hammering on a failing route). */
const ATTEMPT_COOLDOWN_MS = 60_000;

/**
 * Copy-only app: the single funding rail is Base → Polymarket. The moment native
 * USDC lands on the user's Base wallet (fiat onramp completes or a crypto deposit
 * arrives), silently sweep it into their Polymarket wallet as pUSD — so the pool
 * is already funded before they ever hit "copy trade".
 *
 * Renders nothing. Mounted once in the app shell. Signing is silent (the user's
 * embedded Privy TEE wallet, gasless), so there's no jarring prompt. The
 * on-chain balance read inside the sweep is the source of truth — a stale/high
 * context balance just triggers a no-op read, never a double-move.
 */
export function CopyAutoFunder() {
	const { authenticated } = usePrivy();
	const cash = useAccountCash();
	const { refresh } = useAccountData();
	const setupActivation = useSetupActivationOptional();
	const sweep = useSweepBaseToPolymarket();
	const runningRef = useRef(false);
	const lastAttemptRef = useRef(0);

	const baseUsd = cash?.base ?? 0;
	// Wait for the deposit wallet + USDC.e→Onramp allowance that
	// `PolymarketBackgroundActivation` sets up, so the wrap can't revert. `false`
	// = still setting up, hold. `undefined` = context not mounted, so we can't
	// tell — don't block (the backend wrap-recovery covers that rare case).
	const polymarketReady = setupActivation?.venues.polymarket.ready;

	useEffect(() => {
		if (!authenticated) return;
		if (polymarketReady === false) return;
		if (baseUsd < MIN_BASE_USD) return;
		if (runningRef.current) return;
		if (Date.now() - lastAttemptRef.current < ATTEMPT_COOLDOWN_MS) return;

		runningRef.current = true;
		lastAttemptRef.current = Date.now();
		void (async () => {
			try {
				const res = await sweep();
				// Refresh cash so `baseUsd` drops to ~0 and we don't re-trigger.
				if (res.swept) await refresh.cash();
			} catch {
				// Leave it for the next cooldown window; backend funding at copy
				// activation is the fallback if the sweep can't complete.
			} finally {
				runningRef.current = false;
			}
		})();
	}, [authenticated, polymarketReady, baseUsd, sweep, refresh]);

	return null;
}
