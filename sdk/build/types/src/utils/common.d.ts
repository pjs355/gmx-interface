declare global {
    interface AbortSignal {
        addEventListener(type: "abort", listener: () => void): void;
    }
}
export declare const sleep: (ms: number, abortSignal?: AbortSignal) => Promise<unknown>;
export declare const TIMEZONE_OFFSET_SEC: number;
