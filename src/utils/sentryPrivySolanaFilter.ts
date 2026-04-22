const PRIVY_SOLANA_INSUFFICIENT =
	/Solana wallet has insufficient funds for this transaction/i;

function mechanismTypeFromExceptionValue(
	v: Record<string, unknown> | undefined,
): string | undefined {
	const mech = v?.mechanism;
	if (mech && typeof mech === "object" && "type" in mech && typeof (mech as { type?: unknown }).type === "string") {
		return (mech as { type: string }).type;
	}
	return undefined;
}

/** Sentry v10 uses `auto.browser.global_handlers.onunhandledrejection` (see globalHandlers.js), not `onunhandledrejection`. */
function isUnhandledRejectionMechanism(type: string | undefined): boolean {
	if (!type) return false;
	return type === "onunhandledrejection" || type.includes("onunhandledrejection");
}

/**
 * Privy’s headless Solana `sendTransaction` can reject with `C16(reject)` while the inner async worker
 * still throws, producing a duplicate `onunhandledrejection` with the same message. Drop that duplicate
 * from Sentry only; still report other mechanisms and unrelated errors.
 */
export function shouldDropPrivyDuplicateSolanaInsufficientUnhandled(event: unknown): boolean {
	if (!event || typeof event !== "object") return false;
	const e = event as Record<string, unknown>;
	const exc = e.exception;
	if (!exc || typeof exc !== "object") return false;
	const values = (exc as { values?: unknown }).values;
	if (!Array.isArray(values) || values.length === 0) return false;
	const first = values[0];
	if (!first || typeof first !== "object") return false;
	const v = first as Record<string, unknown>;
	if (!isUnhandledRejectionMechanism(mechanismTypeFromExceptionValue(v))) return false;
	const blob = [v.value, v.type, e.message]
		.filter((x): x is string => typeof x === "string")
		.join("\n");
	return PRIVY_SOLANA_INSUFFICIENT.test(blob);
}
