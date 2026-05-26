import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { deployPolymarketDepositWalletIfNeeded } from "./safeActions";
import { usePolymarketRelay } from "./usePolymarketRelay";

const LOG_TAG = "[PolymarketDepositDeployEarly]";

/**
 * Background-only hook that fires the Polymarket deposit-wallet deploy
 * **as early as possible** in the session — well before the visible
 * Polymarket activation runs.
 *
 * Why this exists: the deposit-wallet deploy has two slow steps that the
 * user can't shortcut:
 *
 *   1. The relayer's `deployDepositWallet` round-trip (mining wait, ~5s).
 *   2. `waitForDepositWalletRegistered` polling — the relayer's wallet
 *      registry index lags behind the on-chain deploy by another few
 *      seconds, and during that window the next `executeDepositWalletBatch`
 *      400s with "wallet registry validation failed". The retry loop in
 *      `executePolygonRelayAndWait` swallows it but burns 1500-3000ms per
 *      attempt.
 *
 * Together those two steps account for ~12-15s of the ~22s end-to-end
 * Polymarket activation. By kicking the deploy off at boot (in parallel
 * with Predict's activation, before Limitless and the visible Polymarket
 * approvals run), the registry has time to catch up while the user is
 * watching Predict + Limitless complete. By the time the visible
 * Polymarket activation reaches `executePolymarketApprovalBatch`, the
 * relayer registry already lists the wallet and the batch lands on the
 * first try.
 *
 * Safety properties:
 *  - Idempotent. `deployPolymarketDepositWalletIfNeeded` short-circuits
 *    on `isDepositWalletDeployed`, so calling it twice (once here, once
 *    indirectly through the visible activator if needed) is a no-op for
 *    already-deployed users.
 *  - Concurrent-safe. `deployPolymarketDepositWalletIfNeeded` already
 *    runs under `withPolygonRelayMutex` so the actual deploy submission
 *    can't double-fire.
 *  - Silent. This hook never reports to `SetupActivationContext`. The
 *    user sees no UI for the early deploy; only the visible Polymarket
 *    row shows progress, and by then the deploy is done.
 *  - Once per EOA. We track `completedKeyRef` so a single mount runs the
 *    deploy at most once, even if Privy re-emits `wallets` during the
 *    initial flurry of auth events.
 */
export function usePolymarketEnsureDepositWalletDeployed(args: { enabled: boolean }): {
	deployed: boolean;
} {
	const { enabled } = args;
	const { authenticated, ready: privyReady } = usePrivy();
	const relay = usePolymarketRelay();

	const [deployed, setDeployed] = useState(false);
	const inFlightRef = useRef(false);
	const completedKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled) return;
		if (!privyReady || !authenticated) return;
		if (!relay.eoaAddress || !relay.walletReady) return;

		const runKey = `polymarket-deploy:${relay.eoaAddress.toLowerCase()}`;
		if (completedKeyRef.current === runKey) return;
		if (inFlightRef.current) return;

		let cancelled = false;
		inFlightRef.current = true;

		(async () => {
			const startedAt = performance.now();
			try {
				const client = await relay.getRelayClient();
				if (!client) {
					if (isTradingDebugLoggingEnabled()) {
						console.info(LOG_TAG, "skip:noRelayClient");
					}
					return;
				}
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "deploy:start", {
						eoa: relay.eoaAddress,
					});
				}
				const deployedThisCall = await deployPolymarketDepositWalletIfNeeded(
					client,
					relay.eoaAddress as `0x${string}`,
				);
				if (cancelled) return;
				completedKeyRef.current = runKey;
				setDeployed(true);
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "deploy:done", {
						deployedThisCall,
						elapsedMs: Math.round(performance.now() - startedAt),
					});
				}
			} catch (e) {
				// Best-effort. The visible Polymarket activator runs the same
				// deploy step inside its own retry/backoff schedule, so a
				// failure here is fully recoverable downstream — we just lose
				// the parallelism gain for this session.
				console.warn(LOG_TAG, "deploy:failed", {
					error: e instanceof Error ? e.message : String(e),
					elapsedMs: Math.round(performance.now() - startedAt),
				});
			} finally {
				inFlightRef.current = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		enabled,
		privyReady,
		authenticated,
		relay.eoaAddress,
		relay.walletReady,
		relay.getRelayClient,
		relay,
	]);

	return { deployed };
}
