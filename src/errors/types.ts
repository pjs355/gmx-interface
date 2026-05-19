/** Stable id for logs, Sentry, and e2e (`data-qa-error-code`). */
export type ErrorDef = {
	readonly code: string;
	readonly userMessage: string;
};

export function defineError(code: string, userMessage: string): ErrorDef {
	return { code, userMessage };
}
