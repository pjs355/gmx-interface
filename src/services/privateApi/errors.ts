export class PrivateApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "PrivateApiError";
		this.status = status;
		this.body = body;
	}
}

type RelayerBundledError = {
	error?: string;
	status?: number;
	data?: unknown;
};

/** Duck-type axios errors (e.g. from @polymarket/clob-client-v2) without importing axios. */
function tryAxiosLikeErrorMessage(err: unknown): string | null {
	if (!err || typeof err !== "object") return null;
	const e = err as {
		response?: { status?: number; data?: unknown };
		message?: string;
	};
	const { response } = e;
	if (!response || typeof response !== "object") return null;
	const { status, data } = response as { status?: number; data?: unknown };
	if (typeof data === "string" && data.trim()) {
		return `HTTP ${status ?? "?"}: ${data}`;
	}
	if (data && typeof data === "object") {
		const o = data as Record<string, unknown>;
		if (typeof o.error === "string" && o.error) {
			return `HTTP ${status ?? "?"}: ${o.error}`;
		}
		const msg =
			typeof o.message === "string"
				? o.message
				: typeof o.detail === "string"
					? o.detail
					: null;
		if (msg) return `HTTP ${status ?? "?"}: ${msg}`;
		try {
			return `HTTP ${status ?? "?"}: ${JSON.stringify(data)}`;
		} catch {
			return `HTTP ${status ?? "?"}: (unreadable body)`;
		}
	}
	if (typeof e.message === "string" && e.message) return e.message;
	return status != null ? `HTTP ${status} request failed` : null;
}

function tryMessageFromRelayerClientError(message: string): string | null {
	const trimmed = message.trim();
	if (!trimmed.startsWith("{")) return null;
	let o: RelayerBundledError;
	try {
		o = JSON.parse(trimmed) as RelayerBundledError;
	} catch {
		return null;
	}
	if (o.error !== "request error" || typeof o.status !== "number") return null;

	const data = o.data;
	const innerErr =
		data &&
		typeof data === "object" &&
		data !== null &&
		"error" in data &&
		typeof (data as { error: unknown }).error === "string"
			? (data as { error: string }).error
			: null;

	if (o.status === 401 && innerErr === "invalid authorization") {
		return "Relayer auth failed (401). Fix POST /polymarket/builder/sign on your API — copy Polymarket’s reference: https://github.com/Polymarket/privy-safe-builder-example/blob/main/app/api/polymarket/sign/route.ts";
	}
	if (innerErr) return `Relayer request failed (${o.status}): ${innerErr}`;
	if (o.status) return `Relayer request failed (HTTP ${o.status}).`;
	return null;
}

export function getPrivateApiErrorMessage(err: unknown): string {
	if (err instanceof PrivateApiError) return err.message;
	const axiosLike = tryAxiosLikeErrorMessage(err);
	if (axiosLike) return axiosLike;
	if (err instanceof Error) {
		const relay = tryMessageFromRelayerClientError(err.message);
		if (relay) return relay;
		const fromMsg = err.message.trim();
		if (fromMsg.length > 0) return err.message;
		const fromName = err.name.trim();
		if (fromName.length > 0 && fromName !== "Error") {
			return `${fromName} (no message)`;
		}
		return "Request failed";
	}
	if (err && typeof err === "object" && "error" in err) {
		const raw = (err as { error: unknown }).error;
		if (typeof raw === "string" && raw) return raw;
		if (raw && typeof raw === "object") {
			try {
				return JSON.stringify(raw);
			} catch {
				return "Request failed";
			}
		}
	}
	return "Request failed";
}
