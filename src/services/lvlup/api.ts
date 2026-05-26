import type { L1Headers } from "./eip712";
import { signL1Headers } from "./eip712";
import type { L2Headers, L2Secrets } from "./hmac";
import { signL2 } from "./hmac";
import type { ethers } from "ethers";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export type ApiKeyInfo = {
	key: string;
	createdAt: string;
	lastUsedAt?: string | null;
	disabled?: boolean;
};

export type CreateKeyResult = {
	key: string;
	secret: string;
	passphrase: string;
};

export async function createApiKey(
	passphrase: string,
	address: string,
	signer: ethers.Signer,
): Promise<CreateKeyResult> {
	const headers: L1Headers = await signL1Headers({ address, signer });
	const base = getPredictionApiBaseUrl();
	const path = `/api/auth/api-key`;
	const resp = await fetch(`${base}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: JSON.stringify({ passphrase }),
	});
	const json = await resp.json();
	if (!resp.ok) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	const payload = json && (json as any).data ? (json as any).data : json;
	return payload as CreateKeyResult;
}

export async function listApiKeys(auth: L2Secrets): Promise<ApiKeyInfo[]> {
	const path = "/api/auth/api-keys";
	const headers: L2Headers = await signL2({ method: "GET", path }, auth);
	const base = getPredictionApiBaseUrl();
	const resp = await fetch(`${base}${path}`, {
		headers,
	});
	const json = await resp.json();
	if (!resp.ok) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	let arr: any[] = [];
	if (Array.isArray(json?.data?.keys)) arr = json.data.keys;
	else if (Array.isArray(json?.keys)) arr = json.keys;
	else if (Array.isArray(json?.data)) arr = json.data;
	else if (Array.isArray(json)) arr = json;
	return arr as ApiKeyInfo[];
}

export async function listApiKeysBySession(
	address: string,
	accessToken: string,
): Promise<ApiKeyInfo[]> {
	const base = getPredictionApiBaseUrl();
	const path = `/api/auth/my-api-keys`;
	const url = `${base}${path}?address=${encodeURIComponent(address)}`;
	const resp = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const json = await resp.json();
	if (!resp.ok || !json?.success) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.keys) ? json.keys : [];
	return arr as ApiKeyInfo[];
}

export async function listApiKeysByAddress(
	address: string,
	accessToken?: string,
): Promise<ApiKeyInfo[]> {
	const base = getPredictionApiBaseUrl();
	const path = `/api/auth/api-keys/by-address/${address}`;
	const resp = await fetch(`${base}${path}`, {
		headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
	});
	const json = await resp.json();
	if (!resp.ok || !json?.success) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	const keys = Array.isArray(json?.data?.keys)
		? json.data.keys
		: Array.isArray(json?.keys)
			? json.keys
			: [];
	return keys as ApiKeyInfo[];
}

export async function deleteApiKey(auth: L2Secrets, key: string): Promise<{ success: boolean }> {
	const path = "/api/auth/api-key";
	const headers: L2Headers = await signL2({ method: "DELETE", path }, auth);
	const base = getPredictionApiBaseUrl();
	const resp = await fetch(`${base}${path}`, {
		method: "DELETE",
		headers: { ...headers, "Content-Type": "application/json" },
		body: JSON.stringify({ key }),
	});
	const json = await resp.json();
	if (!resp.ok) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	return { success: true };
}

export async function getMe(auth: L2Secrets): Promise<{ address: string }> {
	const path = "/api/auth/me";
	const headers: L2Headers = await signL2({ method: "GET", path }, auth);
	const base = getPredictionApiBaseUrl();
	const resp = await fetch(`${base}${path}`, { headers });
	const json = await resp.json();
	if (!resp.ok || !json?.success || !json?.data) {
		throw new Error(json?.error || `HTTP ${resp.status}`);
	}
	return { address: String(json.data.address || "") };
}

export function generatePassphrase(length = 40): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
	const arr = new Uint8Array(length);
	crypto.getRandomValues(arr);
	return Array.from(arr, (n) => alphabet[n % alphabet.length]).join("");
}
