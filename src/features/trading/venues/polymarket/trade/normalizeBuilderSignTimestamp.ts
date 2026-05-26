/**
 * Relayer-only (gasless Safe txs). CLOB V2 order attribution uses `builderCode` on the CLOB client,
 * not these HMAC headers.
 *
 * Polymarket remote signer — align `POST /polymarket/builder/sign` with Polymarket’s reference:
 * https://github.com/Polymarket/privy-safe-builder-example/blob/main/app/api/polymarket/sign/route.ts
 *
 * HMAC (same as `@polymarket/builder-signing-sdk` `buildHmacSignature`):
 * `message = String(timestamp) + method + requestPath + (body if defined)` — note `body` is only
 * included when it is **not** `undefined` (many GETs have no body).
 *
 * **Timestamp — pick one strategy and use the same number for the HMAC input and
 * `POLY_BUILDER_TIMESTAMP`:**
 *
 * 1. **Official demo style (milliseconds)** — Polymarket’s `route.ts` uses
 *    `const sigTimestamp = Date.now().toString()` and `parseInt(sigTimestamp)` in
 *    `buildHmacSignature`, and returns that same string as `POLY_BUILDER_TIMESTAMP`.
 * 2. **Seconds** — e.g. `const ts = Math.floor(Date.now() / 1000)`; use `ts` for both the
 *    signature call and `${ts}` on `POLY_BUILDER_TIMESTAMP`. If the client omits `timestamp`
 *    in the JSON payload, using `BuilderSigner` on the server matches the embedded-wallet
 *    SDK’s local default.
 *
 * A 401 often means the relayer’s check did not match **your** HMAC — e.g. timestamp used in
 * the hash ≠ header, or you re-`JSON.stringify`’d `body` so the string no longer matches what
 * the relayer client sends.
 *
 * **Body** — Sign the same JSON **string** the client posted in `body` for `/submit`. Do not
 * parse and re-stringify.
 *
 * **GET without body** — The example repo requires `requestBody` truthy and will 400 on
 * authenticated GETs (e.g. `/transactions`). Your API should only require `method` + `path`,
 * and pass `undefined` to `buildHmacSignature` when there is no body.
 *
 * **Env** — The example uses `POLYMARKET_BUILDER_API_KEY`, `POLYMARKET_BUILDER_SECRET`,
 * `POLYMARKET_BUILDER_PASSPHRASE` (names may differ from `POLY_BUILDER_*` on your server).
 *
 * Use `buildHmacSignature` or `BuilderSigner` from the same `@polymarket/builder-signing-sdk`
 * version as the app; the secret is base64-decoded inside `buildHmacSignature`.
 */
export function normalizeBuilderSignTimestamp(timestamp: unknown): number | undefined {
	if (timestamp == null) return undefined;
	if (typeof timestamp !== "number" || Number.isNaN(timestamp)) return undefined;
	if (timestamp > 1e12) return Math.floor(timestamp / 1000);
	return Math.floor(timestamp);
}
