import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useWallets } from "@privy-io/react-auth";
import { useSendTransaction as useSolanaSendTransaction } from "@privy-io/react-auth/solana";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { getAddress, isAddress } from "viem";
import { bsc } from "viem/chains";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { isPrivyEmbeddedWallet } from "@/trading/polymarket/privyEmbeddedWallet";
import { useUserData } from "@/context/UserDataContext";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { pollLifiUntilTerminal } from "@/trading/lifi/pollLifiStatus";
import {
	BRIDGE_FUNDING_BALANCES_QUERY_KEY,
	useBridgeFundingBalances,
} from "@/trading/hooks/useBridgeFundingBalances";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useLifiQuoteMutation } from "@/trading/hooks/useLifiBridge";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { checkPolymarketApprovals } from "@/trading/polymarket/approvalTxs";
import {
	deployPolymarketSafeIfNeeded,
	executePolymarketApprovalBatch,
} from "@/trading/polymarket/safeActions";
import { PRIVY_SPONSOR_BSC_GAS } from "@/config/privyBscGas";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/polymarket/embeddedPrivyViemSend";
import { getBridgeQuoteFingerprint } from "@/trading/lifi/quoteDisplay";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { SOLANA_RPC_URL } from "@/config/rpc";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import type { LifiQuoteResponse } from "@/types/trading";

const BASE = 8453;
const POLYGON = 137;
const BNB = bsc.id;
const SOLANA_LIFI_CHAIN_ID = 1151111081099710;

/** UI endpoint ↔ on-chain funding account (matches Transfers dropdowns). */
export type BridgeEndpoint = "levelup" | "polymarket" | "bnb" | "solana";

const BRIDGE_ENDPOINT_ORDER: BridgeEndpoint[] = ["levelup", "polymarket", "bnb", "solana"];

/** When From and To would match, switch the other field to a different endpoint (all three chains supported). */
function distinctBridgeEndpoint(exclude: BridgeEndpoint): BridgeEndpoint {
	return BRIDGE_ENDPOINT_ORDER.find((x) => x !== exclude) ?? "levelup";
}

/** @deprecated Use BridgeEndpoint + from/to; kept for any external imports */
export type Direction = "to_polymarket" | "to_base";

export type BridgePhase = "idle" | "quoting" | "executing" | "polling" | "done" | "error";

/** After amount/route change, wait this long then fetch (avoids a request per keystroke). */
const QUOTE_INPUT_DEBOUNCE_MS = 600;
/** While amount & route stay the same, refresh the quote on this interval. */
const QUOTE_IDLE_REFRESH_MS = 30_000;

/**
 * `tool` query param for GET /funding/lifi/status only.
 * Uses `statusBridge` from the quote when the server provides it.
 * Never use top-level `quote.tool` (e.g. eco / lifi) — LI.FI returns 400 / 1011 "Not an EVM Transaction".
 * When this returns undefined, the client omits `tool` (txHash + chains only).
 */
function pickLifiStatusTool(quote: LifiQuoteResponse): string | undefined {
	const sb = quote.statusBridge;
	if (typeof sb === "string") {
		const t = sb.trim();
		if (t) return t;
	}
	return undefined;
}

/**
 * LI.FI status expects the hash of the route / bridge tx on the source chain, not a prior USDC approve.
 */
function pickTxHashForLifiStatusPoll(
	txHashes: string[],
	quote: LifiQuoteResponse,
	fromChain: number
): string {
	const hashes = txHashes.filter((h) => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h));
	if (hashes.length === 0) {
		return txHashes[0] ?? "";
	}
	if (hashes.length === 1) return hashes[0];

	const steps = quote.steps ?? [];
	const first = steps[0];
	const firstTr = first?.transactionRequest;
	const firstChain = firstTr?.chainId ?? first?.chainId;
	if (first?.requiresApproval && firstChain === fromChain) {
		return hashes[1] ?? hashes[hashes.length - 1];
	}
	return hashes[hashes.length - 1];
}

function chainForEndpoint(e: BridgeEndpoint): number {
	switch (e) {
		case "levelup":
			return BASE;
		case "polymarket":
			return POLYGON;
		case "bnb":
			return BNB;
		case "solana":
			return SOLANA_LIFI_CHAIN_ID;
	}
}

