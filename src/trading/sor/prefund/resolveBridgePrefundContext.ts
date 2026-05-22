import { userMessage, SOR_EXECUTION_NOT_READY } from "@/errors";
import type { AccountWalletRoles } from "@/context/accountWallets";
import { CHAIN_LIFI_IDS } from "@/trading/sor/core/sor-types";
import type { RouteLeg, RouteLegBridge } from "@/trading/sor/core/sor-types";
import { maskFundingAddress } from "@/trading/sor/execute/bridgeHelpers";
import type { UseSorLegExecutorDeps } from "@/trading/sor/execute/deps";
import type { SorBridgeExecuteInput } from "@/trading/sor/execute/venueLegContext";
import { readFundingStableBalancesForChains, readBaseScwUsdcBalanceRaw } from "@/trading/sor/prefund/fundingStableBalances";
import { chainsForBridgeCorridor } from "@/trading/sor/prefund/fundingStableBalanceChains";
import {
	planLimitlessScwSweepMicros,
	recappedSweepForSend,
} from "@/trading/sor/prefund/limitlessPrefundSweep";
import {
	computePrefundBridgeShortfallUsdHuman,
	computePrefundNeedUsdHuman,
	formatPrefundBalanceBreakdown,
	LIFI_BRIDGE_AMOUNT_MARGIN,
	MIN_PREFUND_CHUNK_USD,
	PREFUND_SHORTFALL_COVERED_EPS_USD,
	resolveBuyPrefundAnchorUsd,
} from "@/trading/sor/prefund/prefundPlan";
import {
	adjustBalancesForLevelUpPendingUsdc,
	isLevelUpBaseBridgedPrefund,
	isLimitlessBaseDest,
	prefundAnchorUsdExtra,
	resolvePrefundDestAddress,
} from "@/trading/sor/prefund/venuePrefundAdjustments";
import type { FundingStableBalancesHuman } from "@/trading/sor/prefund/fundingStableBalances";

export type BridgePrefundPlanContext = {
	leg: RouteLeg;
	bridge: RouteLegBridge;
	fundingAddresses: AccountWalletRoles;
	opts: SorBridgeExecuteInput["opts"];
	needHuman: number;
	corridorBudgetUsd: number;
	bridgeShortfallUsd: number;
	balancesHuman: FundingStableBalancesHuman;
	balancesForShortfall: FundingStableBalancesHuman;
	toAddress: string;
	toChainLifi: number;
	limitlessBaseDest: boolean;
	prefundLogBase: Record<string, unknown>;
	plannedSweepMicros: bigint;
	sweepAmountHuman: number;
	lifiNeedUsd: number;
	prefundAnchorUsd: number;
	venueAppliedUsd: number;
	baseSwTrim: string;
	makerSwTrim: string;
	levelUpBaseBridgedPrefund: boolean;
	scwPendingUsdcHuman: number;
};

