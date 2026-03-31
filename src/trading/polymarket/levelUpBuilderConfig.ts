import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { getPrivateApiAbsoluteUrl } from "@/config/privateApiBase";
import type { GetToken } from "@/services/privateApi/client";

/**
 * Creates a real BuilderConfig with remoteBuilderConfig pointing at our
 * backend's `POST /polymarket/builder/sign`. The SDK handles the POST
 * payload `{ method, path, body, timestamp }` and injects the Bearer token.
 *
 * Server: implement `POST /polymarket/builder/sign` like Polymarket’s
 * privy-safe-builder-example (remote `buildHmacSignature`). See
 * `normalizeBuilderSignTimestamp.ts` for timestamp/body/GOTCHAs.
 * **CLOB:** the signing SDK posts GET metadata with **no JSON body**; the route must accept
 * that and sign `method` + `path` only (see Polymarket example caveat vs bare `if (!requestBody) return 400`).
 *
 * Must be called with a fresh Privy access token since the SDK stores it
 * statically on the config instance.
 */
export async function createLevelUpBuilderConfig(
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
