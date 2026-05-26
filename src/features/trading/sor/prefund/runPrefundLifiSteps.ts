import { base } from "viem/chains";
import { executeLifiSteps } from "@/features/trading/lifi/executeLifiSteps";
import { pollLifiUntilTerminal } from "@/features/trading/lifi/pollLifiStatus";
import type { LifiQuoteResponse, LifiStatusResponse } from "@/types/trading";
import { withTimeout } from "@/shared/async/withTimeout";
import { userMessage, LIFI_NO_BRIDGE_STEPS, LIFI_NO_TX_HASH, LIFI_STEP_FAILED } from "@/errors";
import { CHAIN_LIFI_IDS } from "@/features/trading/sor/core/sor-types";
import type { RouteLeg, RouteLegBridge } from "@/features/trading/sor/core/sor-types";
import {
	pickBridgeSourceTxHashForLifiStatus,
	prefundSourceAddressForStep,
	SOLANA_LIFI_CHAIN_ID,
} from "@/features/trading/sor/execute/bridgeHelpers";
import type { SorBridgeExecuteInput } from "@/features/trading/sor/execute/venueLegContext";
import type { UseSorLegExecutorDeps } from "@/features/trading/sor/execute/deps";
import type { FundingStableBalancesHuman } from "@/features/trading/sor/prefund/fundingStableBalances";
import { readBnbUsdtBalanceWei } from "@/features/trading/sor/prefund/fundingStableBalances";
import {
	ensurePrefundQuoteMeetsDestMin,
	type PrefundLifiQuoteClient,
} from "@/features/trading/sor/prefund/lifiPrefundQuoteSolve";
import {
	mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund,
	sorBasePrefundLifiShouldUseEmbeddedSigner,
} from "@/features/trading/sor/prefund/sorPrefundLifiExecutionAlignment";
import type { PrefundStep } from "@/features/trading/sor/prefund/prefundPlan";
import {
	SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
	SOR_LIFI_PREFUND_POLL_CONFIG,
} from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";
import { createPrivyEmbeddedSendTransactionCapable } from "@/features/trading/venues/polymarket/wallet/embeddedPrivyViemSend";

const POLYGON_CHAIN_ID = 137;

