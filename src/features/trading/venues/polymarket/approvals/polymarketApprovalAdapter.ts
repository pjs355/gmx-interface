import {
	userMessage,
	TRADE_POLY_APPROVALS_INCOMPLETE,
	TRADE_POLY_RELAYER_UNAVAILABLE,
	TRADE_POLY_SAFE_NOT_PROVISIONED,
} from "@/errors";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import type {
	ApprovalRuntime,
	PolymarketApprovalEnsureScope,
} from "@/features/trading/approvals/types";

export async function ensurePolymarketApprovals(
	runtime: ApprovalRuntime,
	opts?: PolymarketApprovalEnsureScope,
): Promise<void> {
	const safe = runtime.venueAddressChainMap?.polymarket.walletAddress ?? null;
	if (!safe) {
		throw new Error(userMessage(TRADE_POLY_SAFE_NOT_PROVISIONED));
	}

	const { checkPolymarketApprovals } =
		await import("@/features/trading/venues/polymarket/trade/approvalTxs");
	const status = await checkPolymarketApprovals(safe, runtime.privateApi);
	if (!opts?.force && status.allApproved) return;

	const client = await runtime.relay.getRelayClient();
	if (!client) {
		throw new Error(userMessage(TRADE_POLY_RELAYER_UNAVAILABLE));
	}
	const { executePolymarketApprovalBatch } =
		await import("@/features/trading/venues/polymarket/session/safeActions");
	opts?.onApprovalWorkStart?.();
	await executePolymarketApprovalBatch(client, safe, runtime.privateApi);

	const recheck = await checkPolymarketApprovals(safe, runtime.privateApi);
	if (!recheck.allApproved) {
		throw new Error(userMessage(TRADE_POLY_APPROVALS_INCOMPLETE));
	}

	try {
		await runtime.polyAccount.verifyOnChain.mutateAsync({});
	} catch (e) {
		console.warn("[Polymarket] verify-on-chain after approval recovery failed", e);
		await runtime.queryClient.invalidateQueries({
			queryKey: tradingQueryKeys.polymarketAccount,
		});
	}
}
