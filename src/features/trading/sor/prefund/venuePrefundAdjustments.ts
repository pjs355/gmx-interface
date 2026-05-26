import type { AccountWalletRoles } from "@/context/accountWallets";
import type { RouteLeg, RouteLegBridge } from "@/features/trading/sor/core/sor-types";
import { addressForChain } from "@/features/trading/sor/execute/bridgeHelpers";
import { scwPendingMicrosToHumanUsd } from "@/features/trading/sor/execute/helpers";
import type { BaseSmartWalletPendingUsdc } from "@/types/trading";
import type { FundingStableBalancesHuman } from "@/features/trading/sor/prefund/fundingStableBalances";
import { levelUpBuySignedPremiumUsdHuman } from "@/features/trading/venues/levelup/execute/levelUpSorSigning";

export function isLimitlessBaseDest(leg: RouteLeg, bridge: RouteLegBridge): boolean {
	return leg.venue === "limitless" && bridge.toChain === "base";
}

export function isLevelUpBaseBridgedPrefund(leg: RouteLeg, bridge: RouteLegBridge): boolean {
	return leg.venue === "levelup" && bridge.toChain === "base";
}

export function resolvePrefundDestAddress(
	leg: RouteLeg,
	bridge: RouteLegBridge,
	fundingAddresses: AccountWalletRoles,
): string {
	if (isLimitlessBaseDest(leg, bridge)) {
		return fundingAddresses.limitlessMakerBase;
	}
	return addressForChain(bridge.toChain, fundingAddresses);
}

/** Extra USD folded into prefund anchor (e.g. LevelUp signed premium). */
export function prefundAnchorUsdExtra(
	leg: RouteLeg,
	hasAmountUsdOverride: boolean,
): number | undefined {
	if (hasAmountUsdOverride) return undefined;
	if (leg.venue === "levelup") {
		return levelUpBuySignedPremiumUsdHuman(leg);
	}
	return undefined;
}

export async function adjustBalancesForLevelUpPendingUsdc(opts: {
	leg: RouteLeg;
	bridge: RouteLegBridge;
	balancesHuman: FundingStableBalancesHuman;
	getPendingUsdcMicro: () => Promise<BaseSmartWalletPendingUsdc>;
}): Promise<{ balancesForShortfall: FundingStableBalancesHuman; scwPendingUsdcHuman: number }> {
	const { leg, bridge, balancesHuman, getPendingUsdcMicro } = opts;
	if (!isLevelUpBaseBridgedPrefund(leg, bridge)) {
		return { balancesForShortfall: balancesHuman, scwPendingUsdcHuman: 0 };
	}
	let scwPendingUsdcHuman = 0;
	try {
		const pendingRow = await getPendingUsdcMicro();
		scwPendingUsdcHuman = scwPendingMicrosToHumanUsd(pendingRow.pendingUsdcMicro);
	} catch (pendingErr: unknown) {
		console.warn(
			"[SOR][prefund] getBaseSmartWalletPendingUsdc failed — shortfall uses raw Base balance (may skip LI.FI incorrectly)",
			pendingErr,
		);
	}
	return {
		balancesForShortfall: {
			...balancesHuman,
			base: Math.max(0, (balancesHuman.base ?? 0) - scwPendingUsdcHuman),
		},
		scwPendingUsdcHuman,
	};
}
