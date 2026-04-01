/**
 * Load before any module that pulls readable-stream@2 (e.g. hash-base → md5.js → create-hash).
 *
 * That stream build does:
 *   `!process.browser && ['v0.10', ...].indexOf(process.version.slice(0, 5)) > -1`
 * If `process.browser` is false/undefined and `process.version` is missing, the app crashes at import time.
 */
import { Buffer } from "buffer";
import process from "process";

if (typeof globalThis.Buffer === "undefined") {
	globalThis.Buffer = Buffer;
}

/** Writable view — Node typings mark `version` read-only but runtime object is mutable. */
const proc = process as unknown as { browser?: boolean; version?: string };
if (proc.browser !== true) {
	proc.browser = true;
}
if (typeof proc.version !== "string") {
	proc.version = "";
}
