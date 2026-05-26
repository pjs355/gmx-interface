import type { ApprovalStatus } from "@/features/trading/venues/polymarket/trade/approvalTxs";
import type { VenueTokenApprovalRead } from "./venueTokenApprovalTypes";

export function mapPolymarketTokenApprovalRead(status: ApprovalStatus): VenueTokenApprovalRead {
	const ctf = Object.values(status.erc1155).every(Boolean);
	const collateral =
		Object.values(status.usdc).every(Boolean) && Object.values(status.collateral).every(Boolean);
	return {
		ready: status.allApproved,
		ctf,
		collateral,
	};
}
