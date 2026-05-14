import { ethers } from "ethers";
import {
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	fallback,
	http,
	maxUint256,
} from "viem";
import { base } from "viem/chains";
import { getUSDCAddress } from "@/config/addresses";
import { BASE } from "@/config/chains";
import { RPC_URLS } from "@/config/rpc";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/trading/base/waitPrivyBaseTxReceipt";
import type { LimitlessVerifyAllowanceResult } from "@/trading/limitless/limitlessPrivateApiTypes";

const getCtfAbi = [
	{
		type: "function",
		name: "getCtf",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "address", name: "" }],
	},
] as const;

/** NegRisk: `getCtf()` on the exchange returns the adapter; outcome ERC1155 is `wrapper.ctf()`. */
const ctfOnWrapperAbi = [
	{
		type: "function",
		name: "ctf",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "address", name: "" }],
	},
] as const;

const erc1155Abi = [
	{
		type: "function",
		name: "isApprovedForAll",
		stateMutability: "view",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "operator", type: "address" },
		],
		outputs: [{ type: "bool" }],
	},
	{
		type: "function",
		name: "setApprovalForAll",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "operator", type: "address" },
			{ name: "approved", type: "bool" },
		],
		outputs: [],
	},
] as const;

export type GetClientForChainForLimitless = (opts: {
	id: number;
}) => Promise<SendTransactionCapable | null | undefined>;

/**
 * Browser `eth_call` reads for Limitless JIT — **not** the wallet signer.
 * Prefer public Base endpoints first: Coinbase developer RPC from the browser
 * often returns bodies viem cannot normalize (`getContractError` →
 * "Cannot read properties of null (reading 'data')").
 */
const baseReadRpcUrls: readonly string[] = [
	RPC_URLS.BASE_PUBLIC,
	RPC_URLS.BASE_PUBLIC_NODE,
	RPC_URLS.BASE_INFURA,
	RPC_URLS.BASE_COINBASE,
];

const basePublicClient = createPublicClient({
	chain: base,
	transport: fallback(
		baseReadRpcUrls.map((url) => http(url)),
		{ retryCount: 1, name: "limitless-base-reads" },
	),
});

const minUsdcAllowance = maxUint256 / 2n;

const JIT = "[Limitless/JIT]";

const isApprovedForAllReadRetryDelayMs = 180;

/** Two attempts with a short pause so transient RPC issues do not force a CTF tx. */
async function readIsApprovedForAllWithRetry(
	ctfAddr: `0x${string}`,
	maker: `0x${string}`,
	operator: `0x${string}`,
): Promise<boolean> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return await basePublicClient.readContract({
				address: ctfAddr,
				abi: erc1155Abi,
				functionName: "isApprovedForAll",
				args: [maker, operator],
			});
		} catch (e) {
			lastErr = e;
			if (attempt === 0) {
				await new Promise((r) =>
					setTimeout(r, isApprovedForAllReadRetryDelayMs),
				);
			}
		}
	}
	throw lastErr;
}

function classifyApprovalCall(
	callTo: `0x${string}`,
	usdc: `0x${string}`,
	ctf: `0x${string}` | null,
): "usdc.approve" | "ctf.setApprovalForAll" | "unknown" {
	if (callTo.toLowerCase() === usdc.toLowerCase()) return "usdc.approve";
	if (ctf != null && callTo.toLowerCase() === ctf.toLowerCase()) {
		return "ctf.setApprovalForAll";
	}
	return "unknown";
}

function errDetail(err: unknown): { message: string; stack?: string } {
	if (err instanceof Error) {
		return {
			message: err.message,
			stack: err.stack?.slice(0, 600),
		};
	}
	return { message: String(err) };
}

function uniqueChecksummedAddresses(raw: readonly string[]): `0x${string}`[] {
	const out: `0x${string}`[] = [];
	const seen = new Set<string>();
	for (const x of raw) {
		const t = x?.trim();
		if (!t) continue;
		const a = ethers.getAddress(t);
		if (seen.has(a)) continue;
		seen.add(a);
		out.push(a as `0x${string}`);
	}
	return out;
}

/**
 * Read-only: true if every Limitless USDC spender for buys already has
 * `allowance(maker, spender) >= min` on Base. Use when partner
 * `verify-allowance` still says false but on-chain state is sufficient (API lag).
 */
