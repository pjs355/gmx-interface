import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { classifyLimitlessClientMaker } from "@/trading/limitless/limitlessClientMakerIdentity";
import type { LimitlessVerifyAllowanceResult } from "@/trading/limitless/limitlessPrivateApiTypes";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
	readLimitlessSellCtfApprovalsState,
} from "@/trading/limitless/limitlessTradingApprovalsOnBase";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";

const LOG = "[Limitless/Warmup]";

type PostVerify = (
	marketSlug: string,
	opts?: { tokenId?: string },
) => Promise<LimitlessVerifyAllowanceResult>;

/**
 * Post-signup Base approvals for Limitless: one canonical market slug from
 * `ensure-account` drives `verify-allowance`, then **buy** USDC approvals, then
 * **one** **sell** CTF `setApprovalForAll` pass (idempotent when already approved).
 * Per-trade JIT skips work when chain already satisfies the side
 * (`readLimitlessSellCtfApprovalsSufficientOnBase` / partner USDC OK); signup sell
 * warmup uses {@link readLimitlessSellCtfApprovalsState} so failed reads defer to JIT.
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

	const buyPartnerUsdcOk = allowance.hasMinimumAllowance;
	let didSendTransactions = false;
	if (!buyPartnerUsdcOk) {
		const r = await ensureLimitlessTradingApprovalsOnBase({
			maker,
			getTxClientForAddress: opts.getTxClientForAddress,
			verify: allowance,
			side: "buy",
		});
		didSendTransactions = r.didSendTransactions;
	}

	if (!allowance.hasMinimumAllowance) {
		allowance = await opts.postLimitlessVerifyAllowance(slug);
		if (!allowance.hasMinimumAllowance && didSendTransactions) {
			await new Promise((res) => setTimeout(res, 2000));
			allowance = await opts.postLimitlessVerifyAllowance(slug);
		}
		if (!allowance.hasMinimumAllowance) {
			const onChainBuyOk =
				await readLimitlessBuyUsdcAllowancesSufficientOnBase({
					maker,
					verify: allowance,
				});
			if (onChainBuyOk) {
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG, "partner_allowance_lag_on_chain_ok", {
						slug,
						maker: clipAddr(maker),
					});
				}
				// Continue to one-shot sell CTF warmup — do not return early.
			} else {
				const detail = [
					`maker=${clipAddr(maker)}`,
					`fundTarget=${fundTargetLog ? clipAddr(fundTargetLog) : "(none)"}`,
					`spender=${clipAddr(allowance.spender)}`,
				];
				if (allowance.limitlessCheckedAddress?.trim()) {
					detail.push(`partnerChecked=${clipAddr(allowance.limitlessCheckedAddress)}`);
				}
				throw new Error(
					`Limitless still reports insufficient USDC allowance after Base setup (${detail.join(", ")}).`,
				);
			}
		}
	}

	allowance = await opts.postLimitlessVerifyAllowance(slug);
	const sellRead = await readLimitlessSellCtfApprovalsState({
		maker,
		verify: allowance,
	});
	if (sellRead === "sufficient") {
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG, "sell_ctf_warmup_skip", {
				slug,
				reason: "already_sufficient_on_chain",
				maker: clipAddr(maker),
			});
		}
	} else if (sellRead === "unknown") {
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG, "sell_ctf_warmup_skip", {
				slug,
				reason: "read_unreliable_defer_jit",
				maker: clipAddr(maker),
			});
		}
	} else {
		await ensureLimitlessTradingApprovalsOnBase({
			maker,
			getTxClientForAddress: opts.getTxClientForAddress,
			verify: allowance,
			side: "sell",
			sellOnReadRevert: "skipOperator",
		});
	}

	if (isTradingDebugLoggingEnabled()) {
		console.info(LOG, "complete", { slug });
	}
}
