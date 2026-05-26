/**
 * Minimal browser shim for Node `crypto` — `createHmac` (SHA-256) and `createHash` (SHA-1).
 *
 * Polymarket CLOB L2 HMAC calls `crypto.createHmac("sha256", secret)` for L2 auth headers.
 * `@polymarket/clob-client-v2` also uses `crypto.createHash("sha1")` for order summary hashing.
 *
 * The full `crypto-browserify` pulls in `readable-stream` / `hash-base` which need `Buffer`
 * before the app entry runs, crashing Vite's pre-bundle.
 *
 * HMAC + SHA-256 here are pure JS; SHA-1 for `createHash` uses `@noble/hashes` (already in the app).
 */

import { sha1 as sha1Noble } from "@noble/hashes/sha1";

function toBytes(input: string | Uint8Array): Uint8Array {
	if (input instanceof Uint8Array) return input;
	return new TextEncoder().encode(input);
}

function hexEncode(bytes: Uint8Array): string {
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

// ─── Pure-JS SHA-256 (FIPS 180-4) ────────────────────────────────────────────

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(data: Uint8Array): Uint8Array {
	let H0 = 0x6a09e667,
		H1 = 0xbb67ae85,
		H2 = 0x3c6ef372,
		H3 = 0xa54ff53a,
		H4 = 0x510e527f,
		H5 = 0x9b05688c,
		H6 = 0x1f83d9ab,
		H7 = 0x5be0cd19;

	const len = data.length;
	const bitLen = len * 8;
	// total must be a multiple of 64: original + 0x80 + zero-pad + 8-byte length
	const padZeros = (64 - ((len + 9) % 64)) % 64;
	const total = len + 9 + padZeros;
	const buf = new Uint8Array(total);
	buf.set(data);
	buf[len] = 0x80;
	const view = new DataView(buf.buffer);
	// 64-bit big-endian bit length (high word always 0 for messages < 512 MB)
	view.setUint32(total - 8, 0, false);
	view.setUint32(total - 4, bitLen, false);

	const W = new Int32Array(64);
	for (let off = 0; off < total; off += 64) {
		for (let i = 0; i < 16; i++) W[i] = view.getInt32(off + i * 4, false);
		for (let i = 16; i < 64; i++) {
			const s0 =
				(((W[i - 15] >>> 7) | (W[i - 15] << 25)) ^
					((W[i - 15] >>> 18) | (W[i - 15] << 14)) ^
					(W[i - 15] >>> 3)) |
				0;
			const s1 =
				(((W[i - 2] >>> 17) | (W[i - 2] << 15)) ^
					((W[i - 2] >>> 19) | (W[i - 2] << 13)) ^
					(W[i - 2] >>> 10)) |
				0;
			W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
		}
		let a = H0,
			b = H1,
			c = H2,
			d = H3,
			e = H4,
			f = H5,
			g = H6,
			h = H7;
		for (let i = 0; i < 64; i++) {
			const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) | 0;
			const ch = ((e & f) ^ (~e & g)) | 0;
			const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
			const S0 =
				(((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) | 0;
			const maj = ((a & b) ^ (a & c) ^ (b & c)) | 0;
			const t2 = (S0 + maj) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}
		H0 = (H0 + a) | 0;
		H1 = (H1 + b) | 0;
		H2 = (H2 + c) | 0;
		H3 = (H3 + d) | 0;
		H4 = (H4 + e) | 0;
		H5 = (H5 + f) | 0;
		H6 = (H6 + g) | 0;
		H7 = (H7 + h) | 0;
	}
	const out = new Uint8Array(32);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, H0, false);
	dv.setUint32(4, H1, false);
	dv.setUint32(8, H2, false);
	dv.setUint32(12, H3, false);
	dv.setUint32(16, H4, false);
	dv.setUint32(20, H5, false);
	dv.setUint32(24, H6, false);
	dv.setUint32(28, H7, false);
	return out;
}

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

const BLOCK_SIZE = 64; // SHA-256 block size

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
	let k = key;
	if (k.length > BLOCK_SIZE) k = sha256(k);
	const iPad = new Uint8Array(BLOCK_SIZE + message.length);
	const oPad = new Uint8Array(BLOCK_SIZE + 32);
	for (let i = 0; i < BLOCK_SIZE; i++) {
		const kb = i < k.length ? k[i] : 0;
		iPad[i] = kb ^ 0x36;
		oPad[i] = kb ^ 0x5c;
	}
	iPad.set(message, BLOCK_SIZE);
	const inner = sha256(iPad);
	oPad.set(inner, BLOCK_SIZE);
	return sha256(oPad);
}

// ─── createHmac interface (matches Node crypto.createHmac) ────────────────────

class HmacInstance {
	private _key: Uint8Array;
	private _chunks: Uint8Array[] = [];

	constructor(alg: string, key: string | Uint8Array) {
		if (alg.toLowerCase() !== "sha256") {
			throw new Error(`crypto-hmac-shim: only sha256 is supported, got "${alg}"`);
		}
		this._key = toBytes(key);
	}

	update(data: string | Uint8Array): this {
		this._chunks.push(toBytes(data));
		return this;
	}

	digest(encoding?: string): string | Uint8Array {
		let totalLen = 0;
		for (const c of this._chunks) totalLen += c.length;
		const message = new Uint8Array(totalLen);
		let offset = 0;
		for (const chunk of this._chunks) {
			message.set(chunk, offset);
			offset += chunk.length;
		}
		const result = hmacSha256(this._key, message);
		if (encoding === "hex") return hexEncode(result);
		if (encoding === "base64") return btoa(String.fromCharCode(...result));
		return result;
	}
}

export function createHmac(algorithm: string, key: string | Uint8Array): HmacInstance {
	return new HmacInstance(algorithm, key);
}

// ─── createHash (Node-compatible subset; clob-client-v2 uses sha1 only) ───────

class HashInstance {
	private _chunks: Uint8Array[] = [];

	constructor(alg: string) {
		const a = alg.toLowerCase();
		if (a !== "sha1") {
			throw new Error(`crypto-hmac-shim createHash: only sha1 is supported, got "${alg}"`);
		}
	}

	update(data: string | Uint8Array): this {
		this._chunks.push(toBytes(data));
		return this;
	}

	digest(encoding?: string): string | Uint8Array {
		let totalLen = 0;
		for (const c of this._chunks) totalLen += c.length;
		const message = new Uint8Array(totalLen);
		let offset = 0;
		for (const chunk of this._chunks) {
			message.set(chunk, offset);
			offset += chunk.length;
		}
		const result = sha1Noble(message);
		if (encoding === "hex") return hexEncode(result);
		if (encoding === "base64") return btoa(String.fromCharCode(...result));
		return result;
	}
}

export function createHash(algorithm: string): HashInstance {
	return new HashInstance(algorithm);
}

export default { createHmac, createHash };
