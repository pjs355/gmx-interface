import type { RelayClient, Transaction } from "@polymarket/builder-relayer-client";
import { createPublicClient, encodeFunctionData, erc20Abi, http, maxUint256 } from "viem";
import { base, bsc, polygon } from "viem/chains";
import type {
	LifiAllowanceHint,
	LifiQuoteStep,
	LifiTransactionRequest,
} from "@/types/trading";
import { BSC_RPC_URL, DEFAULT_RPC_URL, POLYGON_RPC_URL } from "@/config/rpc";
import { waitRelay } from "@/trading/polymarket/safeActions";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";

export type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type ExecuteLifiStepsOptions = {
	/**
	 * Owner address for ERC-20 allowance checks on **non-relay** chains (fallback when no per-chain entry).
	 */
	fromAddress?: string;
	/**
	 * ERC-20 `allowance(owner, …)` owner per chain (Base SCW, BNB embedded EOA, etc.).
	 */
	allowanceOwnerByChainId?: Partial<Record<number, string>>;
	/**
	 * When set, steps on Polygon (137) run as **Polymarket Safe** txs via RelayClient.
	 * Steps on other chains still use `getSignerForChain` (e.g. Coinbase SCW on Base).
	 */
	polygonRelay?: {
		client: RelayClient;
	};
};

function toHexData(data: string | undefined): `0x${string}` | undefined {
	if (!data) return undefined;
	if (data.startsWith("0x")) return data as `0x${string}`;
	return `0x${data}` as `0x${string}`;
}

function parseValue(val: string | undefined): bigint {
	if (!val) return 0n;
	try {
		return BigInt(val);
	} catch {
		return 0n;
	}
}

function publicClientForChain(chainId: number) {
	if (chainId === base.id) {
		return createPublicClient({ chain: base, transport: http(DEFAULT_RPC_URL) });
	}
	if (chainId === polygon.id) {
		return createPublicClient({ chain: polygon, transport: http(POLYGON_RPC_URL) });
	}
	if (chainId === bsc.id) {
		return createPublicClient({ chain: bsc, transport: http(BSC_RPC_URL) });
	}
	throw new Error(`LI.FI allowance checks unsupported for chain ${chainId}`);
}

function resolveAllowanceOwner(
	chainId: number,
	options: ExecuteLifiStepsOptions | undefined
): string | undefined {
	const mapped = options?.allowanceOwnerByChainId?.[chainId];
	if (mapped && ETH_ADDRESS_RE.test(mapped)) return mapped;
	const legacy = options?.fromAddress;
	if (legacy && ETH_ADDRESS_RE.test(legacy)) return legacy;
	return undefined;
}

function normalizeHint(
	step: LifiQuoteStep,
	tr: LifiTransactionRequest
): {
	token: string;
	spender: string;
	required: bigint;
	chainId: number;
} | null {
	const h = step.allowanceHint as LifiAllowanceHint | undefined;
	if (!h) return null;
	const token = h.tokenAddress ?? h.token;
	const spender = h.spenderAddress ?? h.spender;
	const raw = h.requiredAmountRaw ?? h.amount;
	const chainId = h.chainId ?? tr.chainId ?? step.chainId;
	if (!token || !spender || !ETH_ADDRESS_RE.test(token) || !ETH_ADDRESS_RE.test(spender)) {
		return null;
	}
	if (chainId == null) return null;
	const required = parseValue(raw);
	if (required <= 0n) return null;
	return { token, spender, required, chainId };
}

function sortSteps(steps: LifiQuoteStep[]): LifiQuoteStep[] {
	const indexed = steps.map((s, i) => ({
		s,
		idx: typeof s.stepIndex === "number" ? s.stepIndex : i,
	}));
	indexed.sort((a, b) => a.idx - b.idx);
	return indexed.map((x) => x.s);
}

function encodeApproveCalldata(spender: `0x${string}`): `0x${string}` {
	return encodeFunctionData({
		abi: erc20Abi,
		functionName: "approve",
		args: [spender, maxUint256],
	});
}