export async function resolveBridgePrefundContext(input: {
	leg: RouteLeg;
	bridge: RouteLegBridge;
	fundingAddresses: AccountWalletRoles;
	opts: SorBridgeExecuteInput["opts"];
	privateApi: UseSorLegExecutorDeps["privateApi"];
}): Promise<BridgePrefundPlanContext> {
	const { leg, bridge, fundingAddresses, opts, privateApi } = input;

	const toChainLifi = CHAIN_LIFI_IDS[bridge.toChain];
	const limitlessBaseDest = isLimitlessBaseDest(leg, bridge);
	const toAddress = resolvePrefundDestAddress(leg, bridge, fundingAddresses);

	const routeBridgeUsd = opts?.amountUsdOverride ?? bridge.amount;
	if (
		!(
			typeof leg.executionAmountUsd === "number" &&
			Number.isFinite(leg.executionAmountUsd) &&
			leg.executionAmountUsd > 0
		)
	) {
		throw new Error(userMessage(SOR_EXECUTION_NOT_READY));
	}
	const prefundAnchorUsd = resolveBuyPrefundAnchorUsd(
		routeBridgeUsd,
		leg.executionAmountUsd,
		prefundAnchorUsdExtra(leg, opts?.amountUsdOverride != null),
	);
	const needHuman = computePrefundNeedUsdHuman(prefundAnchorUsd, LIFI_BRIDGE_AMOUNT_MARGIN);
	const corridorBudgetUsd =
		typeof opts?.budgetUsdOverride === "number" &&
		Number.isFinite(opts.budgetUsdOverride) &&
		opts.budgetUsdOverride > 0
			? opts.budgetUsdOverride
			: leg.executionAmountUsd + Math.max(0, bridge.estimatedCost ?? 0);
	const prefundChains = chainsForBridgeCorridor({
		bridge,
		limitlessBaseDest,
	});
	const balancesHuman = await readFundingStableBalancesForChains(
		fundingAddresses,
		prefundChains,
	);
	const levelUpBaseBridgedPrefund = isLevelUpBaseBridgedPrefund(leg, bridge);
	const { balancesForShortfall, scwPendingUsdcHuman } =
		await adjustBalancesForLevelUpPendingUsdc({
			leg,
			bridge,
			balancesHuman,
			getPendingUsdcMicro: () => privateApi.getBaseSmartWalletPendingUsdc(),
		});
	const onDestUsd = limitlessBaseDest
		? Math.max(0, balancesForShortfall.limitlessMakerBase ?? 0)
		: Math.max(0, balancesForShortfall[bridge.toChain] ?? 0);
	const venueAppliedUsd = Math.min(needHuman, onDestUsd);
	const bridgeShortfallUsd = computePrefundBridgeShortfallUsdHuman(
		needHuman,
		bridge.toChain,
		balancesForShortfall,
		{ limitlessBaseDest },
	);

	let plannedSweepMicros = 0n;
	let sweepAmountHuman = 0;
	let lifiNeedUsd = bridgeShortfallUsd;
	let scwUsdcLiveBalanceMicrosLog: string | null = null;
	const baseSwTrim = fundingAddresses.baseSmartWallet;
	const makerSwTrim = fundingAddresses.limitlessMakerBase;
	if (limitlessBaseDest && bridgeShortfallUsd > PREFUND_SHORTFALL_COVERED_EPS_USD) {
		const b1 = await readBaseScwUsdcBalanceRaw(baseSwTrim);
		let sweepPlan = planLimitlessScwSweepMicros(
			bridgeShortfallUsd,
			b1,
			MIN_PREFUND_CHUNK_USD,
		);
		const b2 = await readBaseScwUsdcBalanceRaw(baseSwTrim);
		sweepPlan = recappedSweepForSend(
			sweepPlan.plannedSweepMicros,
			b2,
			bridgeShortfallUsd,
			MIN_PREFUND_CHUNK_USD,
		);
		plannedSweepMicros = sweepPlan.plannedSweepMicros;
		sweepAmountHuman = sweepPlan.sweepAmountHuman;
		lifiNeedUsd = sweepPlan.lifiNeedUsd;
		scwUsdcLiveBalanceMicrosLog = b2.toString();
	}

	const prefundLogBase = {
		venue: leg.venue,
		executionAmountUsd: Number(leg.executionAmountUsd.toFixed(4)),
		feeUsd: Number((leg.fee ?? 0).toFixed(4)),
		prefundTargetUsdApprox: Number(needHuman.toFixed(4)),
		venueSpendAppliedUsdApprox: Number(venueAppliedUsd.toFixed(4)),
		bridgeShortfallUsdApprox: Number(bridgeShortfallUsd.toFixed(4)),
		lifiShortfallAfterScwSweepUsdApprox:
			plannedSweepMicros > 0n ? Number(lifiNeedUsd.toFixed(6)) : null,
		scwSweepUsdcApprox: plannedSweepMicros > 0n ? sweepAmountHuman : null,
		bridgeAmountUsd: opts?.amountUsdOverride ?? bridge.amount,
		prefundAnchorUsdApprox: Number(prefundAnchorUsd.toFixed(4)),
		corridorBudgetUsdApprox: Number(corridorBudgetUsd.toFixed(4)),
		sorFrom: bridge.fromChain,
		sorTo: bridge.toChain,
		onChainUsd: {
			base: Number(balancesHuman.base.toFixed(4)),
			limitlessMakerBase: Number((balancesHuman.limitlessMakerBase ?? 0).toFixed(4)),
			polygon: Number(balancesHuman.polygon.toFixed(4)),
			bnb: Number(balancesHuman.bnb.toFixed(4)),
			solana: Number(balancesHuman.solana.toFixed(4)),
		},
		sumSourcesExclDest: Number(
			(["base", "polygon", "solana", "bnb"] as const)
				.filter((c) => c !== bridge.toChain)
				.reduce((s, c) => s + Math.max(0, balancesForShortfall[c] ?? 0), 0)
				.toFixed(4),
		),
		scwPendingUsdcApprox: levelUpBaseBridgedPrefund
			? Number(scwPendingUsdcHuman.toFixed(6))
			: null,
		baseSpendableForShortfallUsdApprox: levelUpBaseBridgedPrefund
			? Number((balancesForShortfall.base ?? 0).toFixed(6))
			: null,
		breakdownLine: formatPrefundBalanceBreakdown(balancesHuman, bridge.toChain, {
			limitlessBaseDest,
		}),
		walletsMasked: {
			base: maskFundingAddress(fundingAddresses.baseSmartWallet),
			limitlessMaker: maskFundingAddress(fundingAddresses.limitlessMakerBase),
			polygon: maskFundingAddress(fundingAddresses.polymarketSafe),
			bnb: maskFundingAddress(fundingAddresses.embeddedEoa),
			solana: maskFundingAddress(fundingAddresses.solanaAddress),
		},
		scwUsdcLiveBalanceMicrosFromRpc: scwUsdcLiveBalanceMicrosLog,
	};
	console.debug("[SOR][prefund] on-chain stable snapshot (RPC)", prefundLogBase);

	return {
		leg,
		bridge,
		fundingAddresses,
		opts,
		needHuman,
		corridorBudgetUsd,
		bridgeShortfallUsd,
		balancesHuman,
		balancesForShortfall,
		toAddress,
		toChainLifi,
		limitlessBaseDest,
		prefundLogBase,
		plannedSweepMicros,
		sweepAmountHuman,
		lifiNeedUsd,
		prefundAnchorUsd,
		venueAppliedUsd,
		baseSwTrim,
		makerSwTrim,
		levelUpBaseBridgedPrefund,
		scwPendingUsdcHuman,
	};
}

export { PREFUND_SHORTFALL_COVERED_EPS_USD, MIN_PREFUND_CHUNK_USD };
