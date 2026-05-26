import type {
	ChainReadClient,
	LevelUpApprovalsChainReadResult,
} from "@/features/trading/chain-reads/chainReadTypes";

export async function fetchLevelUpApprovalsChainRead(
	chainRead: ChainReadClient,
	walletAddress: string,
): Promise<LevelUpApprovalsChainReadResult> {
	return chainRead.postChainRead({
		venue: "levelup",
		kind: "approvals",
		walletAddress,
	});
}
