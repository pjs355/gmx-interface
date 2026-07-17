import { useCallback, useRef } from "react";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { useFundingLifiExecution } from "@/features/trading/lifi/useFundingLifiExecution";
import { executeLifiSteps } from "@/features/trading/lifi/executeLifiSteps";
import { pollLifiUntilTerminal } from "@/features/trading/lifi/pollLifiStatus";
import { pickLifiSourceTxHashForStatus } from "@/features/trading/lifi/pickLifiSourceTxHashForStatus";
import { readBaseScwUsdcBalanceRaw } from "@/features/trading/sor/prefund/fundingStableBalances";
import {
	buildPolygonSafeUsdceWrapTransactions,
	readPolymarketSafeUsdceBalanceWei,
} from "@/features/trading/venues/polymarket/trade/polygonCollateralWrap";
import { executePolygonRelayAndWait } from "@/features/trading/venues/polymarket/session/safeActions";

const BASE_LIFI = 8453;
const POLYGON_LIFI = 137;
const SOLANA_LIFI = 1151111081099710;

/** Don't bother bridging dust — LI.FI rejects tiny amounts and it isn't worth the fee. */
const MIN_SWEEP_USD = 1;

export type SweepResult = { swept: boolean; amountUsd?: number };

/**
 * The single supported funding rail for the copy-only app: sweep any **native
 * USDC sitting on the user's Base smart wallet** into their **Polymarket wallet
 * as pUSD**, so the pool is funded and ready before they ever hit "copy trade".
 *
 * Base USDC → LI.FI (Base→Polygon) → USDC.e delivered to the Polymarket Safe →
 * wrap USDC.e → pUSD via the Polymarket relay. One corridor, sponsored EVM (no
 * Solana), signed by the user's own Privy wallet — no session signer required.
 * Reuses the exact bridge (`executeLifiSteps`) and wrap
 * (`buildPolygonSafeUsdceWrapTransactions` + `executePolygonRelayAndWait`) the
 * trade flow already uses. Idempotent-ish via an in-flight guard; a no-op when
 * there's nothing on Base.
 */
export function useSweepBaseToPolymarket() {
	const venueAddressChainMap = useVenueAddressChainMap();
	const api = usePrivateApiClient();
	const { getSignerForChain, buildExecuteLifiStepsOptions, polymarketRelay } =
		useFundingLifiExecution();
	const inFlight = useRef(false);

	return useCallback(async (): Promise<SweepResult> => {
		if (inFlight.current) return { swept: false };
		const baseScw = venueAddressChainMap?.levelup.walletAddress?.trim();
		const polymarketSafe = venueAddressChainMap?.polymarket.walletAddress?.trim();
		if (!baseScw || !polymarketSafe) return { swept: false };

		// Only sweep when there's meaningful native USDC on Base to move.
		const baseWei = await readBaseScwUsdcBalanceRaw(baseScw);
		const baseUsd = Number(baseWei) / 1e6;
		if (!Number.isFinite(baseUsd) || baseUsd < MIN_SWEEP_USD) return { swept: false };

		inFlight.current = true;
		try {
			// 1. Bridge Base USDC → Polygon USDC.e, delivered to the Polymarket Safe.
			const quote = await api.postFundingLifiQuote({
				fromChain: BASE_LIFI,
				toChain: POLYGON_LIFI,
				amountHuman: baseUsd.toFixed(6),
				fromAddress: baseScw,
				toAddress: polymarketSafe,
				slippage: 0.005,
			});
			if (!quote?.steps?.length) {
				throw new Error("No Base→Polygon route available right now.");
			}

			// Bridge legs are all on Base (the source), so no Polygon relay is needed
			// here. The Polymarket deposit wallet is already deployed and the
			// USDC.e→Onramp allowance already set by `PolymarketBackgroundActivation`
			// (runs every authenticated session) — so the wrap below just needs the
			// relay client, not a redundant deploy/approve.
			const { txHashes } = await executeLifiSteps(
				quote.steps,
				getSignerForChain,
				buildExecuteLifiStepsOptions(quote, { routeIncludesSolana: false }),
			);

			const srcTx = pickLifiSourceTxHashForStatus({
				txHashes,
				fromChainLifi: BASE_LIFI,
				solanaLifiChainId: SOLANA_LIFI,
			});
			if (srcTx) {
				const statusTool =
					typeof quote.statusBridge === "string" && quote.statusBridge.trim()
						? quote.statusBridge.trim()
						: undefined;
				await pollLifiUntilTerminal(
					() =>
						api.getFundingLifiStatus({
							txHash: srcTx,
							fromChain: BASE_LIFI,
							toChain: POLYGON_LIFI,
							...(statusTool != null ? { tool: statusTool } : {}),
						}),
					{ intervalMs: 15_000, maxAttempts: 40 },
				);
			}

			// 2. Wrap the delivered USDC.e → pUSD in the Polymarket Safe (gasless relay).
			const usdceWei = await readPolymarketSafeUsdceBalanceWei(polymarketSafe);
			if (usdceWei > 0n) {
				const relayClient = await polymarketRelay.getRelayClient();
				if (relayClient) {
					const txs = buildPolygonSafeUsdceWrapTransactions({
						safeAddress: polymarketSafe,
						wrapAmountWei: usdceWei,
					});
					await executePolygonRelayAndWait(
						relayClient,
						txs,
						polymarketSafe,
						"Wrap USDC.e to pUSD (copy funding)",
					);
				}
			}

			return { swept: true, amountUsd: baseUsd };
		} finally {
			inFlight.current = false;
		}
	}, [
		venueAddressChainMap,
		api,
		getSignerForChain,
		buildExecuteLifiStepsOptions,
		polymarketRelay,
	]);
}
