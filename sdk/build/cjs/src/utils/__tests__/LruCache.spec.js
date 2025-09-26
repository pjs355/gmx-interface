"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const LruCache_1 = require("../LruCache");
(0, vitest_1.describe)("LruCache", () => {
    (0, vitest_1.it)("should store and retrieve values", () => {
        const cache = new LruCache_1.LRUCache(2);
        cache.set("a", 1);
        (0, vitest_1.expect)(cache.get("a")).toBe(1);
    });
    (0, vitest_1.it)("should return undefined for non-existing keys", () => {
        const cache = new LruCache_1.LRUCache(2);
        (0, vitest_1.expect)(cache.get("x")).toBeUndefined();
    });
    (0, vitest_1.it)("should update recent usage when getting a key", () => {
        const cache = new LruCache_1.LRUCache(2);
        cache.set("a", 1);
        cache.set("b", 2);
        cache.get("a"); // 'a' is now the most recently used
        cache.set("c", 3); // 'b' should be evicted
        (0, vitest_1.expect)(cache.has("b")).toBe(false);
        (0, vitest_1.expect)(cache.has("a")).toBe(true);
    });
    (0, vitest_1.it)("should evict the least recently used key when capacity is exceeded", () => {
        const cache = new LruCache_1.LRUCache(2);
        cache.set("a", 1);
        cache.set("b", 2);
        cache.set("c", 3); // 'a' is removed
        (0, vitest_1.expect)(cache.has("a")).toBe(false);
        (0, vitest_1.expect)(cache.has("b")).toBe(true);
        (0, vitest_1.expect)(cache.get("c")).toBe(3);
    });
    (0, vitest_1.it)("should update existing keys without eviction", () => {
        const cache = new LruCache_1.LRUCache(2);
        cache.set("a", 1);
        cache.set("b", 2);
        cache.set("a", 10); // update 'a'
        (0, vitest_1.expect)(cache.get("a")).toBe(10);
        (0, vitest_1.expect)(cache.has("b")).toBe(true);
    });
    (0, vitest_1.it)("should throw error if key is not a string", () => {
        const cache = new LruCache_1.LRUCache(2);
        (0, vitest_1.expect)(() => cache.set(123, 1)).toThrow("Key must be a string");
    });
});
