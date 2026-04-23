/**
 * Derives ERC-20 allowance + Solana SPL delegate metadata from a raw LI.FI `/v1/quote`
 * route object, using the same walk + de-duplication rules as the predictions API
 * `flattenExecutableSteps` (so `data.steps` indices align with `data.quote`).
 */
import type {
	LifiAllowanceHint,
	LifiQuoteStep,
	LifiSolanaDelegateHint,
} from "@/types/trading";
import { CHAIN_LIFI_IDS } from "@/trading/sor/sor-types";

const LIFI_SOLANA_CHAIN_ID = CHAIN_LIFI_IDS.solana;

function asRecord(v: unknown): Record<string, unknown> | null {
	if (v && typeof v === "object" && !Array.isArray(v)) {
		return v as Record<string, unknown>;
	}
	return null;
}

function parseChainId(raw: unknown): number | null {
	if (typeof raw === "number" && Number.isInteger(raw)) {
		return raw;
	}
	if (typeof raw === "string") {
		const t = raw.trim();
		if (t.startsWith("0x") || t.startsWith("0X")) {
			const n = Number.parseInt(t, 16);
			return Number.isFinite(n) ? n : null;
		}
		const n = Number(t);
		return Number.isInteger(n) ? n : null;
	}
	return null;
}

function pickChainId(step: Record<string, unknown>): number | null {
	const tr = asRecord(step.transactionRequest);
	const trCid = tr ? parseChainId(tr.chainId) : null;
	if (trCid !== null) return trCid;
	const action = asRecord(step.action);
	if (action) {
		const a = parseChainId(action.fromChainId);
		if (a !== null) return a;
	}
	const est = asRecord(step.estimate);
	if (est) {
		const e = parseChainId(est.fromChainId);
		if (e !== null) return e;
	}
	return null;
}

/** Same shape as predictions `buildAllowanceHint` (EVM). */
function buildEvmAllowanceHint(step: Record<string, unknown>): LifiAllowanceHint | undefined {
	const est = asRecord(step.estimate);
	const action = asRecord(step.action);
	if (!est || !action) return undefined;
	const spender =
		typeof est.approvalAddress === "string" ? est.approvalAddress.trim() : "";
	if (!spender) return undefined;
	const fromTok = asRecord(action.fromToken);
	const tokenAddress =
		fromTok && typeof fromTok.address === "string" ? fromTok.address.trim() : "";
	const fromAmount =
		typeof action.fromAmount === "string" ? action.fromAmount.trim() : "";
	if (!tokenAddress || !fromAmount) return undefined;
	const chainId = pickChainId(step);
	return {
		tokenAddress,
		spenderAddress: spender,
		requiredAmountRaw: fromAmount,
		...(chainId != null ? { chainId } : {}),
	};
}

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function buildSolanaDelegateHint(
	step: Record<string, unknown>,
	chainId: number,
): LifiSolanaDelegateHint | undefined {
	const est = asRecord(step.estimate);
	const action = asRecord(step.action);
	if (!est || !action) return undefined;
	const delegate =
		typeof est.approvalAddress === "string" ? est.approvalAddress.trim() : "";
	if (!delegate || !SOLANA_BASE58_RE.test(delegate)) return undefined;
	const fromTok = asRecord(action.fromToken);
	const mint =
		fromTok && typeof fromTok.address === "string" ? fromTok.address.trim() : "";
	const fromAmount =
		typeof action.fromAmount === "string" ? action.fromAmount.trim() : "";
	if (!mint || !SOLANA_BASE58_RE.test(mint) || !fromAmount) return undefined;
	try {
		if (BigInt(fromAmount) <= 0n) return undefined;
	} catch {
		return undefined;
	}
	return { mint, delegate, amountRaw: fromAmount, chainId };
}

function isSolanaStyleTransactionRequest(
	rec: Record<string, unknown>,
	tr: Record<string, unknown>,
): boolean {
	const to = tr.to;
	if (typeof to === "string" && to.startsWith("0x")) return false;
	const action = asRecord(rec.action);
	const fc = action ? parseChainId(action.fromChainId) : null;
	if (fc === LIFI_SOLANA_CHAIN_ID) return true;
	return typeof to !== "string" || to.trim() === "";
}

function isSolanaExecutableStep(rec: Record<string, unknown>): boolean {
	const tr = asRecord(rec.transactionRequest);
	if (!tr || typeof tr.data !== "string" || tr.data.length === 0) return false;
	return isSolanaStyleTransactionRequest(rec, tr);
}

function walkCollectTransactionSteps(node: unknown, acc: Record<string, unknown>[]) {
	if (node == null) return;
	if (Array.isArray(node)) {
		for (const x of node) walkCollectTransactionSteps(x, acc);
		return;
	}
	const rec = asRecord(node);
	if (!rec) return;
	if (Array.isArray(rec.includedSteps)) {
		for (const x of rec.includedSteps) walkCollectTransactionSteps(x, acc);
	}
	if (Array.isArray(rec.steps)) {
		for (const x of rec.steps) walkCollectTransactionSteps(x, acc);
	}
	const tr = asRecord(rec.transactionRequest);
	if (tr && typeof tr.to === "string" && typeof tr.data === "string") {
		acc.push(rec);
		return;
	}
	if (tr && typeof tr.data === "string" && isSolanaStyleTransactionRequest(rec, tr)) {
		acc.push(rec);
	}
}

