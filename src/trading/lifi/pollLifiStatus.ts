import type { LifiStatusResponse } from "@/types/trading";

function extractStatus(body: unknown): string | undefined {
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
		const st = extractStatus(last);
		if (st && isTerminalStatus(st)) {
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
	return last;
}