function addressForEndpoint(
	e: BridgeEndpoint,
	funding: {
		baseSmartWallet?: string;
		polymarketSafe?: string;
		embeddedEoa?: string;
		solanaAddress?: string;
	}
): string | undefined {
	switch (e) {
		case "levelup":
			return funding.baseSmartWallet;
		case "polymarket":
			return funding.polymarketSafe;
		case "bnb":
			return funding.embeddedEoa;
		case "solana":
			return funding.solanaAddress;
	}
}

export function routeHasRequiredAddresses(
	from: BridgeEndpoint,
	to: BridgeEndpoint,
	funding: {
		baseSmartWallet?: string;
		polymarketSafe?: string;
		embeddedEoa?: string;
		solanaAddress?: string;
	}
): boolean {
	if (from === to) return false;
	const ends = new Set<BridgeEndpoint>([from, to]);
	if (ends.has("levelup") && !funding.baseSmartWallet) return false;
	if (ends.has("polymarket") && !funding.polymarketSafe) return false;
	if (ends.has("bnb") && !funding.embeddedEoa) return false;
	if (ends.has("solana") && !funding.solanaAddress) return false;
	return true;
}

export function useBridgeFlow() {
	const queryClient = useQueryClient();
	const funding = useFundingAddresses();
	const fundingBalances = useBridgeFundingBalances({
		baseSmartWallet: funding.baseSmartWallet,
		polymarketSafe: funding.polymarketSafe,
		embeddedEoa: funding.embeddedEoa,
		solanaAddress: funding.solanaAddress,
		enabled: !funding.isLoading,
	});
	const { refresh: refreshUserData } = useUserData();
	const api = usePrivateApiClient();
	const quoteMutation = useLifiQuoteMutation();
	const { getClientForChain } = useSmartWallets();
	const { wallets } = useWallets();
	const relay = usePolymarketRelay();
	const { sendTransaction: privySolanaSendTx } = useSolanaSendTransaction();

	const solanaSigner = useMemo<SolanaSignerCapable>(
		() => ({
			signAndSendTransaction: async (serializedTx: Uint8Array) => {
				const tx = VersionedTransaction.deserialize(serializedTx);
				const conn = new Connection(SOLANA_RPC_URL);
				return sendPrivySponsoredSolanaTransaction(privySolanaSendTx, tx, conn);
			},
		}),
		[privySolanaSendTx]
	);

	const [fromEndpoint, setFromEndpoint] = useState<BridgeEndpoint>("levelup");
	const [toEndpoint, setToEndpoint] = useState<BridgeEndpoint>("polymarket");
	const [amount, setAmountState] = useState("");

	const setAmount = useCallback((v: string) => {
		setAmountState(v);
		setPhase((p) => (p === "done" ? "idle" : p));
	}, []);
	const [quote, setQuote] = useState<LifiQuoteResponse | null>(null);
	const [quoteInputContext, setQuoteInputContext] = useState<{
		parsedAmount: number;
		fromEndpoint: BridgeEndpoint;
		toEndpoint: BridgeEndpoint;
	} | null>(null);
	const [phase, setPhase] = useState<BridgePhase>("idle");
	const [statusNote, setStatusNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const abortRef = useRef<AbortController | null>(null);
	const quoteGenRef = useRef(0);
	const quoteFingerprintRef = useRef<string>("");
	const phaseRef = useRef<BridgePhase>("idle");
	phaseRef.current = phase;

	const embeddedRef = useRef<
		| {
				getEthereumProvider?: () => Promise<unknown>;
		  }
		| null
	>(null);
	embeddedRef.current =
		(wallets || []).find((w) => isPrivyEmbeddedWallet(w as never)) ?? null;

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	const routeOk = routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding);

	const fromChain = chainForEndpoint(fromEndpoint);
	const toChain = chainForEndpoint(toEndpoint);

	const parsedAmount = parseFloat(amount);
	const isAmountValid =
		Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= 100_000;

	const canQuote =
		!funding.isLoading && Boolean(funding.profileId) && routeOk && isAmountValid;

	const quoteAppliesToCurrentInput = Boolean(
		quote?.steps?.length &&
			quoteInputContext &&
			quoteInputContext.fromEndpoint === fromEndpoint &&
			quoteInputContext.toEndpoint === toEndpoint &&
			quoteInputContext.parsedAmount === parsedAmount
	);

	const sourceBalanceHuman = useMemo(() => {
		switch (fromEndpoint) {
			case "levelup":
				return fundingBalances.data?.baseUsdcHuman ?? null;
			case "polymarket":
				return fundingBalances.data?.polygonUsdcEHuman ?? null;
			case "bnb":
				return fundingBalances.data?.bscUsdtHuman ?? null;
			case "solana":
				return fundingBalances.data?.solanaUsdcHuman ?? null;
			default:
				return null;
		}
	}, [fromEndpoint, fundingBalances.data]);

	const sourceBalanceNum =
		sourceBalanceHuman == null || sourceBalanceHuman === ""
			? Number.NaN
			: parseFloat(sourceBalanceHuman);

	const hasSufficientSourceBalance =
		!isAmountValid ||
		(Number.isFinite(sourceBalanceNum) && sourceBalanceNum + 1e-9 >= parsedAmount);

	const needsPolymarketRelay = fromChain === POLYGON;

	const applyDepositSlippage = fromChain === BASE && toChain === POLYGON;

	const allowanceOwnerByChainId = useMemo(() => {
		const m: Partial<Record<number, string>> = {};
		if (funding.baseSmartWallet) m[BASE] = funding.baseSmartWallet;
		if (funding.polymarketSafe) m[POLYGON] = funding.polymarketSafe;
		if (funding.embeddedEoa) m[BNB] = funding.embeddedEoa;
		return m;
	}, [funding.baseSmartWallet, funding.polymarketSafe, funding.embeddedEoa]);

	const getSignerForChain = useCallback(
		async (chainId: number) => {
			if (chainId === BNB) {
				const embedded = embeddedRef.current;
				const addr = funding.embeddedEoa as `0x${string}` | undefined;
				if (
					!embedded ||
					typeof embedded.getEthereumProvider !== "function" ||
					!addr ||
					!/^0x[a-fA-F0-9]{40}$/.test(addr)
				) {
					return null;
				}
				const provider = await embedded.getEthereumProvider();
				return createPrivyEmbeddedSendTransactionCapable(provider, addr, bsc, {
					sponsorGas: PRIVY_SPONSOR_BSC_GAS,
				});
			}
			const client = await getClientForChain({ id: chainId });
			if (!client) return null;
			return {
				sendTransaction: (args: {
					to: `0x${string}`;
					data?: `0x${string}`;
					value?: bigint;
					chainId?: number;
					sponsor?: boolean;
				}) => client.sendTransaction(args),
			};
		},
		[getClientForChain, funding.embeddedEoa]
	);

	const setFromEndpointValidated = useCallback((e: BridgeEndpoint) => {
		setFromEndpoint(e);
		setToEndpoint((prev) => (prev === e ? distinctBridgeEndpoint(e) : prev));
		setQuote(null);
		setQuoteInputContext(null);
		quoteFingerprintRef.current = "";
		setPhase("idle");
		setError(null);
	}, []);

	const setToEndpointValidated = useCallback((e: BridgeEndpoint) => {
		setToEndpoint(e);
		setFromEndpoint((prev) => (prev === e ? distinctBridgeEndpoint(e) : prev));
		setQuote(null);
		setQuoteInputContext(null);
		quoteFingerprintRef.current = "";
		setPhase("idle");
		setError(null);
	}, []);

	/** @deprecated Prefer setFromEndpoint / setToEndpoint */
	const changeDirection = useCallback((d: Direction) => {
		setQuote(null);
		setQuoteInputContext(null);
		quoteFingerprintRef.current = "";
		setPhase("idle");
		setError(null);
		if (d === "to_polymarket") {
			setFromEndpoint("levelup");
			setToEndpoint("polymarket");
		} else {
			setFromEndpoint("polymarket");
			setToEndpoint("levelup");
		}
	}, []);

	const routeIncludesSolana =
		fromEndpoint === "solana" || toEndpoint === "solana";

	const executeQuoteFetch = useCallback(
		async (options?: { silent?: boolean }) => {
			if (!routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding)) return;
			const rawFrom = addressForEndpoint(fromEndpoint, funding);
			const rawTo = addressForEndpoint(toEndpoint, funding);
			if (!rawFrom || !rawTo) return;

			let fromAddr: string;
			let toAddr: string;

			if (routeIncludesSolana) {
				fromAddr = rawFrom;
				toAddr = rawTo;
			} else {
				if (!isAddress(rawFrom) || !isAddress(rawTo)) {
					if (!options?.silent) {
						setError("Invalid wallet address for this route. Refresh and try again.");
						setPhase("error");
					}
					return;
				}
				try {
					fromAddr = getAddress(rawFrom);
					toAddr = getAddress(rawTo);
				} catch {
					if (!options?.silent) {
						setError("Invalid wallet address for this route.");
						setPhase("error");
					}
					return;
				}
			}

			const gen = ++quoteGenRef.current;
			if (!options?.silent) {
				setError(null);
				setPhase("quoting");
			}
			try {
				const q = await quoteMutation.mutateAsync({
					fromChain,
					toChain,
					amountHuman: String(parsedAmount),
					fromAddress: fromAddr,
					toAddress: toAddr,
					...(applyDepositSlippage ? { slippage: 0.005 } : {}),
				});
				if (quoteGenRef.current === gen) {
					const fp = getBridgeQuoteFingerprint(q);
					if (options?.silent && fp === quoteFingerprintRef.current) {
						return;
					}
					quoteFingerprintRef.current = fp;
					setQuote(q);
					setQuoteInputContext({
						parsedAmount,
						fromEndpoint,
						toEndpoint,
					});
					if (!options?.silent) setPhase("idle");
				}
			} catch (e) {
				if (quoteGenRef.current === gen) {
					if (options?.silent) {
						return;
					}
					setError(getPrivateApiErrorMessage(e));
					setPhase("error");
				}
			}
		},
		[
			fromEndpoint,
			toEndpoint,
			fromChain,
			toChain,
			parsedAmount,
			funding.baseSmartWallet,
			funding.polymarketSafe,
			funding.embeddedEoa,
			funding.solanaAddress,
			applyDepositSlippage,
			routeIncludesSolana,
			quoteMutation.mutateAsync,
		]
	);

	useEffect(() => {
		const p = phaseRef.current;
		if (
			p === "executing" ||
			p === "polling" ||
			p === "done" ||
			!canQuote ||
			!routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding)
		) {
			if (!canQuote || !routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding)) {
				if (!routeOk || !isAmountValid) {
					setQuote(null);
					setQuoteInputContext(null);
					quoteFingerprintRef.current = "";
				}
				setPhase((prev) => (prev === "quoting" || prev === "error" ? "idle" : prev));
			}
			return;
		}

		const timer = window.setTimeout(() => {
			const latest = phaseRef.current;
			if (
				latest === "executing" ||
				latest === "polling" ||
				latest === "done"
			) {
				return;
			}
			void executeQuoteFetch();
		}, QUOTE_INPUT_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [
		amount,
		canQuote,
		fromEndpoint,
		toEndpoint,
		parsedAmount,
		funding.baseSmartWallet,
		funding.polymarketSafe,
		funding.embeddedEoa,
		funding.solanaAddress,
		executeQuoteFetch,
		routeOk,
		isAmountValid,
	]);

	useEffect(() => {
		if (!canQuote || !routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding)) {
			return;
		}

		const id = window.setInterval(() => {
			const p = phaseRef.current;
			if (
				p === "executing" ||
				p === "polling" ||
				p === "done" ||
				p === "quoting"
			) {
				return;
			}
			void executeQuoteFetch({ silent: true });
		}, QUOTE_IDLE_REFRESH_MS);

		return () => clearInterval(id);
	}, [
		amount,
		canQuote,
		fromEndpoint,
		toEndpoint,
		parsedAmount,
		funding.baseSmartWallet,
		funding.polymarketSafe,
		funding.embeddedEoa,
		funding.solanaAddress,
		executeQuoteFetch,
	]);

	const handleConfirm = useCallback(async () => {
		if (
			!quote?.steps?.length ||
			!quoteInputContext ||
			quoteInputContext.fromEndpoint !== fromEndpoint ||
			quoteInputContext.toEndpoint !== toEndpoint ||
			quoteInputContext.parsedAmount !== parsedAmount
		) {
			return;
		}
		if (!routeHasRequiredAddresses(fromEndpoint, toEndpoint, funding)) return;

		if (needsPolymarketRelay && !relay.walletReady) {
			setError(
				"Transfers from Polymarket need your embedded wallet. Wait for it to finish loading or reconnect."
			);
			setPhase("error");
			return;
		}

		const srcHumanNow = sourceBalanceHuman;
		const balNow =
			srcHumanNow == null || srcHumanNow === "" ? Number.NaN : parseFloat(srcHumanNow);
		if (
			Number.isFinite(parsedAmount) &&
			parsedAmount > 0 &&
			(!Number.isFinite(balNow) || balNow + 1e-9 < parsedAmount)
		) {
			setError("Insufficient balance in the source wallet for this amount.");
			setPhase("error");
			return;
		}
		setError(null);
		setPhase("executing");

		abortRef.current?.abort();
		const ac = new AbortController();
		abortRef.current = ac;

		try {
			let polygonRelay: { client: RelayClient } | undefined;

			if (needsPolymarketRelay && funding.polymarketSafe) {
				setStatusNote("Preparing Polymarket wallet…");
				const client = await relay.getRelayClient();
				if (!client) {
					throw new Error(
						"Polymarket relay requires your embedded Privy wallet. Ensure you\u2019re logged in with an embedded wallet."
					);
				}
				const eoa = relay.eoaAddress;
				if (!eoa) {
					throw new Error("Embedded wallet address unavailable \u2014 cannot use Polymarket relay.");
				}
				await deployPolymarketSafeIfNeeded(client, eoa);

				setStatusNote("Checking Polymarket approvals…");
				const approvalState = await checkPolymarketApprovals(funding.polymarketSafe);
				if (!approvalState.allApproved) {
					setStatusNote("Signing Polymarket approvals…");
					await executePolymarketApprovalBatch(client, funding.polymarketSafe);
				}

				polygonRelay = { client };
			}

			setStatusNote("Signing transfer transactions…");
			const { txHashes } = await executeLifiSteps(quote.steps, getSignerForChain, {
				allowanceOwnerByChainId,
				...(polygonRelay ? { polygonRelay } : {}),
				...(routeIncludesSolana ? { solanaSigner } : {}),
			});
			const statusTxHash = pickTxHashForLifiStatusPoll(txHashes, quote, fromChain);
			if (!statusTxHash) throw new Error("No transaction hash returned from wallet");

			const statusTool = pickLifiStatusTool(quote);
			setPhase("polling");
			setStatusNote("Waiting for transfer to complete…");
			await pollLifiUntilTerminal(
				() =>
					api.getFundingLifiStatus({
						txHash: statusTxHash,
						...(statusTool != null ? { tool: statusTool } : {}),
						fromChain,
						toChain,
					}),
				{ intervalMs: 15_000, maxAttempts: 40, signal: ac.signal }
			);

			setError(null);
			setStatusNote(null);
			try {
				await funding.verifyOnChain.mutateAsync({});
			} catch {
				/* ignore */
			}
			await refreshUserData();
			await Promise.all([funding.refetchPolymarket(), funding.refetchOverview()]);
			await queryClient.invalidateQueries({ queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY] });
			setPhase("done");
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") return;
			setError(getPrivateApiErrorMessage(e));
			setPhase("error");
			setStatusNote(null);
		}
	}, [
		quote,
		quoteInputContext,
		parsedAmount,
		funding.polymarketSafe,
		funding.verifyOnChain,
		funding.refetchPolymarket,
		funding.refetchOverview,
		fromEndpoint,
		toEndpoint,
		fromChain,
		toChain,
		needsPolymarketRelay,
		routeIncludesSolana,
		relay,
		getSignerForChain,
		solanaSigner,
		allowanceOwnerByChainId,
		api,
		refreshUserData,
		queryClient,
		sourceBalanceHuman,
	]);

	const safeOk =
		funding.integrationMode === "builder_privy_safe" || funding.integrationMode == null;

	const isConfirming = phase === "executing" || phase === "polling";

	return {
		funding,
		fundingBalances,
		relay,
		fromEndpoint,
		toEndpoint,
		setFromEndpoint: setFromEndpointValidated,
		setToEndpoint: setToEndpointValidated,
		amount,
		setAmount,
		quote,
		quoteAppliesToCurrentInput,
		hasSufficientSourceBalance,
		phase,
		statusNote,
		error,
		canQuote,
		safeOk,
		needsPolymarketRelay,
		isQuoting: phase === "quoting",
		isConfirming,
		changeDirection,
		handleConfirm,
	};
}
