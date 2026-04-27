import { readFundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";
import { PREFUND_SHORTFALL_COVERED_EPS_USD } from "@/trading/sor/prefundPlan";

const MIN_CONSOLIDATE_USD = 0.02;
const POLL_MS = 2500;
const TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

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
	const before = await readFundingStableBalancesHuman({
		baseSmartWallet: sw,
		limitlessMakerBase: mk,
	});
	const scwBefore = Math.max(0, before.base ?? 0);
	await input.privateApi.postLimitlessPortfolioWithdraw({
		amountHuman: need,
		destination: sw,
	});
	const deadline = Date.now() + TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleep(POLL_MS);
		const b = await readFundingStableBalancesHuman({
			baseSmartWallet: sw,
			limitlessMakerBase: mk,
		});
		const scw = Math.max(0, b.base ?? 0);
		if (scw + 1e-9 >= scwBefore + need - PREFUND_SHORTFALL_COVERED_EPS_USD) {
			return;
		}
	}
	throw new Error(
		"Timed out waiting for Limitless withdrawal to credit your Base smart wallet. Check activity or try again.",
	);
}
