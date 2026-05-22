import { useCallback } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ethers } from "ethers";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import {
	formatLimitlessDelegatedOrderError,
	userMessage,
	TRADE_LEVELUP_APPROVALS_INCOMPLETE,
	TRADE_LIMITLESS_MAKER_MISSING,
	TRADE_LIMITLESS_NOT_READY,
	TRADE_LIMITLESS_SLUG_MISSING,
	TRADE_LIMITLESS_USDC_ALLOWANCE,
	TRADE_LIMITLESS_USDC_FUNDS,
	TRADE_POLY_APPROVALS_INCOMPLETE,
	TRADE_POLY_RELAYER_UNAVAILABLE,
	TRADE_POLY_SAFE_NOT_PROVISIONED,
	TRADE_PREDICT_APPROVALS_INCOMPLETE,
} from "@/errors";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
	readLimitlessSellCtfApprovalsSufficientOnBase,
} from "@/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase";
import { getLimitlessEnsureTradeGate } from "@/trading/venues/limitless/session/limitlessEnsureTradeGate";
import { isVacmReady, type AccountDataVacmSlice } from "@/context/accountWallets";
import type { AccountPolyAccountSlice } from "@/context/AccountDataContext";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import type { usePolymarketRelay } from "@/trading/venues/polymarket/session/usePolymarketRelay";
import type { usePredictTradingSession } from "@/trading/venues/predict/session/usePredictTradingSession";
import type { usePredictApprovalsStatus } from "@/trading/venues/predict/wallet/usePredictApprovalsStatus";
import type { usePredictMarketDetail } from "@/trading/venues/predict/portfolio/usePredictMarketDetail";

export interface UseTradeBoxVenueApprovalsParams {
	checkApproval: () => Promise<boolean>;
	approveToken: () => Promise<void>;
	predictApprovalsQuery: ReturnType<typeof usePredictApprovalsStatus>;
	predictSession: ReturnType<typeof usePredictTradingSession>;
	predictMarketDetail: ReturnType<typeof usePredictMarketDetail>["data"];
	queryClient: ReturnType<typeof useQueryClient>;
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	polyAccount: AccountPolyAccountSlice;
	relay: ReturnType<typeof usePolymarketRelay>;
	account: string | null | undefined;
	signerAddress: string | null | undefined;
	fundEvmForPrivy: string | undefined;
	getLimitlessTxClientForAddress: (addr: string) => Promise<SendTransactionCapable | null | undefined>;
	collateralTokens: ReturnType<typeof useCollateralTokens>;
	limitlessEnsureQuery: UseQueryResult<unknown>;
	dflowProof: ReturnType<typeof useDflowProofStatus>;
	handleStartDflowProofForTrade: () => Promise<void>;
}

