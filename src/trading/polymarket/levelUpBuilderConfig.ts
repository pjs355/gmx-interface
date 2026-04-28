import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { getPrivateApiAbsoluteUrl } from "@/config/privateApiBase";
import type { GetToken } from "@/services/privateApi/client";

/**
 * Relayer-only: `BuilderConfig` with `remoteBuilderConfig` → `POST /polymarket/builder/sign`
 * (builder API key HMAC). CLOB V2 orders use `builderCode` on the CLOB client instead —
 * do not pass this into `ClobClient`.
 *
 * Server mirrors Polymarket privy-safe-builder-example (`buildHmacSignature`). See
 * `normalizeBuilderSignTimestamp.ts` for timestamp/body edge cases.
 * Relayer metadata GETs may have **no JSON body**; the route must still sign `method` + `path`.
 *
 * Call with a fresh Privy access token — the SDK may store it on the config instance.
 */
export async function createRelayRemoteBuilderConfig(
	getToken: GetToken
): Promise<BuilderConfig> {
	const token = await getToken();
	const url = getPrivateApiAbsoluteUrl("/polymarket/builder/sign");
	return new BuilderConfig({
		remoteBuilderConfig: {
			url,
			...(token ? { token } : {}),
		},
	});
}
