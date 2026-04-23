import type { LifiStatusResponse } from "@/types/trading";

export function extractLifiStatus(body: unknown): string | undefined {
	if (!body || typeof body !== "object") return undefined;
	const o = body as Record<string, unknown>;
	if (typeof o.status === "string") return o.status;
	const data = o.data;
	if (data && typeof data === "object") {
		const d = data as Record<string, unknown>;
		if (typeof d.status === "string") return d.status;
	}
	const sub = o.substatus;
	if (typeof sub === "string") return sub;
	return undefined;
}

function isTerminalStatus(status: string): boolean {
	const u = status.toUpperCase();
	return [
		"DONE",
		"COMPLETED",
		"SUCCESS",
		"FAILED",
		"REFUNDED",
		"NOT_FOUND",
		"CANCELLED",
	].includes(u);
}

export type PollLifiOptions = {
	intervalMs?: number;
	maxAttempts?: number;
	signal?: AbortSignal;
};

/**
 * Throws if the polled body is not a successful terminal LI.FI status.
 */
export function assertLifiTerminalSuccess(body: unknown): void {
	const st = extractLifiStatus(body);
	if (!st) {
		throw new Error("LI.FI status response had no status field — cannot confirm the bridge.");
	}
	const u = st.toUpperCase();
	if (u === "DONE" || u === "COMPLETED" || u === "SUCCESS") return;
	if (u === "FAILED" || u === "REFUNDED" || u === "NOT_FOUND" || u === "CANCELLED") {
		throw new Error(`LI.FI bridge ended with status "${st}".`);
	}
	throw new Error(`LI.FI bridge ended with unexpected status "${st}".`);
}

/**
 * Poll GET /funding/lifi/status until terminal or max attempts.
 * Supports cancellation via AbortSignal.
 */
export async function pollLifiUntilTerminal(
	getStatus: () => Promise<LifiStatusResponse>,
	opts: PollLifiOptions = {}
): Promise<LifiStatusResponse> {
	const intervalMs = opts.intervalMs ?? 12_000;
	const maxAttempts = opts.maxAttempts ?? 60;
	let last: LifiStatusResponse = null;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (opts.signal?.aborted) {
			throw new DOMException("Polling aborted", "AbortError");
		}
		last = await getStatus();
		const st = extractLifiStatus(last);
		if (st && isTerminalStatus(st)) {
			assertLifiTerminalSuccess(last);
			return last;
		}
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, intervalMs);
			opts.signal?.addEventListener("abort", () => {
				clearTimeout(timer);
				reject(new DOMException("Polling aborted", "AbortError"));
			}, { once: true });
		});
	}
	const finalSt = extractLifiStatus(last);
	throw new Error(
		`LI.FI bridge status never reached a terminal state after ${maxAttempts} checks (interval ${intervalMs}ms). Last status: ${finalSt ?? "unknown"}.`,
	);
}
