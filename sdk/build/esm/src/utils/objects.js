import isPlainObject from "lodash/isPlainObject";
export function setByKey(obj, key, data) {
    return { ...obj, [key]: data };
}
export function updateByKey(obj, key, data) {
    if (!obj[key])
        return obj;
    return { ...obj, [key]: { ...obj[key], ...data } };
}
export function getByKey(obj, key) {
    if (!obj || !key)
        return undefined;
    return obj[key];
}
export function deleteByKey(obj, key) {
    const newObj = { ...obj };
    delete newObj[key];
    return newObj;
}
export function objectKeysDeep(obj, depth = 1) {
    const keys = new Set();
    const scanQueue = [{ obj, currentDepth: 0 }];
    while (scanQueue.length > 0) {
        const { obj, currentDepth } = scanQueue.pop();
        if (currentDepth > depth) {
            continue;
        }
        for (const key of Object.keys(obj)) {
            keys.add(key);
            if (isPlainObject(obj[key])) {
                scanQueue.push({ obj: obj[key], currentDepth: currentDepth + 1 });
            }
        }
    }
    return Array.from(keys);
}
