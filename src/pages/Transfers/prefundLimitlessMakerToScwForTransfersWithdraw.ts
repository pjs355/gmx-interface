import { readFundingStableBalancesForChains } from "@/trading/sor/prefund/fundingStableBalances";
import { waitForScwUsdcAfterLimitlessPortfolioWithdraw } from "@/trading/sor/prefund/limitlessMakerToScwWithdrawWait";

const MIN_CONSOLIDATE_USD = 0.02;

/**
 * Before a Transfers withdraw plan (Li.FI from Base SCW), move USDC from the Limitless
 * delegated maker to the user's Base smart wallet so the planner and execution only ever
 * source cross-chain stable from the SCW.
 */
export async function prefundLimitlessMakerToScwForTransfersWithdraw(input: {
	amountFromMakerHuman: number;
	funding: {
		baseSmartWallet?: string | null;
		limitlessMakerBase?: string | null;
	};
	privateApi: {
		postLimitlessPortfolioWithdraw: (body: {
			amountHuman: number;
			destination: string;
		}) => Promise<unknown>;
	};
}): Promise<void> {
	const need = Math.max(0, input.amountFromMakerHuman);
	if (need + 1e-9 < MIN_CONSOLIDATE_USD) {
		return;
	}
	const sw = input.funding.baseSmartWallet?.trim();
	const mk = input.funding.limitlessMakerBase?.trim();
	if (!sw || !/^0x[a-fA-F0-9]{40}$/i.test(sw) || !mk) {
		throw new Error(
			"Limitless maker or Base smart wallet is missing — connect your account and ensure Limitless is set up before withdrawing venue USDC.",
		);
	}
	const before = await readFundingStableBalancesForChains(
		{
			baseSmartWallet: sw,
			limitlessMakerBase: mk,
		},
		["base", "limitlessMakerBase"],
	);
	const scwBefore = Math.max(0, before.base ?? 0);
	const withdrawOut = await input.privateApi.postLimitlessPortfolioWithdraw({
		amountHuman: need,
		destination: sw,
	});
	const mkBefore = Math.max(0, before.limitlessMakerBase ?? 0);
	await waitForScwUsdcAfterLimitlessPortfolioWithdraw({
		fundingAddresses: { baseSmartWallet: sw, limitlessMakerBase: mk },
		withdrawResponse: withdrawOut,
		targetScwMinUsd: scwBefore + need,
		balancesHuman: {
			base: scwBefore,
			polygon: 0,
			bnb: 0,
			solana: 0,
			limitlessMakerBase: mkBefore,
		},
		scwUsdcBeforeWithdraw: scwBefore,
		withdrawCreditsScwUsdApprox: need,
		limitlessMakerUsdcBeforeWithdraw: mkBefore,
	});
}
