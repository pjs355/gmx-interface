/**
 * Rejects with `Error(\`${label} timed out after …s\`)` if `promise` does not settle in `ms`.
 * Does not cancel the underlying work.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
		}, ms);
		promise
			.then((v) => {
				clearTimeout(timer);
				resolve(v);
			})
			.catch((e) => {
				clearTimeout(timer);
				reject(e);
			});
	});
}
