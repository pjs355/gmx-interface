"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LRUCache = void 0;
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
        this.recentKeys = [];
    }
    has(key) {
        return this.cache.has(key);
    }
    get(key) {
        if (this.cache.has(key)) {
            // Update recentKeys to reflect the usage
            this.updateRecentKeys(key);
            return this.cache.get(key);
        }
        return undefined;
    }
    set(key, value) {
        if (typeof key !== "string") {
            throw new Error("Key must be a string");
        }
        // If key exists, update its value and move it to the front of recentKeys
        if (this.cache.has(key)) {
            this.cache.set(key, value);
            this.updateRecentKeys(key);
        }
        else {
            // If capacity is reached, remove least recently used item
            if (this.cache.size === this.capacity) {
                const lruKey = this.recentKeys.shift();
                if (lruKey) {
                    this.cache.delete(lruKey);
                }
            }
            // Add the new key-value pair to the cache and recentKeys
            this.cache.set(key, value);
            this.recentKeys.push(key);
        }
    }
    updateRecentKeys(key) {
        // Move the key to the end (most recently used) of recentKeys
        this.recentKeys = this.recentKeys.filter((k) => k !== key);
        this.recentKeys.push(key);
    }
}
exports.LRUCache = LRUCache;
