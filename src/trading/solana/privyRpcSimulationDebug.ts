/**
 * Parses Privy Solana wallet RPC errors and inspects VersionedTransactions for
 * SPL TransferChecked (DFlow / Kalshi debugging). Mirrors the predictions API
 * `domain/dflow/*` helpers — keep behavior aligned when changing either side.
 */

import { VersionedTransaction, PublicKey } from "@solana/web3.js";
import { SOLANA_USDC_MINT } from "@/config/addresses";

export const PrivySolanaRpcErrorCode = {
	SOLANA_SIMULATION_INSUFFICIENT_FUNDS: "SOLANA_SIMULATION_INSUFFICIENT_FUNDS",
	SOLANA_INIT_OK_TRANSFER_FAILED: "SOLANA_INIT_OK_TRANSFER_FAILED",
	PRIVY_POLICY_PRESIGNED: "PRIVY_POLICY_PRESIGNED",
	PRIVY_UNKNOWN: "PRIVY_UNKNOWN",
} as const;

export type PrivySolanaRpcErrorCodeType =
	(typeof PrivySolanaRpcErrorCode)[keyof typeof PrivySolanaRpcErrorCode];

export interface PrivySolanaRpcClassification {
	code: PrivySolanaRpcErrorCodeType;
	summary: string;
	simulationLogLines: string[];
	initMarketLedgerSeen: boolean;
	transferCheckedSeen: boolean;
	insufficientFundsSeen: boolean;
	presignedPolicySeen: boolean;
	/** Present for `PRIVY_UNKNOWN` when useful for support. */
	rawSnippet?: string;
}

const PRESIGNED_RE = /pre-?signed|gas sponsorship|not supported for gas/i;
const INSUFFICIENT_RE = /insufficient funds|custom program error:\s*0x1/i;
const INIT_LEDGER_RE = /InitMarketLedger|InitMarketLedgerIdempotent/i;
const TRANSFER_CHECKED_RE = /TransferChecked/i;

function collectStrings(value: unknown, out: string[], depth = 0): void {
	if (depth > 30) return;
	if (value === null || value === undefined) return;
	if (typeof value === "string") {
		out.push(value);
		const t = value.trim();
		if (
			(t.startsWith("{") && t.endsWith("}")) ||
			(t.startsWith("[") && t.endsWith("]"))
		) {
			try {
				collectStrings(JSON.parse(t) as unknown, out, depth + 1);
			} catch {
				/* ignore */
			}
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const el of value) collectStrings(el, out, depth + 1);
		return;
	}
	if (typeof value === "object") {
		for (const v of Object.values(value as Record<string, unknown>)) {
			collectStrings(v, out, depth + 1);
		}
	}
}

function extractSimulationLogLines(body: unknown): string[] {
	const strings: string[] = [];
	collectStrings(body, strings);
	const lines: string[] = [];
	for (const str of strings) {
		if (
			str.includes("Program ") ||
			str.includes("invoke [") ||
			str.includes("Error:") ||
			str.includes("TransferChecked")
		) {
			lines.push(str);
		}
	}
	return lines;
}

function scanFlags(lines: string[]) {
	const joined = lines.join("\n");
	return {
		initMarketLedgerSeen: INIT_LEDGER_RE.test(joined),
		transferCheckedSeen: TRANSFER_CHECKED_RE.test(joined),
		insufficientFundsSeen: INSUFFICIENT_RE.test(joined),
		presignedPolicySeen: PRESIGNED_RE.test(joined),
	};
}