export async function readLimitlessBuyUsdcAllowancesSufficientOnBase(opts: {
	maker: string;
	verify: LimitlessVerifyAllowanceResult;
}): Promise<boolean> {
	const makerRaw = opts.maker?.trim();
	if (!makerRaw || !ethers.isAddress(makerRaw)) return false;
	const maker = ethers.getAddress(makerRaw) as `0x${string}`;

	const spenderTrim = opts.verify.spender?.trim();
	if (!spenderTrim || !ethers.isAddress(spenderTrim)) return false;

	const spendersRaw =
		Array.isArray(opts.verify.usdcSpenders) && opts.verify.usdcSpenders.length > 0
			? opts.verify.usdcSpenders
			: [opts.verify.spender];
	const usdcSpenders = uniqueChecksummedAddresses(spendersRaw);
	if (usdcSpenders.length === 0) return false;

	const usdc = getUSDCAddress() as `0x${string}`;
	for (const spender of usdcSpenders) {
		try {
			const allowance = await basePublicClient.readContract({
				address: usdc,
				abi: erc20Abi,
				functionName: "allowance",
				args: [maker, spender],
			});
			if (allowance < minUsdcAllowance) return false;
		} catch {
			return false;
		}
	}
	return true;
}

/**
 * Tri-state sell CTF approval reads for Limitless on Base.
 * Use for signup warmup: do **not** treat read failures as "insufficient" (that spams txs).
 */
export type LimitlessSellCtfApprovalsReadState =
	| "sufficient"
	| "insufficient"
	| "unknown";

export async function readLimitlessSellCtfApprovalsState(opts: {
	maker: string;
	verify: LimitlessVerifyAllowanceResult;
}): Promise<LimitlessSellCtfApprovalsReadState> {
	const makerRaw = opts.maker?.trim();
	if (!makerRaw || !ethers.isAddress(makerRaw)) return "unknown";
	const maker = ethers.getAddress(makerRaw) as `0x${string}`;

	const spenderTrim = opts.verify.spender?.trim();
	if (!spenderTrim || !ethers.isAddress(spenderTrim)) return "unknown";
	const venueExchange = ethers.getAddress(spenderTrim) as `0x${string}`;

	let ctfAddr: `0x${string}`;
	try {
		ctfAddr = await resolveCtfAddress(opts.verify, venueExchange);
	} catch {
		return "unknown";
	}

	const adapterRaw = opts.verify.venueAdapter?.trim();
	const erc1155Operators = uniqueChecksummedAddresses([
		venueExchange,
		...(adapterRaw && ethers.isAddress(adapterRaw) ? [adapterRaw] : []),
	]).filter((op) => {
		if (op.toLowerCase() === ctfAddr.toLowerCase()) return false;
		if (op.toLowerCase() === maker.toLowerCase()) return false;
		return true;
	});

	for (const operator of erc1155Operators) {
		try {
			const ok = await readIsApprovedForAllWithRetry(ctfAddr, maker, operator);
			if (!ok) return "insufficient";
		} catch {
			return "unknown";
		}
	}
	return "sufficient";
}

/**
 * Read-only: true if every Limitless CTF operator for sells already has
 * `isApprovedForAll(maker, operator)` on Base. Mirrors the sell branch of
 * {@link ensureLimitlessTradingApprovalsOnBase} without sending txs.
 * Read reverts or missing data → false (caller may still run full ensure).
 */
export async function readLimitlessSellCtfApprovalsSufficientOnBase(opts: {
	maker: string;
	verify: LimitlessVerifyAllowanceResult;
}): Promise<boolean> {
	return (await readLimitlessSellCtfApprovalsState(opts)) === "sufficient";
}

async function unwrapToUnderlyingConditionalTokens(
	wrapperOrCtf: `0x${string}`,
): Promise<`0x${string}`> {
	try {
		const inner = await basePublicClient.readContract({
			address: wrapperOrCtf,
			abi: ctfOnWrapperAbi,
			functionName: "ctf",
		});
		const innerAddr = ethers.getAddress(inner) as `0x${string}`;
		if (innerAddr.toLowerCase() !== wrapperOrCtf.toLowerCase()) {
			return innerAddr;
		}
	} catch {
		/* plain CTF — no nested ctf() */
	}
	return wrapperOrCtf;
}

async function resolveCtfAddress(
	verify: LimitlessVerifyAllowanceResult,
	venueExchange: `0x${string}`,
): Promise<`0x${string}`> {
	const fromApi = verify.ctfAddress?.trim();
	const adapterTrim = verify.venueAdapter?.trim();
	let apiMatchesAdapter = false;
	if (
		fromApi &&
		/^0x[0-9a-fA-F]{40}$/.test(fromApi) &&
		adapterTrim &&
		ethers.isAddress(adapterTrim)
	) {
		apiMatchesAdapter =
			ethers.getAddress(fromApi).toLowerCase() ===
			ethers.getAddress(adapterTrim).toLowerCase();
	}
	if (fromApi && /^0x[0-9a-fA-F]{40}$/.test(fromApi) && !apiMatchesAdapter) {
		const apiAddr = ethers.getAddress(fromApi) as `0x${string}`;
		return unwrapToUnderlyingConditionalTokens(apiAddr);
	}
	try {
		const ctf = await basePublicClient.readContract({
			address: venueExchange,
			abi: getCtfAbi,
			functionName: "getCtf",
		});
		const bridge = ethers.getAddress(ctf) as `0x${string}`;
		return unwrapToUnderlyingConditionalTokens(bridge);
	} catch (e) {
		const m = e instanceof Error ? e.message : String(e);
		throw new Error(
			`Limitless: read getCtf() on venue exchange ${venueExchange} failed (${m}). Check Base RPC or exchange address.`,
		);
	}
}