async function ensureAllowance(
	owner: string,
	hint: { token: string; spender: string; required: bigint; chainId: number },
	signer: SendTransactionCapable,
	stepLabel: string
): Promise<string | undefined> {
	const pc = publicClientForChain(hint.chainId);
	const allowance = await pc.readContract({
		address: hint.token as `0x${string}`,
		abi: erc20Abi,
		functionName: "allowance",
		args: [owner as `0x${string}`, hint.spender as `0x${string}`],
	});
	if (allowance >= hint.required) return undefined;

	const res = await signer.sendTransaction({
		to: hint.token as `0x${string}`,
		data: encodeApproveCalldata(hint.spender as `0x${string}`),
		chainId: hint.chainId,
		value: 0n,
	});
	const hash =
		typeof res === "string"
			? res
			: typeof res === "object" && res && "hash" in res
				? String((res as { hash?: string }).hash ?? "")
				: "";
	if (!hash) {
		throw new Error(`Approve tx for step ${stepLabel} did not return a hash`);
	}
	return hash;
}

function relayApproveTransaction(token: string, spender: string): Transaction {
	return {
		to: token,
		value: "0",
		data: encodeFunctionData({
			abi: erc20Abi,
			functionName: "approve",
			args: [spender as `0x${string}`, maxUint256],
		}),
	};
}

function relayTransactionFromTr(tr: LifiTransactionRequest): Transaction {
	let data = tr.data ?? "0x";
	if (!data.startsWith("0x")) data = `0x${data}`;
	const value =
		tr.value && tr.value !== "0x0" && tr.value !== "0" ? tr.value : "0";
	return {
		to: tr.to,
		data,
		value,
	};
}

/**
 * Execute LI.FI (or server-normalized) steps in order using the wallet client
 * returned for each step's chain. Optionally sends ERC-20 approvals per step hints.
 */
export async function executeLifiSteps(
	steps: LifiQuoteStep[] | undefined,
	getSignerForChain: (chainId: number) => Promise<SendTransactionCapable | null>,
	options?: ExecuteLifiStepsOptions
): Promise<{ txHashes: string[] }> {
	const txHashes: string[] = [];
	if (!steps?.length) return { txHashes };

	const ordered = sortSteps([...steps]);
	const relay = options?.polygonRelay?.client;

	for (let i = 0; i < ordered.length; i++) {
		const step = ordered[i];
		const tr: LifiTransactionRequest | undefined = step.transactionRequest;
		if (!tr) {
			throw new Error(
				`LI.FI step ${i} has no transactionRequest — aborting to avoid partial execution`
			);
		}
		if (!tr.to || !ETH_ADDRESS_RE.test(tr.to)) {
			throw new Error(
				`LI.FI step ${i} has invalid 'to' address: ${tr.to ?? "(missing)"}`
			);
		}
		const chainId = tr.chainId ?? step.chainId;
		if (chainId == null) {
			throw new Error(`LI.FI step ${i} missing chainId`);
		}

		if (relay && chainId === polygon.id) {
			const batch: Transaction[] = [];
			if (step.requiresApproval) {
				const hint = normalizeHint(step, tr);
				if (hint) {
					batch.push(relayApproveTransaction(hint.token, hint.spender));
				}
			}
			batch.push(relayTransactionFromTr(tr));
			const resp = await relay.execute(batch, `LI.FI Polygon step ${i}`);
			const txHash = await waitRelay(resp);
			if (txHash) txHashes.push(txHash);
			continue;
		}

		const signer = await getSignerForChain(chainId);
		if (!signer?.sendTransaction) {
			throw new Error(`No wallet client for chain ${chainId}`);
		}

		if (step.requiresApproval) {
			const hint = normalizeHint(step, tr);
			if (hint) {
				const owner = resolveAllowanceOwner(hint.chainId, options);
				if (!owner) {
					throw new Error(
						`LI.FI step ${i} requires token approval but no allowance owner is configured for chain ${hint.chainId}.`
					);
				}
				const approveHash = await ensureAllowance(owner, hint, signer, String(i));
				if (approveHash) txHashes.push(approveHash);
			}
		}

		const res = await signer.sendTransaction({
			to: tr.to as `0x${string}`,
			data: toHexData(tr.data),
			value: parseValue(tr.value),
			chainId,
		});
		const hash =
			typeof res === "string"
				? res
				: typeof res === "object" && res && "hash" in res
					? String((res as { hash?: string }).hash ?? "")
					: "";
		if (hash) txHashes.push(hash);
	}
	return { txHashes };
}
