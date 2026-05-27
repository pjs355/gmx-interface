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
import type { PrivyWalletListEntry } from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";

export type LevelUpApprovalStatus = {
	isApproved: boolean;
	hasUsdcApproval: boolean;
	hasCtfApproval: boolean;
	hasFeeWrapperApproval: boolean;
};

const POST_APPROVAL_READ_POLL_MS = 2_000;
const POST_APPROVAL_READ_MAX_ATTEMPTS = 6;

function normalizeWallet(wallet: string | null | undefined): string {
	const trimmed = wallet?.trim();
	if (!trimmed || !trimmed.startsWith("0x")) {
		throw new Error("LevelUp approval wallet address is required");
	}
	return trimmed;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePrivySmartWalletAddress(user: User | null): string {
	const smartWalletAccount = (user?.linkedAccounts || []).find(
		(acct: { type?: string }) => acct?.type === "smart_wallet",
	) as { address?: string } | undefined;

	const smartWalletAddress = smartWalletAccount?.address?.trim();
	if (!smartWalletAddress || !smartWalletAddress.startsWith("0x")) {
		throw new Error(
			"LevelUp trading requires a Base smart wallet. Finish account setup and try again.",
		);
	}
	return smartWalletAddress;
}

export type WriteLevelUpApprovalsParams = {
	wallet: string;
	user: User | null;
	privyWallets: readonly PrivyWalletListEntry[];
	getClientForChain: ReturnType<typeof useSmartWallets>["getClientForChain"];
};

/** Send LevelUp USDC + CTF approvals on Base smart wallet (3 calls in one batch). */
export async function writeLevelUpApprovals(params: WriteLevelUpApprovalsParams): Promise<void> {
	const { user, getClientForChain } = params;

	const venueWallet = normalizeWallet(params.wallet);
	const privySmartWallet = resolvePrivySmartWalletAddress(user);
	if (privySmartWallet.toLowerCase() !== venueWallet.toLowerCase()) {
		throw new Error(
			`LevelUp approval wallet mismatch: account overview SCW (${venueWallet}) does not match Privy smart wallet (${privySmartWallet})`,
		);
	}

	const smartWalletClient = await getClientForChain({ id: 8453 });
	if (!smartWalletClient) {
		throw new Error("No Base smart wallet client available");
	}

	const usdcAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
	const ctfAbi = ["function setApprovalForAll(address operator, bool approved)"];

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
}

export type EnsureLevelUpApprovalsParams = WriteLevelUpApprovalsParams & {
	chainRead: ChainReadClient;
};

async function readApprovalsWithPoll(
	chainRead: ChainReadClient,
	wallet: string,
): Promise<LevelUpApprovalStatus> {
	let status = await fetchLevelUpApprovalsChainRead(chainRead, wallet);
	for (let attempt = 1; attempt < POST_APPROVAL_READ_MAX_ATTEMPTS && !status.isApproved; attempt++) {
		await sleep(POST_APPROVAL_READ_POLL_MS);
		status = await fetchLevelUpApprovalsChainRead(chainRead, wallet);
	}
	return status;
}

/** Read via server → auto-approve if needed → read again (trade hot path). */
export async function ensureLevelUpApprovals(params: EnsureLevelUpApprovalsParams): Promise<void> {
	const wallet = normalizeWallet(params.wallet);
	let status = await fetchLevelUpApprovalsChainRead(params.chainRead, wallet);
	if (status.isApproved) return;

	await writeLevelUpApprovals(params);

	status = await readApprovalsWithPoll(params.chainRead, wallet);
	if (!status.isApproved) {
		console.error("[LevelUpApprovals] incomplete after write", {
			wallet,
			hasUsdcApproval: status.hasUsdcApproval,
			hasCtfApproval: status.hasCtfApproval,
			hasFeeWrapperApproval: status.hasFeeWrapperApproval,
		});
		throw new Error(userMessage(TRADE_LEVELUP_APPROVALS_INCOMPLETE));
	}
}
