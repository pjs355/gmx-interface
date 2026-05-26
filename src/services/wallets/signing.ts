import { Signer } from "ethers";

export type SignatureDomain = {
	name: string;
	version: string;
	chainId: number;
	verifyingContract: string;
};

export type SignatureTypes = Record<string, { name: string; type: string }[]>;

export type SignTypedDataParams = {
	signer: Signer | any; // Allow both Ethers Signer and Privy wallet
	types: SignatureTypes;
	typedData: Record<string, any>;
	domain: SignatureDomain;
};

export async function signTypedData({ signer, domain, types, typedData }: SignTypedDataParams) {
	// filter inputs
	for (const [key, value] of Object.entries(domain)) {
		if (value === undefined) {
			delete (domain as Record<string, unknown>)[key];
		}
	}

	for (const [key, value] of Object.entries(types)) {
		if (value === undefined) {
			delete types[key];
		}
	}

	for (const [key, value] of Object.entries(typedData)) {
		if (value === undefined) {
			delete typedData[key];
		}
	}

	// For Privy wallets, try to use their signTypedData method directly
	if (signer && typeof signer.signTypedData === "function") {
		try {
			console.log("🔐 Using signer.signTypedData method");
			return await signer.signTypedData(domain, types, typedData);
		} catch (e: any) {
			console.log("⚠️ signTypedData failed:", e.message);
			throw e;
		}
	}

	// If we get here, the signer doesn't support signTypedData
	throw new Error("Signer does not support signTypedData - please use a compatible wallet");
}

export function splitSignature(signature: string): { r: string; s: string; v: number } {
	const sig = signature.slice(2);
	const r = "0x" + sig.substring(0, 64);
	const s = "0x" + sig.substring(64, 128);
	const v = parseInt(sig.substring(128, 130), 16);

	// ECDSA signature components
	return { r, s, v };
}
