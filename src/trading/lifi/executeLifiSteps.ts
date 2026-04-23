import type { RelayClient, Transaction } from "@polymarket/builder-relayer-client";
import {
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	formatUnits,
	http,
	maxUint256,
} from "viem";
import { base, bsc, polygon } from "viem/chains";
import type {
	LifiAllowanceHint,
	LifiQuoteStep,
	LifiTransactionRequest,
} from "@/types/trading";
import {
	BSC_RPC_URL,
	DEFAULT_RPC_URL,
	POLYGON_RPC_URL,
	createSolanaConnectionForWalletSend,
} from "@/config/rpc";
import { waitRelay } from "@/trading/polymarket/safeActions";
import type { SendTransactionCapable, SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import {
	handleTransferFromFailedIfPresent,
	parseLifiAllowanceSnapshot,
} from "@/trading/lifi/lifiTransferFromFailed";
import { mergeLifiStepsWithRawAllowanceMetadata } from "@/trading/lifi/lifiExecutableStepMetadata";
import { ensureSolanaSplDelegateAllowanceIfNeeded } from "@/trading/lifi/ensureSolanaLifiSplDelegate";
import { CHAIN_LIFI_IDS } from "@/trading/sor/sor-types";

export type { SendTransactionCapable, SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const SOLANA_LIFI_CHAIN_ID = CHAIN_LIFI_IDS.solana;

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
	/**
	 * When set, steps on Solana (1151111081099710) are signed and sent via this signer.
	 * The step's `transactionRequest.data` should be a base64-encoded Solana transaction.
	 */
	solanaSigner?: SolanaSignerCapable;
	/**
	 * Raw LI.FI `/v1/quote` route (`data.quote` from POST /funding/lifi/quote). Used to back-fill
	 * missing `allowanceHint` / Solana delegate metadata so approvals always run when LI.FI needs them.
	 */
	rawLifiRoute?: unknown;
	/** Solana wallet (base58) that owns SPL USDC for delegate + bridge txs. */
	solanaTokenOwnerAddress?: string;
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

/**
 * Before the LI.FI swap tx, verify the funding wallet actually holds enough of the
 * source ERC-20. `TransferFromFailed` (0x7939f424) is almost always insufficient balance
 * or allowance; Privy reports failed AA simulation as HTTP 400, which looks like a
 * sponsorship bug but is not.
 */
async function assertErc20BalanceCoversRequirement(p: {
	chainId: number;
	owner: `0x${string}`;
	token: `0x${string}`;
	required: bigint;
}): Promise<void> {
	let pc: ReturnType<typeof publicClientForChain>;
	try {
		pc = publicClientForChain(p.chainId);
	} catch {
		return;
	}
	const balance = await pc.readContract({
		address: p.token,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [p.owner],
	});
	if (balance >= p.required) return;
	let decimals = 18;
	try {
		decimals = await pc.readContract({
			address: p.token,
			abi: erc20Abi,
			functionName: "decimals",
		});
	} catch {
		/* non-standard token — keep default for message formatting */
	}
	const need = formatUnits(p.required, decimals);
	const have = formatUnits(balance, decimals);
	const label =
		p.chainId === bsc.id ? "BNB Chain" : p.chainId === base.id ? "Base" : `chain ${p.chainId}`;
	throw new Error(
		`Insufficient ERC-20 on ${label}: this wallet has ${have} but the bridge needs about ${need} of that token. Add funds on ${label} to the same address LI.FI quotes from (Privy \`sponsor: true\` only pays gas — it does not supply USDT/USDC).`,
	);
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

function lifiTransferFromLogContext(
	stepIndex: number,
	chainId: number,
	tr: LifiTransactionRequest,
	step: LifiQuoteStep,
	options: ExecuteLifiStepsOptions | undefined
) {
	const fromTx = tr.from;
	const fromAddress =
		fromTx && ETH_ADDRESS_RE.test(fromTx)
			? fromTx
			: resolveAllowanceOwner(chainId, options) ?? options?.fromAddress;
	return {
		stepIndex,
		chainId,
		fromAddress,
		snapshot: parseLifiAllowanceSnapshot(step, tr),
	};
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
	// LiFi's next tx often simulates in the same block; without waiting, `transferFrom`
	// can still see the old allowance and revert with TransferFromFailed().
	const receipt = await pc.waitForTransactionReceipt({
		hash: hash as `0x${string}`,
		confirmations: 1,
	});
	if (receipt.status !== "success") {
		throw new Error(
			`ERC-20 approve reverted on chain ${hint.chainId} (step ${stepLabel})`,
		);
	}
	const allowanceAfter = await pc.readContract({
		address: hint.token as `0x${string}`,
		abi: erc20Abi,
		functionName: "allowance",
		args: [owner as `0x${string}`, hint.spender as `0x${string}`],
	});
	if (allowanceAfter < hint.required) {
		throw new Error(
			`Allowance for ${hint.token.slice(0, 10)}… on chain ${hint.chainId} is still below required after approve (owner ${owner.slice(0, 10)}…). Confirm the embedded wallet is on BNB and retry.`,
		);
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

	const sorted = sortSteps([...steps]);
	let ordered: LifiQuoteStep[];
	try {
		ordered = mergeLifiStepsWithRawAllowanceMetadata(sorted, options?.rawLifiRoute);
	} catch (e) {
		console.error("[LI.FI] merge allowance metadata failed", e);
		ordered = sorted;
	}
	const relay = options?.polygonRelay?.client;

	const solanaConn =
		options?.solanaSigner && options?.solanaTokenOwnerAddress?.trim()
			? createSolanaConnectionForWalletSend()
			: null;

	async function maybePreflightSolanaDelegate(step: LifiQuoteStep): Promise<void> {
		const hint = step.lifiSolanaDelegateHint;
		const owner = options?.solanaTokenOwnerAddress?.trim();
		const sol = options?.solanaSigner;
		if (!hint || !owner || !sol || !solanaConn) return;
		const sig = await ensureSolanaSplDelegateAllowanceIfNeeded({
			connection: solanaConn,
			ownerBase58: owner,
			hint,
			solanaSigner: sol,
		});
		if (sig) txHashes.push(sig);
	}

	for (let i = 0; i < ordered.length; i++) {
		const step = ordered[i];

		// Predictions `POST /funding/lifi/quote` returns Solana legs from `flattenExecutableSteps`
		// as `{ kind: "solana", transactionDataBase64 }` (no per-step `transactionRequest`).
		const solanaB64 =
			step.kind === "solana" && typeof step.transactionDataBase64 === "string"
				? step.transactionDataBase64.trim()
				: "";
		if (solanaB64) {
			const sol = options?.solanaSigner;
			if (!sol) {
				throw new Error(`LI.FI step ${i} targets Solana but no solanaSigner is configured.`);
			}
			await maybePreflightSolanaDelegate(step);
			const txBytes = Uint8Array.from(atob(solanaB64), (c) => c.charCodeAt(0));
			const sig = await sol.signAndSendTransaction(txBytes);
			if (sig) txHashes.push(sig);
			continue;
		}

		const tr: LifiTransactionRequest | undefined = step.transactionRequest;
		if (!tr) {
			throw new Error(
				`LI.FI step ${i} has no transactionRequest — aborting to avoid partial execution`
			);
		}
		const chainId = tr.chainId ?? step.chainId;
		if (chainId == null) {
			throw new Error(`LI.FI step ${i} missing chainId`);
		}
		if (chainId !== SOLANA_LIFI_CHAIN_ID && (!tr.to || !ETH_ADDRESS_RE.test(tr.to))) {
			throw new Error(
				`LI.FI step ${i} has invalid 'to' address: ${tr.to ?? "(missing)"}`
			);
		}

		if (chainId === SOLANA_LIFI_CHAIN_ID) {
			const sol = options?.solanaSigner;
			if (!sol) {
				throw new Error(`LI.FI step ${i} targets Solana but no solanaSigner is configured.`);
			}
			const txData = tr.data;
			if (!txData) {
				throw new Error(`LI.FI Solana step ${i} has no transaction data.`);
			}
			await maybePreflightSolanaDelegate(step);
			const txBytes = Uint8Array.from(atob(txData), (c) => c.charCodeAt(0));
			const sig = await sol.signAndSendTransaction(txBytes);
			if (sig) txHashes.push(sig);
			continue;
		}

		if (relay && chainId === polygon.id) {
			const batch: Transaction[] = [];
			const relayHint = normalizeHint(step, tr);
			if (relayHint) {
				const owner = resolveAllowanceOwner(relayHint.chainId, options);
				if (!owner) {
					throw new Error(
						`LI.FI Polygon relay step ${i} needs token approval but no allowance owner is configured for chain ${relayHint.chainId}.`
					);
				}
				const pc = publicClientForChain(polygon.id);
				const allowance = await pc.readContract({
					address: relayHint.token as `0x${string}`,
					abi: erc20Abi,
					functionName: "allowance",
					args: [owner as `0x${string}`, relayHint.spender as `0x${string}`],
				});
				if (allowance < relayHint.required) {
					batch.push(relayApproveTransaction(relayHint.token, relayHint.spender));
				}
			}
			batch.push(relayTransactionFromTr(tr));
			try {
				const resp = await relay.execute(batch, `LI.FI Polygon step ${i}`);
				const txHash = await waitRelay(resp);
				if (txHash) txHashes.push(txHash);
			} catch (e) {
				throw handleTransferFromFailedIfPresent(
					e,
					lifiTransferFromLogContext(i, chainId, tr, step, options)
				);
			}
			continue;
		}

		const signer = await getSignerForChain(chainId);
		if (!signer?.sendTransaction) {
			throw new Error(`No wallet client for chain ${chainId}`);
		}

		// Sync allowance whenever the quote includes a hint — LiFi sometimes omits
		// `requiresApproval` while the on-chain step still performs `transferFrom`.
		const evmAllowanceHint = normalizeHint(step, tr);
		if (evmAllowanceHint) {
			const owner = resolveAllowanceOwner(evmAllowanceHint.chainId, options);
			if (!owner) {
				throw new Error(
					`LI.FI step ${i} needs token approval but no allowance owner is configured for chain ${evmAllowanceHint.chainId}.`
				);
			}
			try {
				const approveHash = await ensureAllowance(
					owner,
					evmAllowanceHint,
					signer,
					String(i)
				);
				if (approveHash) txHashes.push(approveHash);
			} catch (e) {
				throw handleTransferFromFailedIfPresent(
					e,
					lifiTransferFromLogContext(i, chainId, tr, step, options)
				);
			}
			await assertErc20BalanceCoversRequirement({
				chainId: evmAllowanceHint.chainId,
				owner: owner as `0x${string}`,
				token: evmAllowanceHint.token as `0x${string}`,
				required: evmAllowanceHint.required,
			});
		}

		let res: Awaited<ReturnType<SendTransactionCapable["sendTransaction"]>>;
		try {
			res = await signer.sendTransaction({
				to: tr.to as `0x${string}`,
				data: toHexData(tr.data),
				value: parseValue(tr.value),
				chainId,
			});
		} catch (e) {
			throw handleTransferFromFailedIfPresent(
				e,
				lifiTransferFromLogContext(i, chainId, tr, step, options)
			);
		}
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
