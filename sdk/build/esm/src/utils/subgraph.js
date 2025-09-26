export function buildFiltersBody(filters, options) {
    const res = {};
    let hadOr = false;
    let hadAnd = false;
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === "string") {
            if (options?.enums?.[value]) {
                res[key] = value;
            }
            else {
                res[key] = `"${value}"`;
            }
        }
        else if (typeof value === "number") {
            res[key] = `${value}`;
        }
        else if (typeof value === "boolean") {
            res[key] = `${value}`;
        }
        else if (Array.isArray(value)) {
            const valueStr = "[" +
                value
                    .map((el) => {
                    if (typeof el === "string") {
                        if (options?.enums?.[el]) {
                            return el;
                        }
                        else {
                            return `"${el}"`;
                        }
                    }
                    else if (typeof el === "number") {
                        return `${el}`;
                    }
                    else {
                        const elemStr = buildFiltersBody(el, options);
                        if (elemStr === "{}") {
                            return "";
                        }
                        else {
                            return elemStr;
                        }
                    }
                })
                    .filter((el) => el !== "")
                    .join(",") +
                "]";
            if (valueStr !== "[]") {
                res[key] = valueStr;
            }
        }
        else if (value === null) {
            res[key] = null;
        }
        else {
            const valueStr = buildFiltersBody(value, options);
            if (valueStr !== "{}") {
                res[key + "_"] = buildFiltersBody(value, options);
            }
        }
        if (hadOr) {
            throw new Error("Or must be a single key-value pair in the object.");
        }
        if (key === "or" && res[key] !== undefined) {
            hadOr = true;
        }
        if (hadAnd) {
            throw new Error("And must be a single key-value pair in the object.");
        }
        if (key === "and" && res[key] !== undefined) {
            hadAnd = true;
        }
    }
    const str = Object.entries(res).reduce((previous, [key, value], index) => {
        const maybeComma = index === 0 ? "" : ",";
        return `${previous}${maybeComma}${key}:${value}`;
    }, "");
    return `{${str}}`;
}