export function classifyPrivySolanaRpcError(body: unknown): PrivySolanaRpcClassification {
	const allStrings: string[] = [];
	if (body !== undefined) collectStrings(body, allStrings);
	const haystack = allStrings.join("\n");
	const simulationLogLines = extractSimulationLogLines(body);
	const flags = scanFlags([haystack, ...simulationLogLines]);
	const rawSnippet = JSON.stringify(body).slice(0, 400);

	if (flags.presignedPolicySeen) {
		return {
			code: PrivySolanaRpcErrorCode.PRIVY_POLICY_PRESIGNED,
			summary:
				"Privy policy: pre-signed tx or gas-sponsorship constraint (see DFlow co-sign flow in API docs).",
			simulationLogLines,
			...flags,
		};
	}

	if (flags.insufficientFundsSeen && flags.transferCheckedSeen) {
		const code = flags.initMarketLedgerSeen
			? PrivySolanaRpcErrorCode.SOLANA_INIT_OK_TRANSFER_FAILED
			: PrivySolanaRpcErrorCode.SOLANA_SIMULATION_INSUFFICIENT_FUNDS;
		return {
			code,
			summary:
				code === PrivySolanaRpcErrorCode.SOLANA_INIT_OK_TRANSFER_FAILED
					? "Simulation: market init OK; SPL TransferChecked insufficient funds (need SPL USDC on source ATA)."
					: "Simulation: SPL TransferChecked insufficient funds.",
			simulationLogLines,
			...flags,
		};
	}

	if (flags.insufficientFundsSeen) {
		return {
			code: PrivySolanaRpcErrorCode.SOLANA_SIMULATION_INSUFFICIENT_FUNDS,
			summary: "Simulation reported insufficient funds.",
			simulationLogLines,
			...flags,
		};
	}

	return {
		code: PrivySolanaRpcErrorCode.PRIVY_UNKNOWN,
		summary: "Unclassified Privy/Solana RPC error.",
		rawSnippet,
		simulationLogLines,
		...flags,
	};
}

export function classifyPrivySolanaRpcErrorFromUnknown(err: unknown): PrivySolanaRpcClassification {
	if (!err) {
		return {
			code: PrivySolanaRpcErrorCode.PRIVY_UNKNOWN,
			summary: "Empty error",
			simulationLogLines: [],
			initMarketLedgerSeen: false,
			transferCheckedSeen: false,
			insufficientFundsSeen: false,
			presignedPolicySeen: false,
		};
	}
	if (typeof err === "object") {
		const o = err as Record<string, unknown>;
		if ("cause" in o && o.cause !== undefined) {
			return classifyPrivySolanaRpcError(o.cause);
		}
	}
	const msg = err instanceof Error ? err.message : String(err);
	let parsed: unknown = msg;
	try {
		parsed = JSON.parse(msg) as unknown;
	} catch {
		/* keep string */
	}
	return classifyPrivySolanaRpcError(parsed);
}

