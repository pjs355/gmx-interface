import {
	formatErrorForUser,
	userMessage,
	LIFI_BRIDGE_FAILED,
	LIFI_NO_BRIDGE_DATA,
} from "@/errors";
import type { SorBridgeResult } from "@/trading/sor/execute/types";
import type { SorBridgeExecuteInput } from "@/trading/sor/execute/venueLegContext";
import {
	isLimitlessSweepInsufficientBalanceError,
	recappedSweepForSend,
} from "@/trading/sor/prefund/limitlessPrefundSweep";
import { buildPrefundSteps } from "@/trading/sor/prefund/prefundPlan";
import { readBaseScwUsdcBalanceRaw } from "@/trading/sor/prefund/fundingStableBalances";
import {
	MIN_PREFUND_CHUNK_USD,
	PREFUND_SHORTFALL_COVERED_EPS_USD,
	resolveBridgePrefundContext,
} from "@/trading/sor/prefund/resolveBridgePrefundContext";
import { runLimitlessScwToMakerSweep } from "@/trading/sor/prefund/runLimitlessScwToMakerSweep";
import { runPrefundLifiSteps } from "@/trading/sor/prefund/runPrefundLifiSteps";

const LIMITLESS_SWEEP_INSUFFICIENT_MSG =
	"Your Base smart wallet does not have enough native USDC to move to your Limitless trading wallet. Refresh the quote and try again, or add USDC to your Base smart wallet before trading.";

const LIMITLESS_SWEEP_INSUFFICIENT_PARALLEL_MSG =
	"Your Base smart wallet does not have enough native USDC to move to your Limitless trading wallet while the cross-chain prefund ran. Refresh the quote and try again, or add USDC to your Base smart wallet before trading.";

