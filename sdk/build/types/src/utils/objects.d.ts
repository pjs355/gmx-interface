export declare function setByKey<T>(obj: {
    [key: string]: T;
}, key: string, data: T): {
    [x: string]: T;
};
export declare function updateByKey<T>(obj: {
    [key: string]: T;
}, key: string, data: Partial<T>): {
    [key: string]: T;
};
export declare function getByKey<T>(obj?: {
    [key: string]: T;
}, key?: string): T | undefined;
export declare function deleteByKey<T>(obj: {
    [key: string]: T;
}, key: string): {
    [x: string]: T;
};
export declare function objectKeysDeep(obj: Record<string, any>, depth?: number): string[];