export function useTradeBoxVenueApprovals({
	checkApproval,
	approveToken,
	predictApprovalsQuery,
	predictSession,
	predictMarketDetail,
	queryClient,
	venueAddressChainMap,
	walletGate,
	polyAccount,
	relay,
	account,
	signerAddress,
	fundEvmForPrivy,
	getLimitlessTxClientForAddress,
	collateralTokens,
	limitlessEnsureQuery,
	dflowProof,
	handleStartDflowProofForTrade,
}: UseTradeBoxVenueApprovalsParams) {
	const privateApi = usePrivateApiClient();

  const ensurePredictApprovalsForTrade = useCallback(async () => {
    if (predictApprovalsQuery.data === true) return;
    await predictSession.setApprovals({
      isNegRisk: predictMarketDetail?.isNegRisk ?? false,
      isYieldBearing: predictMarketDetail?.isYieldBearing ?? false,
    });
    await queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
    const refreshed = await predictApprovalsQuery.refetch();
    if (!refreshed.data) {
      throw new Error(userMessage(TRADE_PREDICT_APPROVALS_INCOMPLETE));
    }
  }, [predictApprovalsQuery, predictSession, predictMarketDetail, queryClient]);

  const ensureLevelUpApprovalsForTrade = useCallback(async () => {
    let ok = await checkApproval();
    if (ok) return;
    await approveToken();
    ok = await checkApproval();
    if (!ok) {
      throw new Error(userMessage(TRADE_LEVELUP_APPROVALS_INCOMPLETE));
    }
  }, [checkApproval, approveToken]);

  /**
   * Polymarket approval gate for the trade hot path.
   *
   * Fast path (default): trust the persisted venue-state flags from the
   * polymarket-account query. Onboarding's relay batch sets all approvals at
   * once and `verify-on-chain` flips the booleans, so once a user is fully
   * onboarded every subsequent trade can skip the on-chain
   * `checkPolymarketApprovals` multicall entirely (~150-300ms saved per
   * trade). Pass `{ force: true }` to bypass the fast path — the SOR leg
   * executor's order-error recovery branch uses this to repair an
   * externally-revoked allowance.
   *
   * `onApprovalWorkStart` is fired by the callback **only** right before
   * `executePolymarketApprovalBatch` actually submits the relay batch. The
   * SOR executor uses it to flip the trade-button label to "Approving
   * trades..." just for that window — so the common fast-path case never
   * shows an "Approving" flash when no approvals are running.
   */
  const ensurePolymarketApprovalsForTrade = useCallback(
    async (opts?: {
      force?: boolean;
      onApprovalWorkStart?: () => void;
    }) => {
      const safe = venueAddressChainMap?.polymarket.walletAddress ?? null;
      if (!safe) {
        throw new Error(userMessage(TRADE_POLY_SAFE_NOT_PROVISIONED));
      }

      const force = opts?.force === true;
      if (!force) {
        const state = polyAccount.data?.polymarketAccount;
        const flagsAllSet =
          !!state &&
          state.safeDeployed === true &&
          state.usdcApprovalComplete === true &&
          state.ctfApprovalComplete === true &&
          state.collateralOnrampUsdceApprovalComplete === true &&
          state.collateralOfframpPusdApprovalComplete === true;
        if (flagsAllSet) return;
      }

      const { checkPolymarketApprovals } = await import(
        "@/trading/venues/polymarket/trade/approvalTxs"
      );
      const status = await checkPolymarketApprovals(safe);
      if (status.allApproved) return;

      const client = await relay.getRelayClient();
      if (!client) {
        throw new Error(userMessage(TRADE_POLY_RELAYER_UNAVAILABLE));
      }
      const { executePolymarketApprovalBatch } = await import(
        "@/trading/venues/polymarket/session/safeActions"
      );
      opts?.onApprovalWorkStart?.();
      await executePolymarketApprovalBatch(client, safe);

      const recheck = await checkPolymarketApprovals(safe);
      if (!recheck.allApproved) {
        throw new Error(userMessage(TRADE_POLY_APPROVALS_INCOMPLETE));
      }

      // Refresh the polymarket-account query so the next trade's fast path
      // sees the freshly-set on-chain allowances reflected in the persisted
      // flags. Best-effort — the recovery path is rare (external revoke) and
      // we already re-approved on-chain, so failure here doesn't block.
      // `verifyOnChain.onSuccess` already invalidates the polymarket-account
      // query, so a separate invalidate is only needed if the mutation
      // itself fails.
      try {
        await polyAccount.verifyOnChain.mutateAsync({});
      } catch (e) {
        console.warn(
          "[Polymarket] verify-on-chain after approval recovery failed",
          e,
        );
        await queryClient.invalidateQueries({
          queryKey: tradingQueryKeys.polymarketAccount,
        });
      }
    },
    [
      venueAddressChainMap?.polymarket.walletAddress,
      polyAccount.data,
      polyAccount.verifyOnChain,
      queryClient,
      relay,
    ],
  );

  /**
   * Just-in-time Limitless: `verify-allowance`, then on-chain approvals by side
   * (buy: USDC only; sell: CTF only), one `sendTransaction` + receipt per call,
   * partner USDC re-check for buys, then refetch `ensure-account` for gate state.
   */
  const ensureLimitlessApprovalsForTrade = useCallback(
    async (ctx: {
      marketSlug: string;
      limitlessOrderTokenId?: string;
      side: "buy" | "sell";
      getClientForChain: (opts: {
        id: number;
      }) => Promise<SendTransactionCapable | null | undefined>;
    }) => {
      const lxJit = "[Limitless/JIT]";
      const slug = ctx.marketSlug.trim();
      const orderTokenId = ctx.limitlessOrderTokenId?.trim();
      const verifyOpts = orderTokenId ? { tokenId: orderTokenId } : undefined;
      /** Venue slug used for partner allowance + market fetch (may differ from route slug for NegRisk). */
      let effectiveVenueSlug = slug;
      if (!slug) {
        throw new Error(userMessage(TRADE_LIMITLESS_SLUG_MISSING));
      }
      console.info(lxJit, "start", {
        routeSlug: slug,
        effectiveVenueSlug,
        side: ctx.side,
        tokenIdSent: Boolean(orderTokenId),
      });
      const ensureData = limitlessEnsureQuery.data;
      let makerFromEnsure: string | undefined;
      if (ensureData && typeof ensureData === "object") {
        const raw = (
          ensureData as { limitlessAccount?: { makerAddress?: unknown } }
        ).limitlessAccount?.makerAddress;
        if (typeof raw === "string" && raw.trim().length > 0) {
          makerFromEnsure = raw.trim();
        }
      }
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
        console.warn(lxJit, "ensure-account maker differs from account venue map (stale row — align POST ensure-account)", {
          venueMaker: `${makerFromEnsure.slice(0, 10)}…`,
          effectiveMaker: `${maker.slice(0, 10)}…`,
        });
      }

      /** User’s Privy Base funding identity (SCW) — for logs / sweeps; on-chain Limitless approvals use embedded EOA `maker`. */
      const userBaseFunding = fundEvmForPrivy?.trim() ?? "";
      const isDelegatedServerWalletSubAccount = false;
      const clipAddr = (addr: string) => {
        const t = addr.trim();
        if (t.length <= 22) return t;
        return `${t.slice(0, 10)}…${t.slice(-6)}`;
      };
      console.info(lxJit, "phase", {
        step: "verify_allowance",
        routeSlug: slug,
        effectiveVenueSlug,
        venueMaker: `${venueMaker.slice(0, 10)}…`,
        effectiveMaker: `${maker.slice(0, 10)}…`,
        userBaseFunding: userBaseFunding
          ? `${userBaseFunding.slice(0, 10)}…`
          : "(none)",
        note: "USDC/CTF approvals are sent as Limitless maker (embedded when SCW is fund target)",
      });
      let allowance = await privateApi.postLimitlessVerifyAllowance(slug, verifyOpts);
      effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
      console.info(lxJit, "phase", {
        step: "verify_allowance_done",
        routeSlug: slug,
        effectiveVenueSlug,
        effectiveMarketSlug: allowance.effectiveMarketSlug,
        declaredMarketSlug: allowance.declaredMarketSlug,
        hasMinimumAllowance: allowance.hasMinimumAllowance,
        spender: `${allowance.spender.slice(0, 12)}…`,
        partnerAllowanceOwnerId: allowance.partnerAllowanceOwnerId,
        limitlessPartnerAllowanceType: allowance.limitlessPartnerAllowanceType,
        venueAdapterPresent:
          typeof allowance.venueAdapter === "string" &&
          allowance.venueAdapter.trim() !== "",
        ctfAddressFromApi:
          typeof allowance.ctfAddress === "string" && allowance.ctfAddress.trim() !== "",
        limitlessCheckedAddress:
          typeof allowance.limitlessCheckedAddress === "string"
            ? clipAddr(allowance.limitlessCheckedAddress)
            : undefined,
      });

      /**
       * Buys: trust on-chain USDC allowance reads, not partner `hasMinimumAllowance`
       * (server sets that flag optimistically). Sells use CTF reads when needed.
       */
      const buyOnChainOk =
        ctx.side === "buy" && !isDelegatedServerWalletSubAccount
          ? await readLimitlessBuyUsdcAllowancesSufficientOnBase({
              maker,
              verify: allowance,
            })
          : false;
      const sellCtfReadsOk =
        ctx.side === "sell" && !isDelegatedServerWalletSubAccount
          ? await readLimitlessSellCtfApprovalsSufficientOnBase({
              maker,
              verify: allowance,
            })
          : false;
      console.info(lxJit, "phase", {
        step: "sub_account_mode",
        routeSlug: slug,
        effectiveVenueSlug,
        isDelegatedServerWalletSubAccount,
        buyOnChainOk: ctx.side === "buy" ? buyOnChainOk : undefined,
        sellCtfReadsOk: ctx.side === "sell" ? sellCtfReadsOk : undefined,
      });

      console.info(lxJit, "phase", {
        step: "on_chain_approvals_if_needed",
        routeSlug: slug,
        effectiveVenueSlug,
      });
      let didSendTransactions = false;
      try {
        if (isDelegatedServerWalletSubAccount) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "delegated_server_wallet_sub_account",
            note: "Limitless provisions approvals on managed wallet; skip Privy Base JIT",
          });
        } else if (ctx.side === "buy" && buyOnChainOk) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "buy_usdc_on_chain_ok",
          });
        } else if (ctx.side === "sell" && sellCtfReadsOk) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "sell_ctf_on_chain_ok",
          });
        } else {
          const r = await ensureLimitlessTradingApprovalsOnBase({
            maker,
            getTxClientForAddress: getLimitlessTxClientForAddress,
            verify: allowance,
            side: ctx.side,
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
      console.info(lxJit, "phase", {
        step: "on_chain_approvals_done",
        routeSlug: slug,
        effectiveVenueSlug,
      });

      if (isDelegatedServerWalletSubAccount && ctx.side === "buy") {
        const fresh = await collateralTokens.refetch();
        const makerUsd =
          typeof fresh?.limitlessMakerBase === "number" &&
          Number.isFinite(fresh.limitlessMakerBase)
            ? Math.max(0, fresh.limitlessMakerBase)
            : 0;
        if (!Number.isFinite(makerUsd) || makerUsd < 0.01) {
          throw new Error(userMessage(TRADE_LIMITLESS_USDC_FUNDS));
        }
      }

      if (ctx.side === "buy" && didSendTransactions && !isDelegatedServerWalletSubAccount) {
        console.info(lxJit, "phase", {
          step: "buy_usdc_on_chain_recheck",
          routeSlug: slug,
          effectiveVenueSlug,
          didSendTransactions,
        });
        allowance = await privateApi.postLimitlessVerifyAllowance(slug, verifyOpts);
        effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
        let buyOk = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
          maker,
          verify: allowance,
        });
        if (!buyOk) {
          await new Promise((r) => setTimeout(r, 2000));
          buyOk = await readLimitlessBuyUsdcAllowancesSufficientOnBase({
            maker,
            verify: allowance,
          });
        }
        if (!buyOk) {
          const detail = [
            `maker=${clipAddr(maker)}`,
            `userBaseFunding=${clipAddr(userBaseFunding || "(none)")}`,
            `spender=${clipAddr(allowance.spender)}`,
          ];
          console.error(lxJit, "blocked after buy USDC on-chain recheck", {
            routeSlug: slug,
            effectiveVenueSlug,
            detail,
          });
          throw new Error(userMessage(TRADE_LIMITLESS_USDC_ALLOWANCE));
        }
        console.info(lxJit, "buy USDC on-chain OK", { routeSlug: slug, effectiveVenueSlug });
      }
      console.info(lxJit, "phase", {
        step: "ensure_account_refetch",
        routeSlug: slug,
        effectiveVenueSlug,
        willRefetch: didSendTransactions,
      });
      let gatePayload: unknown =
        limitlessEnsureQuery.data ?? null;
      if (didSendTransactions) {
        const refetchResult = await limitlessEnsureQuery.refetch();
        gatePayload =
          (refetchResult != null && typeof refetchResult === "object"
            ? (refetchResult as { data?: unknown }).data
            : undefined) ??
          limitlessEnsureQuery.data ??
          null;
      }
      const gate = getLimitlessEnsureTradeGate(gatePayload);
      console.info(lxJit, "phase", {
        step: "trade_gate",
        routeSlug: slug,
        effectiveVenueSlug,
        ready: gate.ready,
        notReadyCode: gate.notReadyCode,
        blockedReason: gate.blockedReason,
      });
      if (!gate.ready) {
        const msg =
          gate.blockedReason?.trim() ||
          (gate.notReadyCode != null
            ? `Limitless not ready (${gate.notReadyCode})`
            : "Limitless not ready.");
        console.error(lxJit, "blocked at trade_gate", {
          routeSlug: slug,
          effectiveVenueSlug,
          msg,
        });
        {
          const gateMsg = formatLimitlessDelegatedOrderError(msg);
          throw new Error(
            gateMsg.length > 0
              ? gateMsg
              : userMessage(TRADE_LIMITLESS_NOT_READY),
          );
        }
      }
      console.info(lxJit, "complete", {
        routeSlug: slug,
        effectiveVenueSlug,
        side: ctx.side,
      });
    },
    [
      account,
      signerAddress,
      getLimitlessTxClientForAddress,
      fundEvmForPrivy,
      venueAddressChainMap,
      walletGate,
      polyAccount,
      collateralTokens,
      limitlessEnsureQuery,
      privateApi,
    ],
  );

  /**
   * Just-in-time DFlow/Proof KYC refresh. KYC remains the one SOR-level
   * blocker for DFlow, but we re-fetch on the click so a user who verified
   * mid-session isn't falsely rejected from a stale cache. If the refresh
   * confirms unverified, we launch the Proof redirect to route the user
   * into verification instead of silently rejecting them.
   */
  const ensureDflowProofVerifiedForTrade = useCallback(async (): Promise<boolean> => {
    const verified = await dflowProof.refetchIsVerified();
    if (!verified) {
      try {
        await handleStartDflowProofForTrade();
      } catch {
        /* best-effort: do not mask the original "unverified" error */
      }
    }
    return verified;
  }, [dflowProof, handleStartDflowProofForTrade]);

	return {
		ensurePredictApprovalsForTrade,
		ensureLevelUpApprovalsForTrade,
		ensurePolymarketApprovalsForTrade,
		ensureLimitlessApprovalsForTrade,
		ensureDflowProofVerifiedForTrade,
	};
}