/** Li.FI bridge prefund for a SOR leg — moves stablecoin onto the venue wallet before order placement. */
export async function runBridgePrefund(
	input: SorBridgeExecuteInput,
): Promise<SorBridgeResult> {
	const {
		leg,
		fundingAddresses,
		opts,
		deps,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
		getSignerForChain,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
	} = input;
	const { privateApi, solanaSigner, getClientForChain } = deps;

	const bridge = leg.bridge;
	if (!bridge) {
		return { success: false, error: userMessage(LIFI_NO_BRIDGE_DATA) };
	}

	try {
		const ctx = await resolveBridgePrefundContext({
			leg,
			bridge,
			fundingAddresses,
			opts,
			privateApi,
		});

		let scwToMakerSweepTxHash: string | undefined;
		let { plannedSweepMicros, sweepAmountHuman, lifiNeedUsd } = ctx;

		if (ctx.bridgeShortfallUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD) {
			console.debug("[SOR][prefund] no LI.FI pull — venue balance covers prefund target", {
				...ctx.prefundLogBase,
				scwToMakerSweepTxHash: scwToMakerSweepTxHash ?? null,
			});
			return { success: true, bridgeTxHash: scwToMakerSweepTxHash };
		}

		if (plannedSweepMicros > 0n && lifiNeedUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD) {
			const b3 = await readBaseScwUsdcBalanceRaw(ctx.baseSwTrim);
			const fin3 = recappedSweepForSend(
				plannedSweepMicros,
				b3,
				ctx.bridgeShortfallUsd,
				MIN_PREFUND_CHUNK_USD,
			);
			plannedSweepMicros = fin3.plannedSweepMicros;
			sweepAmountHuman = fin3.sweepAmountHuman;
			lifiNeedUsd = fin3.lifiNeedUsd;
			if (
				plannedSweepMicros > 0n &&
				lifiNeedUsd <= PREFUND_SHORTFALL_COVERED_EPS_USD
			) {
				try {
					scwToMakerSweepTxHash = await runLimitlessScwToMakerSweep({
						fundingAddresses,
						plannedSweepMicros,
						getClientForChain,
						venue: leg.venue,
					});
				} catch (sweepErr: unknown) {
					if (isLimitlessSweepInsufficientBalanceError(sweepErr)) {
						return { success: false, error: LIMITLESS_SWEEP_INSUFFICIENT_MSG };
					}
					throw sweepErr;
				}
				console.debug(
					"[SOR][prefund] no LI.FI pull after deterministic SCW sweep — prefund target covered",
					{
						...ctx.prefundLogBase,
						scwToMakerSweepTxHash,
					},
				);
				return { success: true, bridgeTxHash: scwToMakerSweepTxHash };
			}
		}

		if (
			ctx.limitlessBaseDest &&
			ctx.bridgeShortfallUsd > PREFUND_SHORTFALL_COVERED_EPS_USD &&
			ctx.baseSwTrim &&
			ctx.makerSwTrim
		) {
			const bPre = await readBaseScwUsdcBalanceRaw(ctx.baseSwTrim);
			const finPre = recappedSweepForSend(
				plannedSweepMicros,
				bPre,
				ctx.bridgeShortfallUsd,
				MIN_PREFUND_CHUNK_USD,
			);
			plannedSweepMicros = finPre.plannedSweepMicros;
			sweepAmountHuman = finPre.sweepAmountHuman;
			lifiNeedUsd = finPre.lifiNeedUsd;
		}

		let steps;
		try {
			steps = buildPrefundSteps(
				lifiNeedUsd,
				bridge.fromChain,
				bridge.toChain,
				ctx.balancesForShortfall,
				{
					fullPrefundNeedUsdHuman: ctx.needHuman,
					limitlessBaseDest: ctx.limitlessBaseDest,
					allowedSourceChains: [bridge.fromChain],
				},
			);
		} catch (planErr) {
			console.debug("[SOR][prefund] plan rejected — compare to UI pooled cash", {
				...ctx.prefundLogBase,
				reason: planErr instanceof Error ? planErr.message : String(planErr),
			});
			return {
				success: false,
				error: planErr instanceof Error ? planErr.message : String(planErr),
			};
		}

		const lifiInput = {
			steps,
			leg,
			bridge,
			fundingAddresses,
			balancesForShortfall: ctx.balancesForShortfall,
			toAddress: ctx.toAddress,
			toChainLifi: ctx.toChainLifi,
			corridorBudgetUsd: ctx.corridorBudgetUsd,
			bridgeExecuteOpts: opts,
			privateApi,
			solanaSigner,
			reportSorExecutionPhase,
			privyEvmSendTransaction,
			getSignerForChain,
			preparePolygonRelay,
			buildExecuteLifiStepsOptions,
		};

		let lastSourceTxHash: string | undefined;

		if (plannedSweepMicros > 0n) {
			console.debug(
				"[SOR][prefund] parallel settle: Base SCW → maker receipt + LI.FI terminal",
				{
					venue: leg.venue,
					scwSweepUsdcApprox: sweepAmountHuman,
					lifiSteps: steps.length,
				},
			);
			let sweepHash: string;
			try {
				const [hash, lifiResult] = await Promise.all([
					runLimitlessScwToMakerSweep({
						fundingAddresses,
						plannedSweepMicros,
						getClientForChain,
						venue: leg.venue,
					}),
					runPrefundLifiSteps(lifiInput),
				]);
				sweepHash = hash;
				lastSourceTxHash = lifiResult.lastSourceTxHash;
			} catch (parallelErr: unknown) {
				if (isLimitlessSweepInsufficientBalanceError(parallelErr)) {
					return { success: false, error: LIMITLESS_SWEEP_INSUFFICIENT_PARALLEL_MSG };
				}
				throw parallelErr;
			}
			scwToMakerSweepTxHash = sweepHash;
		} else {
			const lifiResult = await runPrefundLifiSteps(lifiInput);
			lastSourceTxHash = lifiResult.lastSourceTxHash;
		}

		return {
			success: true,
			bridgeTxHash: lastSourceTxHash ?? scwToMakerSweepTxHash,
		};
	} catch (err) {
		console.error("error", err);
		const formatted = formatErrorForUser(err).trim();
		return {
			success: false,
			error:
				formatted.length > 0 && formatted !== "Request failed"
					? formatted
					: userMessage(LIFI_BRIDGE_FAILED),
		};
	}
}
