"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vitest_1 = require("vitest");
function isEmptyValue(value) {
    if (!value ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "object" && Object.keys(value).length === 0)) {
        return true;
    }
    return false;
}
(0, vitest_1.describe)("ABI files validation", () => {
    const abiDir = path_1.default.join(__dirname, "..");
    const abiFiles = fs_1.default.readdirSync(abiDir).filter((file) => file.endsWith(".json"));
    vitest_1.it.each(abiFiles)("validates %s doesn't contain metadata or bytecode", (fileName) => {
        const filePath = path_1.default.join(abiDir, fileName);
        const fileContent = JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"));
        const abiContent = Array.isArray(fileContent) ? fileContent : fileContent.abi;
        (0, vitest_1.expect)(abiContent).toBeDefined();
        (0, vitest_1.expect)(Array.isArray(abiContent)).toBe(true);
        const unnecessaryFields = [
            "metadata",
            "bytecode",
            "deployedBytecode",
            "sourceMap",
            "deployedSourceMap",
            "source",
            "ast",
            "schemaVersion",
            "updatedAt",
        ];
        const foundFields = unnecessaryFields.filter((field) => !isEmptyValue(fileContent[field]));
        (0, vitest_1.expect)(foundFields).toHaveLength(0);
    });
});