/**
 * Limitless JIT on-chain approvals on Base, **by trade side** (keeps flows small):
 *
 * - **Buy:** USDC `approve` only for `usdcSpenders` / `spender` when allowance is low.
 * - **Sell:** `setApprovalForAll` on the **underlying** Gnosis CTF (unwrap `getCtf()` via
 *   `ctf()` when the exchange points at a NegRisk adapter). Operators: `venue.exchange`
 *   and optional `venue.adapter` (never use the CTF `to` as operator).
 *
 * Each missing approval is its own `sendTransaction({ to, data, value, chainId })` then
 * receipt wait — no mixed USDC+CTF batches.
 *
 * **Reads** use viem over a **fallback** of public Base RPCs (see `baseReadRpcUrls`).
 *
 * On-chain reads and `approve` / `setApprovalForAll` **must** use the Limitless **`maker`**
 * (the EIP-712 identity). When the maker is the embedded EOA and the fund target is the
 * smart wallet, {@link opts.getTxClientForAddress} must return Privy embedded sponsored
 * sends for that address — approving from the SCW does not satisfy Limitless partner checks.
 *
 * {@link opts.sellOnReadRevert} (sell only): when `isApprovedForAll` **reverts**, either queue
 * `setApprovalForAll` (JIT default) or skip that operator (signup warmup) so RPC/Privy
 * flukes do not spam transactions.
 */
export type LimitlessSellReadRevertHandling = "queueApproval" | "skipOperator";

