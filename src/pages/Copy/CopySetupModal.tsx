import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDelegatedActions, usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { SlideModal } from "@/components/Modal/SlideModal";
import { helperToast } from "@/components/Toast/toast";
import { useCreateCopySubscription } from "@/features/trading/hooks/useCopyTrading";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { usePolymarketClobTradingSession } from "@/features/trading/venues/polymarket/session/usePolymarketClobTradingSession";
import { usePolymarketEoaWalletClient } from "@/features/trading/venues/polymarket/wallet/usePolymarketEoaWalletClient";
import type { TraderProfile as TraderProfileData } from "@/services/api/whaleTrackerService";
import { prettySportLabel } from "./prettySportLabel";
import "./Copy.scss";

type Props = {
	leader: TraderProfileData;
	leaderName: string;
	isVisible: boolean;
	setIsVisible: (v: boolean) => void;
};

const MIN_POOL_USD = 10;

/**
 * Stop loss on the pool's live mark-to-market value: if it drops by this
 * share, the copy flattens and halts. "None" maps to 100 percent of the pool.
 */
const STOP_LOSS_CHIPS = [
	{ value: 1, label: "None" },
	{ value: 0.25, label: "-25%" },
	{ value: 0.5, label: "-50%" },
	{ value: 0.75, label: "-75%" },
] as const;

/**
 * Copy setup in the Traders design language: one amount card, one purple
 * confirm. Sport and stop loss hide behind a collapsed Options row as
 * white-active pill chips; the disclosure sits collapsed at the bottom.
 * Desktop renders centered; mobile is the app's drag-to-dismiss bottom
 * sheet (SlideModal).
 */
export function CopySetupModal({ leader, leaderName, isVisible, setIsVisible }: Props) {
	const navigate = useNavigate();
	const { authenticated } = usePrivy();
	const eoa = usePolymarketEoaWalletClient();
	const { delegateWallet } = useDelegatedActions();
	const privateApi = usePrivateApiClient();
	// Mounting the CLOB session syncs L2 credentials to the server, which
	// the copy engine needs for automated order submission.
	const clobSession = usePolymarketClobTradingSession({ enabled: isVisible });
	const createMutation = useCreateCopySubscription();

	const cashQuery = useQuery({
		queryKey: ["copy", "cash-summary"],
		queryFn: () => privateApi.getCashSummary(),
		enabled: isVisible && authenticated,
		staleTime: 30_000,
	});

	const [amount, setAmount] = useState("");
	const [sport, setSport] = useState<string>("all");
	const [stopLossPct, setStopLossPct] = useState<number>(1);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const sports = [...(leader.perSport ?? [])]
		.filter((s) => s.bets > 0)
		.sort((a, b) => b.volumeUsd - a.volumeUsd)
		.map((s) => s.sport);

	// Total spendable balance across every chain the user holds cash on —
	// not just the Polymarket (polygon) leg. This is what they can allocate.
	const cash = cashQuery.data;
	const balance = cash
		? cash.base + cash.polygon + cash.bnb + cash.solana + cash.limitlessMakerBase
		: null;

	const amountNumber = Number(amount);
	const hasAmount = amount.trim().length > 0;
	const amountValid = Number.isFinite(amountNumber) && amountNumber >= MIN_POOL_USD;
	const showMinHint = hasAmount && !amountValid;
	// They typed a valid amount but don't have the funds to allocate it.
	const overBalance =
		amountValid && balance !== null && amountNumber > balance;

	const sessionBlocked = clobSession.blockedReason;
	const canConfirm =
		amountValid && !overBalance && !submitting && eoa.ready && !sessionBlocked;

	async function onConfirm() {
		if (!eoa.address) {
			setError("Wallet not ready. Sign in and try again.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await delegateWallet({ address: eoa.address, chainType: "ethereum" });
			const sub = await createMutation.mutateAsync({
				leaderWallet: leader.wallet,
				allocationMode: "usd",
				allocationInput: amountNumber,
				sportRestriction: sport === "all" ? null : sport,
				stopLossPct,
			});
			// Funding runs in the background — the subscription comes back
			// `activating`, not live yet. The dashboard shows the setup progress
			// and flips to live automatically once funds are in place.
			helperToast.success(`Setting up your copy of ${leaderName}…`);
			setIsVisible(false);
			navigate(`/copy?subscription=${sub.id}`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not start copying.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<SlideModal
			isVisible={isVisible}
			setIsVisible={setIsVisible}
			label={`Copy ${leaderName}`}
			className="copy-setup-modal"
			noDivider
		>
			<div className="copy-setup">
				<div className="copy-setup-amount-card">
					<div className="copy-setup-amount-head">
						<span className="copy-setup-amount-label">Amount</span>
						{balance !== null && (
							<span className="copy-setup-amount-balance">
								Balance ${balance.toFixed(2)}
							</span>
						)}
					</div>
					<div className="copy-setup-amount-row">
						<span className="copy-setup-amount-prefix">$</span>
						<input
							className="copy-setup-amount-input"
							type="number"
							inputMode="decimal"
							min={MIN_POOL_USD}
							placeholder="0"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
					</div>
					{showMinHint && <div className="copy-setup-amount-hint">Minimum ${MIN_POOL_USD}</div>}
					{overBalance && (
						<div className="copy-setup-amount-hint">That’s more than your balance.</div>
					)}
				</div>

				<div className="copy-setup-toggle-block">
					<button
						type="button"
						className="copy-setup-toggle"
						onClick={() => setAdvancedOpen((v) => !v)}
					>
						Advanced
						<span className={`copy-setup-chevron${advancedOpen ? " is-open" : ""}`}>▾</span>
					</button>
					{advancedOpen && (
						<div className="copy-setup-options">
							{sports.length > 1 && (
								<div>
									<div className="copy-setup-option-label">Sport</div>
									<div className="copy-setup-chip-rail">
										<button
											type="button"
											className={`copy-setup-chip${sport === "all" ? " is-active" : ""}`}
											onClick={() => setSport("all")}
										>
											All Sports
										</button>
										{sports.map((s) => (
											<button
												key={s}
												type="button"
												className={`copy-setup-chip${sport === s ? " is-active" : ""}`}
												onClick={() => setSport(s)}
											>
												{prettySportLabel(s)}
											</button>
										))}
									</div>
								</div>
							)}
							<div>
								<div className="copy-setup-option-label">Stop loss</div>
								<div className="copy-setup-chip-rail">
									{STOP_LOSS_CHIPS.map((o) => (
										<button
											key={o.value}
											type="button"
											className={`copy-setup-chip${stopLossPct === o.value ? " is-active" : ""}`}
											onClick={() => setStopLossPct(o.value)}
										>
											{o.label}
										</button>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				{sessionBlocked && <div className="copy-setup-error">{sessionBlocked}</div>}
				{error && <div className="copy-setup-error">{error}</div>}

				{overBalance ? (
					<button
						type="button"
						className="copy-setup-confirm"
						onClick={() => {
							setIsVisible(false);
							navigate("/transfers");
						}}
					>
						Deposit funds
					</button>
				) : (
					<button
						type="button"
						className="copy-setup-confirm"
						disabled={!canConfirm}
						onClick={() => {
							void onConfirm();
						}}
					>
						{submitting ? "Starting…" : "Start copying"}
					</button>
				)}
			</div>
		</SlideModal>
	);
}
