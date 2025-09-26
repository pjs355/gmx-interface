export const mustNeverExist = (x) => {
    throw new Error(`Must never exist: ${x}`);
};
export const assertDefined = (x) => {
    if (x === undefined)
        throw new Error(`Expected defined value, got undefined`);
    return x;
};