export async function ensureLimitlessTradingApprovalsOnBase(opts: {
	maker: string;
	/** Resolves the wallet client that can sign Base txs as `address` (embedded or SCW). */
	getTxClientForAddress: (
		address: string,
	) => Promise<SendTransactionCapable | null | undefined>;
	verify: LimitlessVerifyAllowanceResult;
	side: "buy" | "sell";
	/**
	 * Sell branch only: if `isApprovedForAll` reverts, `queueApproval` schedules
	 * `setApprovalForAll` (first-trade JIT). `skipOperator` skips that operator (warmup).
	 * @default "queueApproval"
	 */
	sellOnReadRevert?: LimitlessSellReadRevertHandling;
}): Promise<{ didSendTransactions: boolean }> {
	const sellOnReadRevert = opts.sellOnReadRevert ?? "queueApproval";
	if (opts.verify == null || typeof opts.verify !== "object") {
		throw new Error(
			"Limitless verify-allowance payload was empty. Refresh the page and retry, or check the private API.",
		);
	}
	const makerRaw = opts.maker?.trim();
	if (!makerRaw || !ethers.isAddress(makerRaw)) {
		throw new Error("Limitless maker address missing — cannot verify on-chain approvals.");
	}
	const maker = ethers.getAddress(makerRaw) as `0x${string}`;

	const spenderTrim = opts.verify.spender?.trim();
	if (!spenderTrim || !ethers.isAddress(spenderTrim)) {
		throw new Error(
			"Limitless verify-allowance missing venue exchange (spender). Retry ensure-account.",
		);
	}
	const venueExchange = ethers.getAddress(spenderTrim) as `0x${string}`;

	const usdc = getUSDCAddress() as `0x${string}`;
	const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> =
		[];

	let resolvedCtf: `0x${string}` | null = null;

	if (opts.side === "buy") {
		const spendersRaw =
			Array.isArray(opts.verify.usdcSpenders) && opts.verify.usdcSpenders.length > 0
				? opts.verify.usdcSpenders
				: [opts.verify.spender];
		const usdcSpenders = uniqueChecksummedAddresses(spendersRaw);
		if (usdcSpenders.length === 0) {
			throw new Error(
				"Limitless returned no USDC spender addresses. Retry ensure-account or contact support.",
			);
		}
		for (const spender of usdcSpenders) {
			let allowance: bigint;
			try {
				allowance = await basePublicClient.readContract({
					address: usdc,
					abi: erc20Abi,
					functionName: "allowance",
					args: [maker, spender],
				});
			} catch (e) {
				const m = e instanceof Error ? e.message : String(e);
				throw new Error(
					`Limitless: USDC allowance read failed (maker=${maker}, spender=${spender}): ${m}`,
				);
			}
			if (allowance < minUsdcAllowance) {
				calls.push({
					to: usdc,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: "approve",
						args: [spender, maxUint256],
					}),
					value: 0n,
				});
			}
		}
	} else {
		resolvedCtf = await resolveCtfAddress(opts.verify, venueExchange);
		const ctfAddr = resolvedCtf;
		const adapterRaw = opts.verify.venueAdapter?.trim();
		const erc1155Operators = uniqueChecksummedAddresses([
			venueExchange,
			...(adapterRaw && ethers.isAddress(adapterRaw) ? [adapterRaw] : []),
		]).filter((op) => {
			if (op.toLowerCase() === ctfAddr.toLowerCase()) return false;
			if (op.toLowerCase() === maker.toLowerCase()) return false;
			return true;
		});

		for (const operator of erc1155Operators) {
			let needApproval: boolean;
			try {
				const ok = await readIsApprovedForAllWithRetry(
					ctfAddr,
					maker,
					operator,
				);
				needApproval = !ok;
			} catch (e) {
				const m = e instanceof Error ? e.message : String(e);
				if (opts.side === "sell" && sellOnReadRevert === "skipOperator") {
					console.warn(
						JIT,
						"CTF isApprovedForAll view reverted; skip operator (sellOnReadRevert: skipOperator)",
						{
							ctf: ctfAddr,
							operator,
							message: m.slice(0, 220),
						},
					);
					needApproval = false;
				} else {
					console.warn(JIT, "CTF isApprovedForAll view reverted; scheduling setApprovalForAll", {
						ctf: ctfAddr,
						operator,
						message: m.slice(0, 220),
					});
					needApproval = true;
				}
			}
			if (needApproval) {
				calls.push({
					to: ctfAddr,
					data: encodeFunctionData({
						abi: erc1155Abi,
						functionName: "setApprovalForAll",
						args: [operator, true],
					}),
					value: 0n,
				});
			}
		}
	}

	if (calls.length === 0) {
		console.warn(JIT, "on-chain approvals skipped (nothing required for this side)", {
			chainId: BASE,
			side: opts.side,
			maker: `${maker.slice(0, 10)}…`,
			partnerHasMinUsdcAllowance: opts.verify.hasMinimumAllowance,
		});
		return { didSendTransactions: false };
	}

	console.warn(JIT, `wallet: sequential ${opts.side} approvals`, {
		chainId: BASE,
		callCount: calls.length,
		side: opts.side,
		maker: `${maker.slice(0, 10)}…`,
		partnerHasMinUsdcAllowance: opts.verify.hasMinimumAllowance,
		plan: calls.map((c, idx) => ({
			idx,
			kind: classifyApprovalCall(c.to, usdc, resolvedCtf),
			to: `${c.to.slice(0, 10)}…`,
			dataLen: c.data.length,
			selector: c.data.slice(0, 10),
		})),
	});

	const client = await opts.getTxClientForAddress(maker);
	if (!client?.sendTransaction) {
		throw new Error(
			"No wallet client can sign Base approvals as your Limitless maker. If you use a smart wallet with an embedded signer, reconnect and retry, or run Limitless setup again.",
		);
	}

	for (let i = 0; i < calls.length; i += 1) {
		const call = calls[i]!;
		const step = `${i + 1}/${calls.length}`;
		const kind = classifyApprovalCall(call.to, usdc, resolvedCtf);
		console.warn(JIT, `sendTransaction (${opts.side}) ${step}`, { kind });
		let sent: unknown;
		try {
			sent = await client.sendTransaction({
				to: call.to,
				data: call.data,
				value: call.value,
				chainId: BASE,
			});
		} catch (err) {
			console.error(JIT, `sendTransaction failed (${opts.side}) ${step}`, errDetail(err));
			throw err;
		}
		let hash: `0x${string}`;
		try {
			hash = parsePrivyEvmTxHash(sent);
		} catch (err) {
			console.error(JIT, `parse tx hash failed (${step})`, errDetail(err));
			throw err;
		}
		console.warn(JIT, `submitted (${step})`, { kind, hash });
		try {
			await waitForBaseTransactionSuccess(
				hash,
				`Limitless ${opts.side} approval ${step}`,
			);
		} catch (err) {
			console.error(JIT, `waitForReceipt failed (${step})`, { hash, ...errDetail(err) });
			throw err;
		}
		console.warn(JIT, `confirmed (${step})`, { kind, hash });
	}
	return { didSendTransactions: true };
}
