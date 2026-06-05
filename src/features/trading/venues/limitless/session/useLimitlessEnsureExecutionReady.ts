import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSendTransaction } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { useVenueSetup } from "@/features/trading/hooks/useVenueSetup";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	getLimitlessEnsureTradeGate,
	isLimitlessProfileExistsNotLinkedApiError,
	limitlessEnsureNotReadyCodeToWhy,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "./limitlessEnsureTradeGate";
import { postLimitlessEnsureAccountWhenNeeded } from "./limitlessEnsureAccountRequest";
import {
	pickLimitlessMakerFromEnsureData,
	pickWarmupMarketSlugFromEnsureData,
} from "./limitlessEnsurePayload";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import { runLimitlessSignupWarmupBaseApprovals } from "./limitlessSignupWarmupBaseApprovals";
import { getLimitlessBaseTxClientForAddress } from "../trade/limitlessBaseTxClientForAddress";
import { readLimitlessBuyUsdcAllowancesSufficientOnBase } from "../approvals/limitlessTradingApprovalsOnBase";
import type { EnsureFailureState } from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	computeEnsureSetupInProgress,
	ENSURE_EXECUTION_MAX_FAILURES,
	getEnsureBackoffDelayMs,
	markEnsureSetupCompleted,
	recordEnsureSetupFailure,
} from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	isEnsureRunnerExhausted,
	useVenueEnsureExecutionRunner,
} from "@/features/trading/ensure-execution/useVenueEnsureExecutionRunner";

const LOG_TAG = "[LimitlessActivation]";

type SetupPhase = "idle" | "checking" | "approving" | "ready" | "error";

export type LimitlessEnsureExecutionReadyState = {
	setupInProgress: boolean;
	ready: boolean;
	error: string | null;
};

function isLikelyRateLimitErr(e: unknown): boolean {
	if (e == null) return false;
	const msg =
		e instanceof Error
			? `${e.message} ${String((e as Error & { cause?: unknown }).cause ?? "")}`
			: String(e);
	const m = msg.toLowerCase();
	return (
		m.includes("429") ||
		m.includes("too many requests") ||
		m.includes("rate limit") ||
		m.includes("privyapierror")
	);
}

function markEnsureSetupNonRetriable(
	failuresByKey: Map<string, EnsureFailureState>,
	runKey: string,
): void {
	failuresByKey.set(runKey, {
		attempts: ENSURE_EXECUTION_MAX_FAILURES,
		nextAllowedAt: 0,
	});
}

/**
 * Single source of truth for "Limitless is ready to trade". Mirrors Predict /
 * Polymarket ensure-execution: imperative `runSetup` + shared
 * {@link useVenueEnsureExecutionRunner} for backoff retries.
 *
 * Populates `tradingQueryKeys.limitlessEnsureAccount(profileId)` so the trade
 * box cache observer (`useTradeBoxLimitlessEnsure`) reads the same payload.
 */
