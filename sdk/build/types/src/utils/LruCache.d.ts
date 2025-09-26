export declare class LRUCache<T> {
    private capacity;
    private cache;
    private recentKeys;
    constructor(capacity: number);
    has(key: string): boolean;
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    private updateRecentKeys;
}