const SPL_TOKEN_PROGRAM_ID = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const SPL_TOKEN_2022_PROGRAM_ID = new PublicKey(
	"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
const SPL_TRANSFER_CHECKED = 12;

export interface TransferCheckedInspect {
	sourceAta: string;
	mint: string;
	destinationAta: string;
	authority: string;
	amountRaw: string;
	decimals: number;
	tokenProgram: "legacy" | "token2022";
	mintIsCanonicalSolanaUsdc: boolean;
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
	const v = new DataView(buf.buffer, buf.byteOffset + offset, 8);
	return v.getBigUint64(0, true);
}

export function inspectTransferCheckedInstructions(
	serializedTx: Uint8Array,
): {
	ok: true;
	feePayer: string | null;
	warnings: string[];
	transferChecked: TransferCheckedInspect[];
} | { ok: false; error: string } {
	try {
		const tx = VersionedTransaction.deserialize(serializedTx);
		const msg = tx.message;
		const keys = msg.getAccountKeys();
		const hasLut =
			"addressTableLookups" in msg &&
			Array.isArray(
				(msg as { addressTableLookups?: unknown[] }).addressTableLookups,
			) &&
			((msg as { addressTableLookups?: unknown[] }).addressTableLookups?.length ??
				0) > 0;
		const warnings: string[] = [];
		if (hasLut) {
			warnings.push(
				"Transaction uses address lookup tables; account list may be incomplete without resolved LUTs.",
			);
		}
		const accountKeys: PublicKey[] = [];
		for (let i = 0; i < keys.length; i++) {
			const k = keys.get(i);
			if (!k) throw new Error(`Missing account key at index ${i}`);
			accountKeys.push(k);
		}
		const feePayer = keys.staticAccountKeys[0]?.toBase58() ?? null;
		const out: TransferCheckedInspect[] = [];

		for (const ix of msg.compiledInstructions) {
			const programId = accountKeys[ix.programIdIndex];
			if (!programId) continue;
			const pid = programId.toBase58();
			const isLegacy = pid === SPL_TOKEN_PROGRAM_ID.toBase58();
			const is2022 = pid === SPL_TOKEN_2022_PROGRAM_ID.toBase58();
			if (!isLegacy && !is2022) continue;
			const data = ix.data;
			if (data.length < 1 + 8 + 1) continue;
			if (data[0] !== SPL_TRANSFER_CHECKED) continue;
			if (ix.accountKeyIndexes.length < 4) continue;
			const sourceAta = accountKeys[ix.accountKeyIndexes[0]!]!.toBase58();
			const mint = accountKeys[ix.accountKeyIndexes[1]!]!.toBase58();
			const destinationAta = accountKeys[ix.accountKeyIndexes[2]!]!.toBase58();
			const authority = accountKeys[ix.accountKeyIndexes[3]!]!.toBase58();
			const amountRaw = readU64LE(data, 1).toString();
			const decimals = data[9]!;
			out.push({
				sourceAta,
				mint,
				destinationAta,
				authority,
				amountRaw,
				decimals,
				tokenProgram: is2022 ? "token2022" : "legacy",
				mintIsCanonicalSolanaUsdc: mint === SOLANA_USDC_MINT,
			});
		}
		return { ok: true, feePayer, warnings, transferChecked: out };
	} catch (e: unknown) {
		const m = e instanceof Error ? e.message : String(e);
		return { ok: false, error: m };
	}
}

/**
 * Multi-line explanation for browser console: Privy is not the LevelUp API;
 * classification + SPL transfer accounts (compare to EPj… USDC mint).
 */
export function formatPrivySponsoredSolanaFailureBlock(params: {
	serializedTx: Uint8Array;
	privyThrownError: unknown;
}): string {
	const cls = classifyPrivySolanaRpcErrorFromUnknown(params.privyThrownError);
	const inspected = inspectTransferCheckedInstructions(params.serializedTx);
	const lines: string[] = [
		"[privySponsoredSolana] ─── failure origin (read this) ───",
		"HTTP 400 is from Privy hosted wallet RPC (auth.privy.io …/wallets/:id/rpc), not from LevelUp predictions REST.",
		"Privy runs Solana simulation there; insufficient SPL balance surfaces as 400 + logs below.",
		`classified: ${cls.code} — ${cls.summary}`,
	];
	if (inspected.ok) {
		lines.push(`feePayer (message): ${inspected.feePayer ?? "?"}`);
		for (const w of inspected.warnings) lines.push(`warning: ${w}`);
		if (inspected.transferChecked.length === 0) {
			lines.push("No SPL TransferChecked instruction found in tx (inspect decode only).");
		} else {
			lines.push(
				`SPL TransferChecked (debited source ATA → check balance vs amount): canonical Solana USDC mint is ${SOLANA_USDC_MINT}`,
			);
			for (const t of inspected.transferChecked) {
				lines.push(
					JSON.stringify({
						sourceAta: t.sourceAta,
						mint: t.mint,
						mintMatchesCanonicalUsdc: t.mintIsCanonicalSolanaUsdc,
						amountRawUnits: t.amountRaw,
						decimals: t.decimals,
						authority: t.authority,
						destinationAta: t.destinationAta,
						tokenProgram: t.tokenProgram,
					}),
				);
			}
		}
	} else {
		lines.push(`tx inspect failed: ${inspected.error}`);
	}
	return lines.join("\n");
}
