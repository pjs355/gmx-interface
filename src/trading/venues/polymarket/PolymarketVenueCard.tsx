import { useCallback, useState } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import Button from "@/components/Button/Button";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { useTradingShell } from "@/trading/TradingShellContext";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { useLifiQuoteMutation } from "@/trading/hooks/useLifiBridge";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import type { AccountOverview, LifiQuoteResponse } from "@/types/trading";

const BASE = 8453;
const POLYGON = 137;

type Props = {
	accountOverview: AccountOverview | undefined;
	profileId: string | undefined;
};

function formatAction(a: unknown): string {
	if (a == null) return "";
	if (typeof a === "string") return a;
	if (typeof a === "object" && a && "step" in a) {
		const s = (a as { step?: string; label?: string }).step;
		const l = (a as { label?: string }).label;
		return l || s || JSON.stringify(a);
	}
	return JSON.stringify(a);
}

export function PolymarketVenueCard({ accountOverview, profileId }: Props) {
	const { refetchTradingData, setShellError } = useTradingShell();
	const { getClientForChain } = useSmartWallets();
	const poly = usePolymarketBuilder({ profileId, enabled: Boolean(profileId) });
	const vacm = useVenueAddressChainMap();
	const quoteMutation = useLifiQuoteMutation();
	const [amount, setAmount] = useState("25");
	const [lastQuote, setLastQuote] = useState<LifiQuoteResponse | null>(null);
	const [busy, setBusy] = useState(false);

	const next = formatAction(poly.requiredNextAction);

	const getSignerForChain = useCallback(
		async (chainId: number) => {
			const client = await getClientForChain({ id: chainId });
			if (!client) return null;
			return {
				sendTransaction: (args: {
					to: `0x${string}`;
					data?: `0x${string}`;
					value?: bigint;
				}) => client.sendTransaction(args),
			};
		},
		[getClientForChain],
	);

	const handleQuote = async () => {
		setShellError(null);
		const scw = vacm?.levelup.walletAddress;
		const polySafe = vacm?.polymarket.walletAddress;
		if (!scw || !polySafe) {
			setShellError("Wallet addresses not ready");
			return;
		}
		try {
			const q = await quoteMutation.mutateAsync({
				fromChain: BASE,
				toChain: POLYGON,
				amountHuman: amount,
				fromAddress: scw,
				toAddress: polySafe,
			});
			setLastQuote(q);
		} catch (e) {
			setShellError(getPrivateApiErrorMessage(e));
		}
	};

	const handleExecute = async () => {
		if (!lastQuote) return;
		const scw = vacm?.levelup.walletAddress;
		if (!scw) return;
		setBusy(true);
		setShellError(null);
		try {
			await executeLifiSteps(lastQuote.steps ?? [], getSignerForChain, {
				fromAddress: scw,
				allowanceOwnerByChainId: { [BASE]: scw },
				...(vacm?.dflow.walletAddress?.trim()
					? { solanaTokenOwnerAddress: vacm.dflow.walletAddress.trim() }
					: {}),
			});
			await refetchTradingData();
		} catch (e) {
			setShellError(getPrivateApiErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="venue-card">
			<h3>Polymarket</h3>
			<p>Overview row: {accountOverview?.venues?.length ?? 0} venues</p>
			<p>Next: {next || "—"}</p>
			<label>
				USDC amount (Base → Polygon)
				<input
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					type="number"
					min="1"
				/>
			</label>
			<div className="venue-card__actions">
				<Button
					variant="secondary"
					onClick={handleQuote}
					disabled={
						quoteMutation.isPending ||
						!vacm?.levelup.walletAddress ||
						!vacm?.polymarket.walletAddress
					}
				>
					Quote LI.FI
				</Button>
				<Button variant="secondary" onClick={handleExecute} disabled={busy || !lastQuote}>
					Execute
				</Button>
			</div>
			{lastQuote ? (
				<pre className="venue-card__quote">{JSON.stringify(lastQuote, null, 2)}</pre>
			) : null}
		</div>
	);
}
