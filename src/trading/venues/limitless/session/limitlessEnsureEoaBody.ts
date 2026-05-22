import { ethers } from "ethers";

export type LimitlessEnsureEoaSigner = {
	signMessage(message: string): Promise<string>;
	getAddress(): Promise<string>;
};

/**
 * Builds `POST /api/limitless/ensure-account` JSON when the server must create
 * a partner sub-account (`ownerId` missing). `signingMessage` is **hex UTF-8**
 * of the plain text from `GET /auth/signing-message`, matching Limitless
 * `x-signing-message` and server `verifyLimitlessPartnerEoaPersonalSignature`.
 */
export async function buildLimitlessEoaEnsureBodyFromSigner(input: {
	getPlainSigningMessage: () => Promise<string>;
	signer: LimitlessEnsureEoaSigner;
}): Promise<{ limitlessEoa: { account: string; signingMessage: string; signature: string } }> {
	const plain = await input.getPlainSigningMessage();
	const signature = await input.signer.signMessage(plain);
	const signingMessage = ethers.hexlify(ethers.toUtf8Bytes(plain));
	const account = ethers.getAddress(await input.signer.getAddress());
	return { limitlessEoa: { account, signingMessage, signature } };
}