export async function runPrefundLifiSteps(opts: {
	steps: PrefundStep[];
	leg: RouteLeg;
	bridge: RouteLegBridge;
	fundingAddresses: SorBridgeExecuteInput["fundingAddresses"];
	balancesForShortfall: FundingStableBalancesHuman;
	toAddress: string;
	toChainLifi: number;
	corridorBudgetUsd: number;
	bridgeExecuteOpts: SorBridgeExecuteInput["opts"];
	privateApi: UseSorLegExecutorDeps["privateApi"];
	solanaSigner: UseSorLegExecutorDeps["solanaSigner"];
	reportSorExecutionPhase: SorBridgeExecuteInput["reportSorExecutionPhase"];
	privyEvmSendTransaction: SorBridgeExecuteInput["privyEvmSendTransaction"];
	getSignerForChain: SorBridgeExecuteInput["getSignerForChain"];
	preparePolygonRelay: SorBridgeExecuteInput["preparePolygonRelay"];
	buildExecuteLifiStepsOptions: SorBridgeExecuteInput["buildExecuteLifiStepsOptions"];
}): Promise<{ lastSourceTxHash: string | undefined }> {
	const {
		steps,
		leg,
		bridge,
		fundingAddresses,
		balancesForShortfall,
		toAddress,
		toChainLifi,
		corridorBudgetUsd,
		bridgeExecuteOpts,
		privateApi,
		solanaSigner,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
		getSignerForChain,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
	} = opts;

	let lastSourceTxHash: string | undefined;

	const sumStepsHuman = steps.reduce((s, st) => s + Math.max(0, Number(st.amountHuman)), 0);
	const stepBudgetShares = steps.map((st) => {
		const portion = Math.max(0, Number(st.amountHuman));
		if (sumStepsHuman <= 1e-9) return 0;
		return (portion / sumStepsHuman) * corridorBudgetUsd;
	});
	let corridorBudgetCarryUsd = 0;

	const reportPrefund = bridgeExecuteOpts?.onPrefundProgress;
	for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
		const step = steps[stepIdx]!;
		reportPrefund?.({
			current: stepIdx + 1,
			total: steps.length,
		});
		const fromChainLifi = CHAIN_LIFI_IDS[step.fromChain];
		const fromAddress = prefundSourceAddressForStep(step, fundingAddresses);

		const maxFromHuman =
			step.fromChain === "base"
				? step.baseSpendWallet === "limitlessMaker"
					? Math.max(0, balancesForShortfall.limitlessMakerBase ?? 0)
					: Math.max(0, balancesForShortfall.base ?? 0)
				: Math.max(0, balancesForShortfall[step.fromChain] ?? 0);
		const destPortionUsd = Math.max(0, Number(step.amountHuman));
		const perStepShare = Math.max(0, stepBudgetShares[stepIdx] ?? 0);
		const stepBudgetUsd = perStepShare + corridorBudgetCarryUsd;
		if (stepBudgetUsd <= 1e-9) {
			throw new Error(userMessage(LIFI_STEP_FAILED));
		}
		const maxFromWei =
			fromChainLifi === 56 ? await readBnbUsdtBalanceWei(fundingAddresses.embeddedEoa) : undefined;
		let quote: LifiQuoteResponse;
		let spentHumanForLedger = 0;
		try {
			const solved = await ensurePrefundQuoteMeetsDestMin({
				api: privateApi as PrefundLifiQuoteClient,
				fromChainLifi,
				toChainLifi,
				fromAddress,
				toAddress: toAddress.trim(),
				destPortionUsd,
				maxFromHuman,
				budgetUsd: stepBudgetUsd,
				seedAmountHuman: step.amountHuman,
				strictDestMinAtSendCap: bridgeExecuteOpts?.strictLifiDestMinAtSendCap === true,
				maxFromWei,
			});
			quote = solved.quote;
			spentHumanForLedger = Number(solved.amountHuman);
			corridorBudgetCarryUsd = Math.max(0, stepBudgetUsd - spentHumanForLedger);
			console.debug("[SOR][prefund] LI.FI quote solved", {
				venue: leg.venue,
				corridor: `${step.fromChain}->${bridge.toChain}`,
				step: `${stepIdx + 1}/${steps.length}`,
				destPortionUsd: Number(destPortionUsd.toFixed(6)),
				corridorBudgetUsd: Number(corridorBudgetUsd.toFixed(6)),
				perStepShareUsd: Number(perStepShare.toFixed(6)),
				stepBudgetUsd: Number(stepBudgetUsd.toFixed(6)),
				corridorBudgetCarryUsd: Number(corridorBudgetCarryUsd.toFixed(6)),
				maxFromHuman: Number(maxFromHuman.toFixed(6)),
				sendHuman: Number(spentHumanForLedger.toFixed(6)),
			});
		} catch (quoteErr) {
			const msg = quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
			throw new Error(msg);
		}

		if (!quote.steps?.length) {
			throw new Error(userMessage(LIFI_NO_BRIDGE_STEPS));
		}

		if (import.meta.env.DEV) {
			const st0 = quote.steps[0] as Record<string, unknown> | undefined;
			console.debug("[SOR] Bridge LIFI quote", {
				venue: leg.venue,
				prefundStep: `${stepIdx + 1}/${steps.length}`,
				fromChainLifi,
				toChainLifi,
				stepCount: quote.steps.length,
				firstStepKind: st0?.kind,
				firstStepChainId: st0?.chainId,
			});
		}

		const needsRelay = fromChainLifi === POLYGON_CHAIN_ID;
		const polygonRelay = await preparePolygonRelay(needsRelay);

		const routeIncludesSolana =
			fromChainLifi === SOLANA_LIFI_CHAIN_ID || toChainLifi === SOLANA_LIFI_CHAIN_ID;

		const builtLifiOpts = buildExecuteLifiStepsOptions(quote, {
			routeIncludesSolana,
			polygonRelay,
		});
		const lifiStepOptions = {
			...mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(
				builtLifiOpts,
				fromChainLifi,
				String(quote.fromAddress ?? ""),
			),
			...(solanaSigner != null ? { solanaSigner } : {}),
		};

		const getSignerForChainPrefund = async (chainId: number) => {
			if (
				sorBasePrefundLifiShouldUseEmbeddedSigner({
					chainId,
					quoteFromAddressRaw: String(quote.fromAddress ?? ""),
					embeddedEoaRaw: fundingAddresses.embeddedEoa,
				})
			) {
				return createPrivyEmbeddedSendTransactionCapable(
					fundingAddresses.embeddedEoa as `0x${string}`,
					base,
					privyEvmSendTransaction,
				);
			}
			return getSignerForChain(chainId);
		};

		console.debug("[SOR][prefund] executing LI.FI on-chain steps (wallet may prompt)…", {
			venue: leg.venue,
			prefundStep: `${stepIdx + 1}/${steps.length}`,
			fromChainLifi,
			toChainLifi,
		});

		reportSorExecutionPhase("approving_funds_transfer");
		let txHashes: string[];
		try {
			const lifiOnchain = await withTimeout(
				executeLifiSteps(
					quote.steps as Parameters<typeof executeLifiSteps>[0],
					getSignerForChainPrefund,
					lifiStepOptions,
				),
				SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS,
				"SOR LI.FI on-chain steps (approvals / bridge tx)",
			);
			txHashes = lifiOnchain.txHashes;
		} finally {
			reportSorExecutionPhase("moving_funds");
		}

		console.debug("[SOR][prefund] on-chain steps submitted; polling bridge status…", {
			venue: leg.venue,
			txCount: txHashes.length,
		});

		const sourceTxHash = pickBridgeSourceTxHashForLifiStatus(
			txHashes,
			quote.steps as unknown[] | undefined,
			fromChainLifi,
		);
		if (!sourceTxHash) {
			throw new Error(userMessage(LIFI_NO_TX_HASH));
		}

		const statusTool =
			typeof quote.statusBridge === "string" && quote.statusBridge.trim()
				? quote.statusBridge.trim()
				: undefined;

		await pollLifiUntilTerminal(
			() =>
				privateApi.getFundingLifiStatus({
					txHash: sourceTxHash,
					...(statusTool != null ? { tool: statusTool } : {}),
					fromChain: fromChainLifi,
					toChain: toChainLifi,
				}) as Promise<LifiStatusResponse>,
			SOR_LIFI_PREFUND_POLL_CONFIG,
		);

		if (Number.isFinite(spentHumanForLedger) && spentHumanForLedger > 0) {
			if (step.fromChain === "base" && step.baseSpendWallet === "limitlessMaker") {
				const cur = balancesForShortfall.limitlessMakerBase ?? 0;
				balancesForShortfall.limitlessMakerBase = Math.max(0, cur - spentHumanForLedger);
			} else {
				const cur = balancesForShortfall[step.fromChain] ?? 0;
				balancesForShortfall[step.fromChain] = Math.max(0, cur - spentHumanForLedger);
			}
		}

		lastSourceTxHash = sourceTxHash;
	}

	return { lastSourceTxHash };
}
