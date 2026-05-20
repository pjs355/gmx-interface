import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { classifyLimitlessClientMaker } from "@/trading/limitless/limitlessClientMakerIdentity";
import type { LimitlessVerifyAllowanceResult } from "@/trading/limitless/limitlessPrivateApiTypes";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
} from "@/trading/limitless/limitlessTradingApprovalsOnBase";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";

const LOG = "[Limitless/Warmup]";

type PostVerify = (
	marketSlug: string,
	opts?: { tokenId?: string },
) => Promise<LimitlessVerifyAllowanceResult>;

/**
 * Post-signup Base approvals for Limitless — **buy only** (USDC `approve`).
 *
 * Sell CTF `setApprovalForAll` is deferred to the first sell trade (JIT). That
 * keeps signup to at most one on-chain signature and avoids duplicating the
 * 1–2 CTF operator approvals you saw when warmup and JIT raced each other.
 */
export async function runLimitlessSignupWarmupBaseApprovals(opts: {
	marketSlug: string;
	venueMakerFromApi: string;
	fundTarget?: string;
	signerAddress?: string;
	account?: string;
	embeddedEoa?: string;
	getTxClientForAddress: (
		address: string,
	) => Promise<SendTransactionCapable | null | undefined>;
	postLimitlessVerifyAllowance: PostVerify;
}): Promise<void> {
	const slug = opts.marketSlug.trim();
	if (!slug) {
		throw new Error("Limitless warmup market slug missing.");
	}
	const venueMaker = opts.venueMakerFromApi.trim();
	if (!venueMaker) {
		throw new Error(
			"Limitless maker address missing — ensure-account did not return limitlessAccount.makerAddress.",
		);
	}

	const { effectiveMaker: maker, isDelegatedServerWalletSubAccount } =
		classifyLimitlessClientMaker({
			venueMakerFromApi: venueMaker,
			fundTarget: opts.fundTarget,
			signerAddress: opts.signerAddress,
			account: opts.account,
			embeddedEoa: opts.embeddedEoa,
		});

	const fundTargetLog = opts.fundTarget?.trim() ?? "";

	const clipAddr = (addr: string) => {
		const t = addr.trim();
		if (t.length <= 22) return t;
		return `${t.slice(0, 10)}…${t.slice(-6)}`;
	};

	let allowance = await opts.postLimitlessVerifyAllowance(slug);
	if (isTradingDebugLoggingEnabled()) {
		console.info(LOG, "verify_allowance", {
			slug,
			hasMinimumAllowance: allowance.hasMinimumAllowance,
			isDelegatedServerWalletSubAccount,
			maker: clipAddr(maker),
			fundTarget: fundTargetLog ? clipAddr(fundTargetLog) : "(none)",
		});
	}

	if (isDelegatedServerWalletSubAccount) {
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG, "skip_on_chain", {
				reason: "delegated_server_wallet_sub_account",
				slug,
			});
		}
		return;
	}

	const buyOnChainOk = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
		maker,
		verify: allowance,
	});
	if (buyOnChainOk) {
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG, "buy_usdc_warmup_skip", {
				slug,
				reason: "already_sufficient_on_chain",
				maker: clipAddr(maker),
			});
		}
	} else {
		await ensureLimitlessTradingApprovalsOnBase({
			maker,
			getTxClientForAddress: opts.getTxClientForAddress,
			verify: allowance,
			side: "buy",
		});
		allowance = await opts.postLimitlessVerifyAllowance(slug);
		const afterBuy = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
			maker,
			verify: allowance,
		});
		if (!afterBuy) {
			const detail = [
				`maker=${clipAddr(maker)}`,
				`fundTarget=${fundTargetLog ? clipAddr(fundTargetLog) : "(none)"}`,
				`spender=${clipAddr(allowance.spender)}`,
			];
			throw new Error(
				`Limitless USDC allowance still insufficient on Base after signup warmup (${detail.join(", ")}).`,
			);
		}
	}

	if (isTradingDebugLoggingEnabled()) {
		console.info(LOG, "complete", {
			slug,
			note: "sell CTF deferred to first sell trade",
		});
	}
}
