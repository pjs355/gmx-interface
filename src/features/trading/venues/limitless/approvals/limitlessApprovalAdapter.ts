import {
	formatLimitlessDelegatedOrderError,
	userMessage,
	TRADE_LIMITLESS_MAKER_MISSING,
	TRADE_LIMITLESS_NOT_READY,
	TRADE_LIMITLESS_SLUG_MISSING,
	TRADE_LIMITLESS_USDC_ALLOWANCE,
	TRADE_LIMITLESS_USDC_FUNDS,
} from "@/errors";
import { isVacmReady } from "@/context/accountWallets";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
	readLimitlessSellCtfApprovalsSufficientOnBase,
} from "@/features/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase";
import { getLimitlessEnsureTradeGate } from "@/features/trading/venues/limitless/session/limitlessEnsureTradeGate";
import type { LimitlessVerifyAllowanceResult } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import type {
	ApprovalRuntime,
	LimitlessApprovalEnsureScope,
} from "@/features/trading/approvals/types";

/**
 * Just-in-time Limitless: `verify-allowance`, then on-chain approvals by side
 * (buy: USDC only; sell: CTF only), partner USDC re-check for buys, then refetch
 * `ensure-account` for gate state.
 */
export async function ensureLimitlessApprovals(
	runtime: ApprovalRuntime,
	ctx: LimitlessApprovalEnsureScope,
): Promise<void> {
	const lxJit = "[Limitless/JIT]";
	const slug = ctx.marketSlug.trim();
	const orderTokenId = ctx.limitlessOrderTokenId?.trim();
	const verifyOpts = orderTokenId ? { tokenId: orderTokenId } : undefined;
	let effectiveVenueSlug = slug;
	if (!slug) {
		throw new Error(userMessage(TRADE_LIMITLESS_SLUG_MISSING));
	}

	const ensureData = runtime.limitlessEnsureQuery.data;
	let makerFromEnsure: string | undefined;
	if (ensureData && typeof ensureData === "object") {
		const raw = (ensureData as { limitlessAccount?: { makerAddress?: unknown } }).limitlessAccount
			?.makerAddress;
		if (typeof raw === "string" && raw.trim().length > 0) {
			makerFromEnsure = raw.trim();
		}
	}

	const { venueAddressChainMap, walletGate } = runtime;
	if (!isVacmReady({ venueAddressChainMap, walletGate })) {
		throw new Error(userMessage(TRADE_LIMITLESS_MAKER_MISSING));
	}
	const maker = venueAddressChainMap!.limitless.walletAddress;
	const venueMaker = makerFromEnsure ?? maker;
	if (!venueMaker?.trim()) {
		throw new Error(userMessage(TRADE_LIMITLESS_MAKER_MISSING));
	}

	if (
		import.meta.env.DEV &&
		makerFromEnsure &&
		makerFromEnsure.trim().toLowerCase() !== maker.trim().toLowerCase()
	) {
		console.warn(
			lxJit,
			"ensure-account maker differs from account venue map (stale row — align POST ensure-account)",
			{
				venueMaker: `${makerFromEnsure.slice(0, 10)}…`,
				effectiveMaker: `${maker.slice(0, 10)}…`,
			},
		);
	}

	const isDelegatedServerWalletSubAccount = false;

	console.info(lxJit, "start", {
		routeSlug: slug,
		effectiveVenueSlug,
		side: ctx.side,
		tokenIdSent: Boolean(orderTokenId),
	});

	let allowance = (await runtime.privateApi.postLimitlessVerifyAllowance(
		slug,
		verifyOpts,
	)) as LimitlessVerifyAllowanceResult;
	effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;

	const buyOnChainOk =
		ctx.side === "buy" && !isDelegatedServerWalletSubAccount
			? await readLimitlessBuyUsdcAllowancesSufficientOnBase({
					maker,
					verify: allowance,
					chainRead: runtime.privateApi,
				})
			: false;
	const sellCtfReadsOk =
		ctx.side === "sell" && !isDelegatedServerWalletSubAccount
			? await readLimitlessSellCtfApprovalsSufficientOnBase({
					maker,
					verify: allowance,
					chainRead: runtime.privateApi,
				})
			: false;

	let didSendTransactions = false;
	try {
		if (isDelegatedServerWalletSubAccount) {
			/* skip Privy Base JIT */
		} else if (ctx.side === "buy" && buyOnChainOk) {
			/* skip */
		} else if (ctx.side === "sell" && sellCtfReadsOk) {
			/* skip */
		} else {
			const r = await ensureLimitlessTradingApprovalsOnBase({
				maker,
				getTxClientForAddress: runtime.getLimitlessTxClientForAddress,
				verify: allowance,
				side: ctx.side,
				chainRead: runtime.privateApi,
			});
			didSendTransactions = r.didSendTransactions;
		}
	} catch (e) {
		const m = e instanceof Error ? e.message : String(e);
		console.error(lxJit, "blocked at on_chain_approvals", {
			routeSlug: slug,
			effectiveVenueSlug,
			message: m,
		});
		throw e;
	}

	if (isDelegatedServerWalletSubAccount && ctx.side === "buy") {
		const fresh = await runtime.collateralTokens.refetch();
		const makerUsd =
			typeof fresh?.limitlessMakerBase === "number" && Number.isFinite(fresh.limitlessMakerBase)
				? Math.max(0, fresh.limitlessMakerBase)
				: 0;
		if (!Number.isFinite(makerUsd) || makerUsd < 0.01) {
			throw new Error(userMessage(TRADE_LIMITLESS_USDC_FUNDS));
		}
	}

	if (ctx.side === "buy" && didSendTransactions && !isDelegatedServerWalletSubAccount) {
		allowance = (await runtime.privateApi.postLimitlessVerifyAllowance(
			slug,
			verifyOpts,
		)) as LimitlessVerifyAllowanceResult;
		effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
		let buyOk = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
			maker,
			verify: allowance,
			chainRead: runtime.privateApi,
		});
		if (!buyOk) {
			await new Promise((r) => setTimeout(r, 2000));
			buyOk = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
				maker,
				verify: allowance,
				chainRead: runtime.privateApi,
			});
		}
		if (!buyOk) {
			console.error(lxJit, "blocked after buy USDC on-chain recheck", {
				routeSlug: slug,
				effectiveVenueSlug,
			});
			throw new Error(userMessage(TRADE_LIMITLESS_USDC_ALLOWANCE));
		}
	}

	let gatePayload: unknown = runtime.limitlessEnsureQuery.data ?? null;
	if (didSendTransactions) {
		const refetchResult = await runtime.limitlessEnsureQuery.refetch();
		gatePayload =
			(refetchResult != null && typeof refetchResult === "object"
				? (refetchResult as { data?: unknown }).data
				: undefined) ??
			runtime.limitlessEnsureQuery.data ??
			null;
	}
	const gate = getLimitlessEnsureTradeGate(gatePayload);
	if (!gate.ready) {
		const msg =
			gate.blockedReason?.trim() ||
			(gate.notReadyCode != null
				? `Limitless not ready (${gate.notReadyCode})`
				: "Limitless not ready.");
		const gateMsg = formatLimitlessDelegatedOrderError(msg);
		throw new Error(gateMsg.length > 0 ? gateMsg : userMessage(TRADE_LIMITLESS_NOT_READY));
	}
}
