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

async function resolveCtfAddress(
	verify: LimitlessVerifyAllowanceResult,
	venueExchange: `0x${string}`,
): Promise<`0x${string}`> {
	const fromApi = verify.ctfAddress?.trim();
	if (fromApi && /^0x[0-9a-fA-F]{40}$/.test(fromApi)) {
		return ethers.getAddress(fromApi) as `0x${string}`;
	}
	try {
		const ctf = await basePublicClient.readContract({
			address: venueExchange,
			abi: getCtfAbi,
			functionName: "getCtf",
		});
		return ethers.getAddress(ctf) as `0x${string}`;
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
 * - **Sell:** CTF `setApprovalForAll` only for `venue.exchange` and optional `venue.adapter`
 *   (never the CTF address as operator).
 *
 * Each missing approval is its own `sendTransaction({ to, data, value, chainId })` then
 * receipt wait — no mixed USDC+CTF batches.
 *
 * **Reads** use viem over a **fallback** of public Base RPCs (see `baseReadRpcUrls`).
 *
 * **`allowanceOwner`** (optional): address whose USDC allowance / CTF operator status is read
 * and who must match `msg.sender` for the approval txs (typically the Base **smart wallet**).
 * Limitless `maker` from ensure-account can differ; if omitted, `maker` is used for reads.
 */
export async function ensureLimitlessTradingApprovalsOnBase(opts: {
	getClientForChain: GetClientForChainForLimitless;
	maker: string;
	/** Prefer smart wallet / fund target when it differs from Limitless `maker`. */
	allowanceOwner?: string;
	verify: LimitlessVerifyAllowanceResult;
	side: "buy" | "sell";
}): Promise<{ didSendTransactions: boolean }> {
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

	const ownerRaw = opts.allowanceOwner?.trim() || makerRaw;
	if (!ownerRaw || !ethers.isAddress(ownerRaw)) {
		throw new Error(
			"On-chain approval owner address missing or invalid — connect your Base wallet.",
		);
	}
	const owner = ethers.getAddress(ownerRaw) as `0x${string}`;

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
		if (maker.toLowerCase() !== owner.toLowerCase()) {
			const s0 = usdcSpenders[0]!;
			try {
				const [aMaker, aOwner] = await Promise.all([
					basePublicClient.readContract({
						address: usdc,
						abi: erc20Abi,
						functionName: "allowance",
						args: [maker, s0],
					}),
					basePublicClient.readContract({
						address: usdc,
						abi: erc20Abi,
						functionName: "allowance",
						args: [owner, s0],
					}),
				]);
				console.warn(JIT, "USDC allowance: Limitless maker vs app allowanceOwner (first spender)", {
					spender: `${s0.slice(0, 12)}…`,
					makerAllowance: aMaker.toString(),
					ownerAllowance: aOwner.toString(),
				});
			} catch (e) {
				const m = e instanceof Error ? e.message : String(e);
				console.warn(JIT, "USDC allowance comparison read failed", { message: m.slice(0, 200) });
			}
		}
		for (const spender of usdcSpenders) {
			let allowance: bigint;
			try {
				allowance = await basePublicClient.readContract({
					address: usdc,
					abi: erc20Abi,
					functionName: "allowance",
					args: [owner, spender],
				});
			} catch (e) {
				const m = e instanceof Error ? e.message : String(e);
				throw new Error(
					`Limitless: USDC allowance read failed (owner=${owner}, spender=${spender}): ${m}`,
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
			if (op.toLowerCase() === owner.toLowerCase()) return false;
			return true;
		});

		for (const operator of erc1155Operators) {
			let needApproval: boolean;
			try {
				const ok = await basePublicClient.readContract({
					address: ctfAddr,
					abi: erc1155Abi,
					functionName: "isApprovedForAll",
					args: [owner, operator],
				});
				needApproval = !ok;
			} catch (e) {
				const m = e instanceof Error ? e.message : String(e);
				console.warn(JIT, "CTF isApprovedForAll view reverted; scheduling setApprovalForAll", {
					ctf: ctfAddr,
					operator,
					message: m.slice(0, 220),
				});
				needApproval = true;
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
			allowanceOwner: `${owner.slice(0, 10)}…`,
			ownerDiffersFromMaker: owner.toLowerCase() !== maker.toLowerCase(),
			partnerHasMinUsdcAllowance: opts.verify.hasMinimumAllowance,
		});
		return { didSendTransactions: false };
	}

	console.warn(JIT, `wallet: sequential ${opts.side} approvals`, {
		chainId: BASE,
		callCount: calls.length,
		side: opts.side,
		maker: `${maker.slice(0, 10)}…`,
		allowanceOwner: `${owner.slice(0, 10)}…`,
		partnerHasMinUsdcAllowance: opts.verify.hasMinimumAllowance,
		plan: calls.map((c, idx) => ({
			idx,
			kind: classifyApprovalCall(c.to, usdc, resolvedCtf),
			to: `${c.to.slice(0, 10)}…`,
			dataLen: c.data.length,
			selector: c.data.slice(0, 10),
		})),
	});

	const client = await opts.getClientForChain({ id: BASE });
	if (!client?.sendTransaction) {
		throw new Error(
			"Base smart wallet unavailable. Connect your wallet to approve for Limitless.",
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
