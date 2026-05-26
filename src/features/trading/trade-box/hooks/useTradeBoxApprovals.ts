/**
 * Trade-box wrapper around `useApprovalGate` (JIT token approvals + DFlow proof).
 *
 * Wires Limitless Base tx client, collateral tokens, relay, and venue session queries
 * into the shared approval runtime. Refetches LevelUp approval status when account
 * connects.
 *
 * Returns `ensureTokenApprovalsForSor` / `ensureDflowProofVerified` consumed by
 * `buildTradeBoxSorLegExecutorDeps` and execute paths.
 */
import { useCallback, useEffect } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useApprovalGate } from "@/features/trading/approvals/useApprovalGate";
import { useAccountData } from "@/context/AccountDataContext";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { getLimitlessBaseTxClientForAddress } from "@/features/trading/venues/limitless/trade/limitlessBaseTxClientForAddress";
import type { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import type { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import type { useTradeBoxVenueWiring } from "./useTradeBoxVenueWiring";
import type { useTradeBoxLimitlessEnsure } from "./useTradeBoxLimitlessEnsure";

export function useTradeBoxApprovals(args: {
	account: string | null | undefined;
	relay: ReturnType<typeof usePolymarketRelay>;
	dflowProof: ReturnType<typeof useDflowProofStatus>;
	handleStartDflowProofForTrade: () => Promise<void>;
	limitlessEnsureQuery: ReturnType<typeof useTradeBoxLimitlessEnsure>["limitlessEnsureQuery"];
	venueWiring: Pick<
		ReturnType<typeof useTradeBoxVenueWiring>,
		"predictApprovalsQuery" | "predictSession" | "predictMarketDetail"
	>;
}) {
	const {
		account,
		relay,
		dflowProof,
		handleStartDflowProofForTrade,
		limitlessEnsureQuery,
		venueWiring,
	} = args;

	const accountData = useAccountData();
	const collateralTokens = useCollateralTokens();
	const { getClientForChain } = useSmartWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const venueAddressChainMap = accountData.venueAddressChainMap;
	const fundEvmForPrivy = venueAddressChainMap?.levelup.walletAddress;

	const getLimitlessTxClientForAddress = useCallback(
		(addr: string) =>
			getLimitlessBaseTxClientForAddress({
				address: addr,
				getClientForChain,
				baseSmartWallet: venueAddressChainMap?.levelup.walletAddress ?? undefined,
				embeddedEoa: venueAddressChainMap?.predictfun.walletAddress ?? undefined,
				privyEvmSendTransaction,
			}),
		[
			getClientForChain,
			venueAddressChainMap?.levelup.walletAddress,
			venueAddressChainMap?.predictfun.walletAddress,
			privyEvmSendTransaction,
		],
	);

	const approvalGate = useApprovalGate({
		levelUpEnabled: Boolean(account),
		predictApprovalsQuery: venueWiring.predictApprovalsQuery,
		predictSession: venueWiring.predictSession,
		predictMarketDetail: venueWiring.predictMarketDetail ?? undefined,
		venueAddressChainMap: accountData.venueAddressChainMap,
		walletGate: accountData.walletGate,
		polyAccount: accountData.polyAccount,
		relay,
		fundEvmForPrivy,
		getLimitlessTxClientForAddress,
		collateralTokens,
		limitlessEnsureQuery,
		dflowProof,
		handleStartDflowProofForTrade,
	});

	useEffect(() => {
		if (account) void approvalGate.refetchLevelUpApprovalStatus();
	}, [account, approvalGate.refetchLevelUpApprovalStatus]);

	return approvalGate;
}
