import type { ErrorDef } from "./types";

export class AppError extends Error {
	readonly code: string;
	/**
	 * Chained underlying error (vendor throw, fetch failure, etc.).
	 * Declared here because this repo's TS `lib` is ES2020 — the built-in
	 * `Error` type in that lib does not include `cause` (ES2022).
	 */
	readonly cause?: unknown;

	constructor(def: ErrorDef, options?: { cause?: unknown }) {
		super(def.userMessage);
		this.name = "AppError";
		this.code = def.code;
		if (options?.cause !== undefined) {
			this.cause = options.cause;
		}
	}
}

export function isAppError(err: unknown): err is AppError {
	return err instanceof AppError;
}
