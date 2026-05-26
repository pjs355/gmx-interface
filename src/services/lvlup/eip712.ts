import type { TypedDataDomain, TypedDataField } from "ethers";
import { ethers } from "ethers";

export type L1Headers = {
	LVLUP_ADDRESS: string;
	LVLUP_SIGNATURE: string;
	LVLUP_TIMESTAMP: string;
	LVLUP_NONCE: string;
};

export type L1SignParams = {
	address: string;
	signer: ethers.Signer;
	nonce?: bigint;
};

export const LVLUP_DOMAIN: TypedDataDomain = {
	name: "LvlupAuthDomain",
	version: "1",
	chainId: 8453,
};

const LVLUP_TYPES: Record<string, TypedDataField[]> = {
	LvlupAuth: [
		{ name: "address", type: "address" },
		{ name: "timestamp", type: "string" },
		{ name: "nonce", type: "uint256" },
		{ name: "message", type: "string" },
	],
};

export async function signL1Headers(params: L1SignParams): Promise<L1Headers> {
	const { address, signer } = params;
	const LVLUP_TIMESTAMP = Date.now().toString();
	const LVLUP_NONCE = (
		params.nonce ?? BigInt(Math.floor(Math.random() * 1_000_000_000))
	).toString();

	const value: Record<string, string> & { nonce: string } = {
		address,
		timestamp: LVLUP_TIMESTAMP,
		nonce: LVLUP_NONCE,
		message: "This message attests that I control the given wallet",
	} as const;

	// ethers v6: signTypedData(domain, types, value)
	type TypedDataSigner = ethers.Signer & {
		signTypedData: (
			domain: TypedDataDomain,
			types: Record<string, TypedDataField[]>,
			value: Record<string, unknown>,
		) => Promise<string>;
	};

	const tdSigner = signer as Partial<TypedDataSigner>;
	if (typeof tdSigner.signTypedData !== "function") {
		throw new Error("Current signer does not support EIP-712 typed-data signing");
	}
	const signature = await tdSigner.signTypedData!(LVLUP_DOMAIN, LVLUP_TYPES, value);

	return {
		LVLUP_ADDRESS: address,
		LVLUP_SIGNATURE: signature,
		LVLUP_TIMESTAMP,
		LVLUP_NONCE,
	};
}
