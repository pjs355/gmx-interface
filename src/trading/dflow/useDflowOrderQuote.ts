import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { SOLANA_USDC_MINT } from "@/config/addresses";

/**
 * DFlow trading params + outcome tokens are denominated in 6 decimals
 * (matching USDC base units). Mirrors `dflowPositionsApi.ts` math.
 */
const DFLOW_BASE_UNIT_DECIMALS = 6;
const DFLOW_BASE_UNIT_FACTOR = 10 ** DFLOW_BASE_UNIT_DECIMALS;

const DEFAULT_DEBOUNCE_MS = 250;
const QUOTE_STALE_MS = 5_000;
const QUOTE_GC_MS = 30_000;

export interface UseDflowOrderQuoteArgs {
	/**
	 * `yesMint`/`noMint` for the outcome the user is trading. The hook resolves
	 * the active outcome via `position`. Pass derivable PDAs straight from
	 * `MatchedMarketsDflowWire` — they exist before the on-chain accounts are
	 * tokenized so quotes work for uninitialized markets.
	 */
	yesMint: string | null | undefined;
	noMint: string | null | undefined;
	/** Active outcome leg. */
	position: "yes" | "no" | null | undefined;
	/** Active side. */
	side: "buy" | "sell" | null | undefined;
	/**
	 * `state.amount` from the trade box. For buys this is USD; for sells this is
	 * shares. We scale by 1e6 to match DFlow base units.
	 */
	amount: string;
	/** Master gate. */
	enabled: boolean;
	/** Debounce window before re-quoting; defaults to 250ms. */
	debounceMs?: number;
}

export interface DflowOrderQuoteResult {
	/** Outcome contracts received (buy) / sold (sell). */
	contracts: number;
	/** USDC spent (buy) / received (sell), in human dollars. */
	usd: number;
	/** Average fill price per contract in (0,1). */
	pricePerContract: number;
	/** Raw DFlow response code (e.g. "OK") for diagnostics. */
	code?: string;
}

/**
 * Debounced wrapper around `GET /api/dflow/order/quote`. Returns the actual
 * fill price DFlow will execute at — including any market-tokenization cost
 * for uninitialized markets — so the trade box can show an accurate preview
 * even when the WS orderbook is empty.
 *
 * Quotes are intentionally fetched with no `userPublicKey` (works for
 * unverified users; see DFlow KYC FAQ) and are not used to drive Submit —
 * `useSorRoute` / SOR execution remains authoritative for actually placing
 * the order.
 */
export function useDflowOrderQuote(args: UseDflowOrderQuoteArgs) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

	const debounceMs = args.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const [debouncedAmount, setDebouncedAmount] = useState(args.amount);
	useEffect(() => {
		const t = setTimeout(() => setDebouncedAmount(args.amount), debounceMs);
		return () => clearTimeout(t);
	}, [args.amount, debounceMs]);

	const outcomeMint = args.position === "yes" ? args.yesMint : args.noMint;
	const inputMint = args.side === "buy" ? SOLANA_USDC_MINT : (outcomeMint ?? "");
	const outputMint = args.side === "buy" ? (outcomeMint ?? "") : SOLANA_USDC_MINT;

	const numericAmount = Number.parseFloat(debouncedAmount);
	const amountIsValid =
		Number.isFinite(numericAmount) && numericAmount > 0;
	const amountBaseUnits = amountIsValid
		? Math.round(numericAmount * DFLOW_BASE_UNIT_FACTOR).toString()
		: "";

	const queryEnabled =
		args.enabled &&
		authenticated &&
		Boolean(outcomeMint) &&
		Boolean(args.side) &&
		Boolean(args.position) &&
		amountIsValid &&
		amountBaseUnits.length > 0;

	return useQuery<DflowOrderQuoteResult | null>({
		queryKey: [
			"dflow",
			"order-quote",
			args.side ?? "",
			args.position ?? "",
			outcomeMint ?? "",
			amountBaseUnits,
		],
		enabled: queryEnabled,
		staleTime: QUOTE_STALE_MS,
		gcTime: QUOTE_GC_MS,
		queryFn: async () => {
			if (!queryEnabled) return null;
			const resp = await api.getDflowOrderQuote({
				inputMint,
				outputMint,
				amount: amountBaseUnits,
			});

			const outAmountRaw =
				typeof resp.outAmount === "string"
					? Number(resp.outAmount)
					: typeof resp.outAmount === "number"
						? resp.outAmount
						: NaN;
			const inAmountRaw =
				typeof (resp as { inAmount?: unknown }).inAmount === "string"
					? Number((resp as { inAmount: string }).inAmount)
					: typeof (resp as { inAmount?: unknown }).inAmount === "number"
						? ((resp as { inAmount: number }).inAmount)
						: Number(amountBaseUnits);

			if (
				!Number.isFinite(outAmountRaw) ||
				outAmountRaw <= 0 ||
				!Number.isFinite(inAmountRaw) ||
				inAmountRaw <= 0
			) {
				return null;
			}

			// `amount` is the token the user spends. For buys that's USDC; for
			// sells that's the outcome contract. The other side comes back as
			// `outAmount`. Convert each base-unit value to its human form using
			// the shared 6-decimal scale.
			const inputHuman = inAmountRaw / DFLOW_BASE_UNIT_FACTOR;
			const outputHuman = outAmountRaw / DFLOW_BASE_UNIT_FACTOR;

			let contracts: number;
			let usd: number;
			if (args.side === "buy") {
				contracts = outputHuman;
				usd = inputHuman;
			} else {
				contracts = inputHuman;
				usd = outputHuman;
			}

			if (!(contracts > 0) || !(usd > 0)) return null;
			const pricePerContract = usd / contracts;
			if (!(pricePerContract > 0) || !(pricePerContract < 1)) return null;

			return {
				contracts,
				usd,
				pricePerContract,
				code: typeof resp.code === "string" ? resp.code : undefined,
			};
		},
	});
}
