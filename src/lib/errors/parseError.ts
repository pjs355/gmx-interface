export type ErrorLike = Error & {
  errorMessage?: string;
  errorStack?: string;
  parentError?: Error;
  isAdditionalValidationPassed?: boolean;
  additionalValidationType?: string;
  errorSource?: string;
};

export function parseError(error: unknown): ErrorLike | undefined {
  if (!error) return undefined;
  const e = error as ErrorLike;
  const errorMessage = (e as any)?.message || String(error);
  const errorStack = (e as any)?.stack || undefined;
  return { ...(e as any), errorMessage, errorStack } as ErrorLike;
}


