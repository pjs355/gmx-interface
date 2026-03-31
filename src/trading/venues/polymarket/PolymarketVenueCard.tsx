import { useCallback, useState } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import Button from "@/components/Button/Button";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { useTradingShell } from "@/trading/TradingShellContext";
import { executeLifiSteps } from "@/trading/lifi/executeLifiSteps";
import { useLifiQuoteMutation } from "@/trading/hooks/useLifiBridge";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { useTradingWallets } from "@/trading/useWallets";
import type { AccountOverview, LifiQuoteResponse } from "@/types/trading";
import "@/trading/shell/TradingShell.scss";

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
	const wallets = useTradingWallets(accountOverview, poly.data);
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
					chainId?: number;
				}) => client.sendTransaction(args),
			};
		},
		[getClientForChain]
	);

	const parsedAmount = parseFloat(amount);
	const isAmountValid =
		Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= 100_000;

	const handleQuote = async () => {
		setShellError(null);
		if (!isAmountValid) {
			setShellError("Enter a valid amount between 0 and 100,000.");
			return;
		}
		if (!wallets.baseSmartWallet || !wallets.polymarketSafe) {
			setShellError("Need Base smart wallet and Polymarket Safe address to quote.");
			return;
		}
		try {
			const q = await quoteMutation.mutateAsync({
				fromChain: BASE,
				toChain: POLYGON,
				amountHuman: String(parsedAmount),
				fromAddress: wallets.baseSmartWallet,
				toAddress: wallets.polymarketSafe,
			});
			setLastQuote(q);
		} catch (e) {
			setShellError(getPrivateApiErrorMessage(e));
		}
	};

	const handleExecuteQuote = async () => {
		if (!lastQuote?.steps?.length) return;
		setBusy(true);
		setShellError(null);
		try {
			await executeLifiSteps(lastQuote.steps, getSignerForChain, {
				fromAddress: wallets.baseSmartWallet,
			});
			await poly.verifyOnChain.mutateAsync({});
			await refetchTradingData();
		} catch (e) {
			setShellError(getPrivateApiErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="venue-card">
			<h3 className="venue-card__title">Polymarket</h3>
			<p className="venue-card__muted">
				Next: {next || "—"}
				{poly.isFetching ? " (loading…)" : ""}
			</p>
			<div className="venue-card__actions">
				<label className="venue-card__muted" htmlFor="pm-fund-amt">
					Fund Safe (USDC, human amount)
				</label>
				<input
					id="pm-fund-amt"
					className="venue-card__input"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					inputMode="decimal"
				/>
				<Button
					variant="primary"
					disabled={
						!profileId ||
						quoteMutation.isPending ||
						!wallets.baseSmartWallet ||
						!wallets.polymarketSafe ||
						!isAmountValid
					}
					onClick={() => void handleQuote()}
				>
					Get LI.FI quote
				</Button>
				<Button
					variant="secondary"
					disabled={!lastQuote?.steps?.length || busy}
					onClick={() => void handleExecuteQuote()}
				>
					{busy ? "Executing…" : "Run quote steps on wallet"}
				</Button>
				{poly.verifyOnChain.isPending ? (
					<p className="venue-card__muted">Verifying on-chain…</p>
				) : null}
			</div>
		</div>
	);
}
