import { base, bsc, polygon } from "viem/chains";
import type { LifiQuoteStep, LifiTransactionRequest } from "@/types/trading";

/** Solidity `error TransferFromFailed();` */
export const TRANSFER_FROM_FAILED_SELECTOR = "0x7939f424";

const SELECTOR_LC = TRANSFER_FROM_FAILED_SELECTOR.toLowerCase();

function collectErrorStrings(err: unknown, depth = 0): string {
	if (depth > 8) return "";
	if (err == null) return "";
	if (typeof err === "string") return err;
	if (typeof err === "object") {
		const o = err as Record<string, unknown>;
		const parts: string[] = [];
		if (typeof o.message === "string") parts.push(o.message);
		if (typeof o.shortMessage === "string") parts.push(o.shortMessage);
		if (typeof o.details === "string") parts.push(o.details);
		if (typeof o.name === "string") parts.push(o.name);
		if (o.data != null) parts.push(String(o.data));
		if (Array.isArray(o.metaMessages)) {
			parts.push(o.metaMessages.filter((x) => typeof x === "string").join("\n"));
		}
		if (o.cause != null) parts.push(collectErrorStrings(o.cause, depth + 1));
		return parts.filter(Boolean).join("\n");
	}
	return String(err);
}

export function errorChainMentionsTransferFromFailed(err: unknown): boolean {
	return collectErrorStrings(err).toLowerCase().includes(SELECTOR_LC);
}

export type LifiAllowanceSnapshot = {
	token: string;
	spender: string;
	requiredAmountRaw: string;
};

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function parseLifiAllowanceSnapshot(
	step: LifiQuoteStep,
	_tr: LifiTransactionRequest,
): LifiAllowanceSnapshot | null {
	const h = step.allowanceHint;
	if (!h) return null;
	const token = h.tokenAddress ?? h.token;
	const spender = h.spenderAddress ?? h.spender;
	const raw = h.requiredAmountRaw ?? h.amount;
	if (!token || !spender || !ETH_ADDRESS_RE.test(token) || !ETH_ADDRESS_RE.test(spender)) {
		return null;
	}
	if (raw == null || raw === "") return null;
	let requiredAmountRaw: string;
	try {
		requiredAmountRaw = BigInt(raw).toString();
	} catch {
		return null;
	}
	if (BigInt(requiredAmountRaw) <= 0n) return null;
	return { token, spender, requiredAmountRaw };
}

export type TransferFromFailedLogContext = {
	stepIndex: number;
	chainId: number;
	fromAddress: string | undefined;
	snapshot: LifiAllowanceSnapshot | null;
};

export function logTransferFromFailedDecoded(context: TransferFromFailedLogContext): void {
	const { stepIndex, chainId, fromAddress, snapshot } = context;
	console.error("[LI.FI] TransferFromFailed", {
		decoded: "TransferFromFailed",
		selector: TRANSFER_FROM_FAILED_SELECTOR,
		stepIndex,
		chainId,
		fromAddress: fromAddress ?? "(unknown)",
		token: snapshot?.token ?? "(no allowance hint on step)",
		spender: snapshot?.spender ?? "(no allowance hint on step)",
		requiredAmountRaw: snapshot?.requiredAmountRaw ?? "(no allowance hint on step)",
	});
}

const CHAIN_LABEL: Record<number, string> = {
	[polygon.id]: "Polygon",
	[bsc.id]: "BNB Chain",
	[base.id]: "Base",
};

function evmChainLabel(chainId: number): string {
	return CHAIN_LABEL[chainId] ?? `chain ${chainId}`;
}

function transferFromFailedUserMessage(chainId: number): string {
	return `LI.FI could not pull the source token on ${evmChainLabel(chainId)} (transferFrom failed). Top up that token on this chain for the quoted wallet, or fix the approval — Privy gas sponsorship does not supply ERC-20 balance.`;
}

/**
 * When a revert includes `0x7939f424`, log decoded context and return a user-facing error (any EVM step).
 */
export function handleTransferFromFailedIfPresent(
	err: unknown,
	ctx: TransferFromFailedLogContext,
): Error {
	if (!errorChainMentionsTransferFromFailed(err)) {
		return err instanceof Error ? err : new Error(String(err));
	}
	logTransferFromFailedDecoded(ctx);
	const out = new Error(transferFromFailedUserMessage(ctx.chainId));
	(out as Error & { cause?: unknown }).cause = err;
	return out;
}
