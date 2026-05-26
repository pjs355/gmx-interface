import { ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import type { User } from "@privy-io/react-auth";
import {
	getCTFAddress,
	getExchangeAddress,
	getFeeWrapperAddress,
	getUSDCAddress,
} from "config/addresses";
import { userMessage, TRADE_LEVELUP_APPROVALS_INCOMPLETE } from "@/errors";
import type { ChainReadClient } from "@/features/trading/chain-reads/chainReadTypes";
import { fetchLevelUpApprovalsChainRead } from "@/features/trading/chain-reads/levelUpChainRead";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/features/trading/chains/waitPrivyBaseTxReceipt";
import {
	findEvmPrivyEmbeddedWallet,
	type PrivyWalletListEntry,
} from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";

export type LevelUpApprovalStatus = {
	isApproved: boolean;
	hasUsdcApproval: boolean;
	hasCtfApproval: boolean;
	hasFeeWrapperApproval: boolean;
};

function normalizeWallet(wallet: string | null | undefined): string {
	const trimmed = wallet?.trim();
	if (!trimmed || !trimmed.startsWith("0x")) {
		throw new Error("LevelUp approval wallet address is required");
	}
	return trimmed;
}

export type WriteLevelUpApprovalsParams = {
	wallet: string;
	user: User | null;
	privyWallets: readonly PrivyWalletListEntry[];
	getClientForChain: ReturnType<typeof useSmartWallets>["getClientForChain"];
};

/** Send LevelUp USDC + CTF approvals on Base (SCW batch or external wallet). */
export async function writeLevelUpApprovals(params: WriteLevelUpApprovalsParams): Promise<void> {
	const { user, privyWallets, getClientForChain } = params;

	const smartWalletAccount = (user?.linkedAccounts || []).find(
		(acct: { type?: string }) => acct?.type === "smart_wallet",
	) as { address?: string } | undefined;

	const embeddedWallet = findEvmPrivyEmbeddedWallet(privyWallets) as
		| { address?: string }
		| undefined;

	const externalWallet = privyWallets.find(
		(w) => w?.type === "wallet" || w?.connectorType !== "privy",
	);

	const useSmartWallet = Boolean(smartWalletAccount?.address) || Boolean(embeddedWallet);
	const useExternalWallet = Boolean(externalWallet) && !useSmartWallet;

	const usdcAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
	const ctfAbi = ["function setApprovalForAll(address operator, bool approved)"];

	if (useSmartWallet) {
		const smartWalletClient = await getClientForChain({ id: 8453 });
		if (!smartWalletClient) {
			throw new Error("No smart wallet client available");
		}

		const usdcInterface = new ethers.Interface(usdcAbi);
		const ctfInterface = new ethers.Interface(ctfAbi);

		const usdcExchangeApproval = usdcInterface.encodeFunctionData("approve", [
			getExchangeAddress(),
			ethers.MaxUint256,
		]);
		const ctfApproval = ctfInterface.encodeFunctionData("setApprovalForAll", [
			getExchangeAddress(),
			true,
		]);
		const usdcFeeWrapperApproval = usdcInterface.encodeFunctionData("approve", [
			getFeeWrapperAddress(),
			ethers.MaxUint256,
		]);

		console.log("🔐 Sending batched approval transaction (3 approvals in 1 signature)...");
		const batched = await smartWalletClient.sendTransaction({
			calls: [
				{
					to: getUSDCAddress() as `0x${string}`,
					data: usdcExchangeApproval as `0x${string}`,
					value: 0n,
				},
				{
					to: getCTFAddress() as `0x${string}`,
					data: ctfApproval as `0x${string}`,
					value: 0n,
				},
				{
					to: getUSDCAddress() as `0x${string}`,
					data: usdcFeeWrapperApproval as `0x${string}`,
					value: 0n,
				},
			],
		});
		await waitForBaseTransactionSuccess(
			parsePrivyEvmTxHash(batched),
			"LevelUp batched USDC/CTF approvals",
		);
		console.log("✅ Batched approval complete!");
		return;
	}

	if (useExternalWallet && externalWallet) {
		if (!externalWallet.getEthereumProvider) {
			throw new Error("External wallet provider unavailable");
		}
		const eip1193 = await externalWallet.getEthereumProvider();
		const provider = new ethers.BrowserProvider(eip1193 as never);
		const signer = await provider.getSigner();

		console.log("🔐 Approving USDC for Exchange...");
		const usdcContract = new ethers.Contract(getUSDCAddress(), usdcAbi, signer);
		const tx1 = await usdcContract.approve(getExchangeAddress(), ethers.MaxUint256);
		await tx1.wait();

		console.log("🔐 Approving CTF for Exchange...");
		const ctfContract = new ethers.Contract(getCTFAddress(), ctfAbi, signer);
		const tx2 = await ctfContract.setApprovalForAll(getExchangeAddress(), true);
		await tx2.wait();

		console.log("🔐 Approving USDC for Fee Wrapper...");
		const tx3 = await usdcContract.approve(getFeeWrapperAddress(), ethers.MaxUint256);
		await tx3.wait();
		console.log("✅ All approvals complete!");
		return;
	}

	throw new Error("No compatible wallet found");
}

export type EnsureLevelUpApprovalsParams = WriteLevelUpApprovalsParams & {
	chainRead: ChainReadClient;
};

/** Read via server → auto-approve if needed → read again (trade hot path). */
export async function ensureLevelUpApprovals(params: EnsureLevelUpApprovalsParams): Promise<void> {
	const wallet = normalizeWallet(params.wallet);
	let status = await fetchLevelUpApprovalsChainRead(params.chainRead, wallet);
	if (status.isApproved) return;

	await writeLevelUpApprovals(params);

	status = await fetchLevelUpApprovalsChainRead(params.chainRead, wallet);
	if (!status.isApproved) {
		throw new Error(userMessage(TRADE_LEVELUP_APPROVALS_INCOMPLETE));
	}
}