export type ExecutableStepAllowanceMeta = {
	chainId: number;
	kind: "evm" | "solana";
	evmAllowanceHint?: LifiAllowanceHint;
	solanaDelegate?: LifiSolanaDelegateHint;
};

/**
 * Returns one metadata entry per executable LI.FI step, in the same order as
 * `flattenExecutableSteps` on the server (after de-duplication).
 */
export function listExecutableStepAllowanceMetadata(
	quoteRoute: unknown,
): ExecutableStepAllowanceMeta[] {
	const root = asRecord(quoteRoute);
	if (!root) return [];

	const collected: Record<string, unknown>[] = [];
	if (Array.isArray(root.includedSteps)) {
		for (const s of root.includedSteps) {
			walkCollectTransactionSteps(s, collected);
		}
	}
	if (asRecord(root.transactionRequest)) {
		walkCollectTransactionSteps(root, collected);
	}

	const seen = new Set<string>();
	const unique: Record<string, unknown>[] = [];
	for (const s of collected) {
		const tr = asRecord(s.transactionRequest);
		const key = tr
			? isSolanaExecutableStep(s)
				? `sol:${String(tr.data).length}:${String(tr.data).slice(0, 48)}`
				: `${String(tr.to)}:${String(tr.data).length}:${String(tr.data)}`
			: JSON.stringify(s);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(s);
	}

	const out: ExecutableStepAllowanceMeta[] = [];
	for (const s of unique) {
		const trRaw = asRecord(s.transactionRequest);
		if (!trRaw) continue;

		if (isSolanaExecutableStep(s)) {
			let chainId = pickChainId(s);
			if (chainId === null) {
				const action = asRecord(s.action);
				if (action && typeof action.fromChainId === "number") {
					chainId = action.fromChainId;
				}
			}
			if (chainId === null) {
				chainId = LIFI_SOLANA_CHAIN_ID;
			}
			const solanaDelegate = buildSolanaDelegateHint(s, chainId);
			out.push({ chainId, kind: "solana", solanaDelegate });
			continue;
		}

		let chainId = pickChainId(s);
		if (chainId === null) {
			const action = asRecord(s.action);
			if (action && typeof action.fromChainId === "number") {
				chainId = action.fromChainId;
			}
		}
		if (chainId === null) {
			const cid = parseChainId(trRaw.chainId);
			if (cid !== null) chainId = cid;
		}
		if (chainId === null) {
			continue;
		}
		const evmAllowanceHint = buildEvmAllowanceHint(s);
		out.push({ chainId, kind: "evm", evmAllowanceHint });
	}
	return out;
}

function inferExecutableStepKind(step: LifiQuoteStep): "evm" | "solana" {
	if (step.kind === "solana") return "solana";
	const b64 =
		typeof step.transactionDataBase64 === "string"
			? step.transactionDataBase64.trim()
			: "";
	if (b64.length > 0) return "solana";
	const cid = step.transactionRequest?.chainId ?? step.chainId;
	if (cid === LIFI_SOLANA_CHAIN_ID) return "solana";
	return "evm";
}

function stepHasParsableEvmHint(step: LifiQuoteStep): boolean {
	const h = step.allowanceHint;
	if (!h) return false;
	const token = h.tokenAddress ?? h.token;
	const spender = h.spenderAddress ?? h.spender;
	const raw = h.requiredAmountRaw ?? h.amount;
	if (!token || !spender || !raw) return false;
	if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !/^0x[0-9a-fA-F]{40}$/.test(spender)) {
		return false;
	}
	try {
		return BigInt(raw) > 0n;
	} catch {
		return false;
	}
}

/**
 * Merges derived allowance / Solana delegate hints from `rawLifiRoute` into `steps`
 * when the server-flattened step omitted them.
 */
export function mergeLifiStepsWithRawAllowanceMetadata(
	steps: LifiQuoteStep[],
	rawLifiRoute: unknown,
): LifiQuoteStep[] {
	if (!rawLifiRoute || !steps.length) return steps;

	const meta = listExecutableStepAllowanceMetadata(rawLifiRoute);
	if (!meta.length) return steps;

	if (import.meta.env.DEV && meta.length !== steps.length) {
		console.warn("[LI.FI] allowance metadata length !== steps length", {
			metaLen: meta.length,
			stepsLen: steps.length,
		});
	}

	const n = Math.min(steps.length, meta.length);
	const merged = steps.map((step, i) => {
		if (i >= n) return step;
		const m = meta[i];
		if (!m) return step;

		const stepKind = inferExecutableStepKind(step);

		if (
			stepKind === "evm" &&
			m.kind === "evm" &&
			m.evmAllowanceHint &&
			!stepHasParsableEvmHint(step)
		) {
			return {
				...step,
				allowanceHint: {
					...m.evmAllowanceHint,
					...step.allowanceHint,
				},
			};
		}

		if (stepKind === "solana" && m.kind === "solana" && m.solanaDelegate) {
			return {
				...step,
				lifiSolanaDelegateHint: step.lifiSolanaDelegateHint ?? m.solanaDelegate,
			};
		}

		return step;
	});

	return merged;
}
