import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { normalizeLimitlessEvmAddress } from "@/features/trading/venues/limitless/trade/limitlessClientMakerIdentity";
import type { LimitlessVerifyAllowanceResult } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import type { ChainReadClient } from "@/features/trading/chain-reads/chainReadTypes";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
} from "@/features/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase";
import type { SendTransactionCapable } from "@/features/trading/lifi/sendTransactionTypes";

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
 *
 * `maker` must be `venueAddressChainMap.limitless.walletAddress` (embedded EOA).
 */
export async function runLimitlessSignupWarmupBaseApprovals(opts: {
	marketSlug: string;
	/** Limitless maker from VACM — sole on-chain identity for approvals. */
	maker: string;
	venueMakerFromApi: string;
	getTxClientForAddress: (address: string) => Promise<SendTransactionCapable | null | undefined>;
	postLimitlessVerifyAllowance: PostVerify;
	chainRead: ChainReadClient;
}): Promise<void> {
	const slug = opts.marketSlug.trim();
	if (!slug) {
		throw new Error("Limitless warmup market slug missing.");
	}
	const maker = opts.maker.trim();
	if (!maker) {
		throw new Error("Limitless maker wallet missing (VACM limitless.walletAddress).");
	}
	const venueMaker = opts.venueMakerFromApi.trim();
	if (!venueMaker) {
		throw new Error(
			"Limitless maker address missing — ensure-account did not return limitlessAccount.makerAddress.",
		);
	}

	const apiMaker = normalizeLimitlessEvmAddress(venueMaker);
	const vacmMaker = normalizeLimitlessEvmAddress(maker);
	if (!vacmMaker) {
		throw new Error("Limitless VACM maker address invalid.");
	}
	const isDelegatedServerWalletSubAccount = Boolean(
		apiMaker && apiMaker.toLowerCase() !== vacmMaker.toLowerCase(),
	);

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
			maker: clipAddr(vacmMaker),
			apiMaker: apiMaker ? clipAddr(apiMaker) : "(none)",
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

	// Partner `verify-allowance` is the authoritative "can you trade" signal. When it
	// reports the maker already has minimum allowance, the maker can trade and any
	// on-chain `approve` here is a no-op — sending one (and retrying when our own
	// on-chain read disagrees) just spams sponsored Base txs. Only fall through to
	// on-chain approvals when the partner says allowance is missing.
	const buyOnChainOk =
		allowance.hasMinimumAllowance ||
		(await readLimitlessBuyUsdcAllowancesSufficientOnBase({
			maker: vacmMaker,
			verify: allowance,
			chainRead: opts.chainRead,
		}));
	if (buyOnChainOk) {
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG, "buy_usdc_warmup_skip", {
				slug,
				reason: allowance.hasMinimumAllowance
					? "partner_has_minimum_allowance"
					: "already_sufficient_on_chain",
				maker: clipAddr(vacmMaker),
			});
		}
	} else {
		await ensureLimitlessTradingApprovalsOnBase({
			maker: vacmMaker,
			getTxClientForAddress: opts.getTxClientForAddress,
			verify: allowance,
			side: "buy",
			chainRead: opts.chainRead,
		});
		allowance = await opts.postLimitlessVerifyAllowance(slug);
		const afterBuy =
			allowance.hasMinimumAllowance ||
			(await readLimitlessBuyUsdcAllowancesSufficientOnBase({
				maker: vacmMaker,
				verify: allowance,
				chainRead: opts.chainRead,
			}));
		if (!afterBuy) {
			const detail = [
				`maker=${clipAddr(vacmMaker)}`,
				`apiMaker=${apiMaker ? clipAddr(apiMaker) : "(none)"}`,
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