export function useLimitlessEnsureExecutionReady(args: {
	enabled: boolean;
	buildEnsureAccountBody?: () => Promise<Record<string, unknown> | undefined>;
	runSignupTimeBaseApprovals?: boolean;
}): LimitlessEnsureExecutionReadyState {
	const { enabled, buildEnsureAccountBody, runSignupTimeBaseApprovals = false } = args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const { getClientForChain } = useSmartWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const venueAddressChainMap = useVenueAddressChainMap();
	const profileQuery = useCurrentProfile({ enabled: enabled && authenticated });
	const profileId = profileQuery.data?._id;
	const limitlessSetup = useVenueSetup("limitless");
	const overviewSorReady = limitlessSetup?.sorCanInclude === true;
	const skipEnsure = overviewSorReady && !runSignupTimeBaseApprovals;

	const [phase, setPhase] = useState<SetupPhase>("idle");
	const [error, setError] = useState<string | null>(null);

	const apiRef = useRef(api);
	apiRef.current = api;
	const profileIdRef = useRef(profileId);
	profileIdRef.current = profileId;
	const buildEnsureAccountBodyRef = useRef(buildEnsureAccountBody);
	buildEnsureAccountBodyRef.current = buildEnsureAccountBody;
	const runSignupTimeBaseApprovalsRef = useRef(runSignupTimeBaseApprovals);
	runSignupTimeBaseApprovalsRef.current = runSignupTimeBaseApprovals;
	const venueAddressChainMapRef = useRef(venueAddressChainMap);
	venueAddressChainMapRef.current = venueAddressChainMap;

	const inFlightRef = useRef(false);
	const completedKeyRef = useRef<string | null>(null);
	const failuresByKeyRef = useRef<Map<string, EnsureFailureState>>(new Map());

	const runKey = useMemo(() => {
		if (!profileId) return null;
		return `${String(profileId)}|warmup:${runSignupTimeBaseApprovals ? 1 : 0}`;
	}, [profileId, runSignupTimeBaseApprovals]);

	const runSignupWarmup = useCallback(
		async (ensureData: unknown, currentProfileId: string) => {
			const slug = pickWarmupMarketSlugFromEnsureData(ensureData);
			const maker = pickLimitlessMakerFromEnsureData(ensureData);
			if (!slug || !maker) {
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "warmup:skipNoSlug", { profileId: currentProfileId });
				}
				return;
			}

			const vacm = venueAddressChainMapRef.current;
			const limitlessWallet = vacm?.limitless.walletAddress?.trim();
			if (!limitlessWallet) {
				throw new Error("Limitless maker wallet missing from account venue map.");
			}

			const apiMaker = maker.trim().toLowerCase();
			const isDelegatedServerWalletSubAccount =
				apiMaker.length > 0 && apiMaker !== limitlessWallet.toLowerCase();
			if (isDelegatedServerWalletSubAccount) {
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "warmup:skipDelegatedMaker", { slug });
				}
				return;
			}

			const apiClient = apiRef.current;
			const initialAllowance = await apiClient.postLimitlessVerifyAllowance(slug);
			// Partner allowance is authoritative. If it already reports minimum allowance the
			// maker can trade, so skip warmup approvals entirely rather than trusting our own
			// on-chain read (which can disagree and trigger repeated sponsored approvals).
			const buyAlreadyOk =
				initialAllowance.hasMinimumAllowance ||
				(await readLimitlessBuyUsdcAllowancesSufficientOnBase({
					maker: limitlessWallet,
					verify: initialAllowance,
					chainRead: apiClient,
				}));
			if (buyAlreadyOk) {
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "warmup:skipBuyUsdcOnChainOk", {
						slug,
						partnerHasMinimumAllowance: initialAllowance.hasMinimumAllowance,
					});
				}
				return;
			}

			for (let attempt = 0; attempt < ENSURE_EXECUTION_MAX_FAILURES; attempt++) {
				try {
					await runLimitlessSignupWarmupBaseApprovals({
						marketSlug: slug,
						maker: limitlessWallet,
						venueMakerFromApi: maker,
						getTxClientForAddress: (addr) =>
							getLimitlessBaseTxClientForAddress({
								address: addr,
								getClientForChain,
								baseSmartWallet: vacm!.levelup.walletAddress,
								embeddedEoa: vacm!.predictfun.walletAddress,
								privyEvmSendTransaction,
							}),
						postLimitlessVerifyAllowance: (s, o) => apiClient.postLimitlessVerifyAllowance(s, o),
						chainRead: apiClient,
					});
					return;
				} catch (e) {
					if (isLikelyRateLimitErr(e)) {
						if (isTradingDebugLoggingEnabled()) {
							console.info(LOG_TAG, "warmup:rateLimitedDefer", {
								slug,
								msg: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
							});
						}
						return;
					}
					if (attempt >= ENSURE_EXECUTION_MAX_FAILURES - 1) throw e;
					await new Promise((r) => setTimeout(r, getEnsureBackoffDelayMs(attempt + 1)));
				}
			}
		},
		[getClientForChain, privyEvmSendTransaction],
	);

	const runSetup = useCallback(async () => {
		if (!runKey || inFlightRef.current) return;
		inFlightRef.current = true;
		setError(null);
		const startedAt = performance.now();
		try {
			const apiClient = apiRef.current;
			const currentProfileId = profileIdRef.current;
			if (!currentProfileId) {
				setPhase("idle");
				return;
			}

			setPhase("checking");
			const ensureQueryKey = tradingQueryKeys.limitlessEnsureAccount(currentProfileId);

			if (isTradingDebugLoggingEnabled()) {
				console.info(LOG_TAG, "ensure:start", {
					at: new Date().toISOString(),
					profileId: currentProfileId,
				});
			}

			const data = await postLimitlessEnsureAccountWhenNeeded(
				qc,
				ensureQueryKey,
				qc.getQueryData(ensureQueryKey),
				async () => {
					const build = buildEnsureAccountBodyRef.current;
					return build ? await build() : undefined;
				},
				(body) => apiClient.postLimitlessEnsureAccount(body),
			);
			qc.setQueryData(ensureQueryKey, data);

			const gate = getLimitlessEnsureTradeGate(data ?? null);
			if (isTradingDebugLoggingEnabled()) {
				console.info(LOG_TAG, "ensure:done", {
					elapsedMs: Math.round(performance.now() - startedAt),
					ready: gate.ready,
					notReady: limitlessEnsureNotReadyCodeToWhy(gate.notReadyCode),
				});
			}

			if (!gate.ready) {
				throw new Error(
					limitlessEnsureNotReadyCodeToWhy(gate.notReadyCode) ??
						"Limitless setup is still provisioning.",
				);
			}

			if (limitlessEnsureWarrantsAccountOverviewRefresh(data)) {
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(currentProfileId),
				});
			}

			if (runSignupTimeBaseApprovalsRef.current) {
				setPhase("approving");
				await runSignupWarmup(data, currentProfileId);
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(currentProfileId),
				});
			}

			markEnsureSetupCompleted(completedKeyRef, failuresByKeyRef.current, runKey);
			setPhase("ready");
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isLimitlessProfileExistsNotLinkedApiError(e)) {
				markEnsureSetupNonRetriable(failuresByKeyRef.current, runKey);
			} else {
				recordEnsureSetupFailure(failuresByKeyRef.current, runKey);
			}
			console.warn(LOG_TAG, "ensure:failed", {
				elapsedMs: Math.round(performance.now() - startedAt),
				error: msg,
			});
			setError(msg.slice(0, 500));
			setPhase("error");
		} finally {
			inFlightRef.current = false;
		}
	}, [qc, runKey, runSignupWarmup]);

	const prerequisitesReady = Boolean(
		profileId &&
		(!runSignupTimeBaseApprovals || Boolean(venueAddressChainMap?.limitless.walletAddress?.trim())),
	);

	useVenueEnsureExecutionRunner({
		enabled: enabled && !skipEnsure,
		authenticated,
		runKey,
		prerequisitesReady,
		runSetup,
		refs: { inFlightRef, completedKeyRef, failuresByKeyRef },
		onDisabled: () => {
			setPhase("idle");
		},
	});

	const ready = skipEnsure || phase === "ready";
	const exhausted = isEnsureRunnerExhausted(failuresByKeyRef, runKey);
	const setupInProgress = skipEnsure
		? false
		: computeEnsureSetupInProgress({
				enabled,
				authenticated,
				ready,
				phase,
				exhausted,
			});

	return { setupInProgress, ready, error: skipEnsure ? null : error };
}
