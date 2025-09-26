export const sleep = (ms, abortSignal) => new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
            clearTimeout(timeout);
            resolve(undefined);
        });
    }
});
export const TIMEZONE_OFFSET_SEC = -new Date().getTimezoneOffset() * 60;
