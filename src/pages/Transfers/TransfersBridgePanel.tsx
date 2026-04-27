import { formatBridgeQuoteUsdLines } from "@/trading/lifi/quoteDisplay";
import type { BridgeEndpoint } from "./useBridgeFlow";
import { useBridgeFlow } from "./useBridgeFlow";

const FROM_ENDPOINT_OPTIONS: { value: BridgeEndpoint; label: string }[] = [
	{ value: "levelup", label: "LevelUp (Base)" },
	{ value: "polymarket", label: "Polymarket (Polygon)" },
	{ value: "bnb", label: "Predict (BNB)" },
	{ value: "solana", label: "DFlow (Solana)" },
];

const TO_ENDPOINT_OPTIONS: { value: BridgeEndpoint; label: string }[] = [
	...FROM_ENDPOINT_OPTIONS,
	{ value: "limitless", label: "Limitless maker (Base)" },
];

export function TransfersBridgePanel() {
	const flow = useBridgeFlow();

	const balances = flow.fundingBalances;

	const quoteUsd = flow.quote ? formatBridgeQuoteUsdLines(flow.quote) : null;

	const levelupUsd = formatWalletUsd(balances.data?.baseUsdcHuman ?? null, balances.isLoading);
	const limitlessUsd = formatWalletUsd(
		balances.data?.baseLimitlessUsdcHuman ?? null,
		balances.isLoading
	);
	const polymarketUsd = formatWalletUsd(
		balances.data?.polygonUsdcEHuman ?? null,
		balances.isLoading
	);
	const bnbUsd = formatWalletUsd(balances.data?.bscUsdtHuman ?? null, balances.isLoading);
	const solanaUsd = formatWalletUsd(balances.data?.solanaUsdcHuman ?? null, balances.isLoading);

	const fromBalanceDisplay = balanceForEndpoint(flow.fromEndpoint, {
		levelup: levelupUsd,
		limitless: limitlessUsd,
		polymarket: polymarketUsd,
		bnb: bnbUsd,
		solana: solanaUsd,
	});
	const toBalanceDisplay = balanceForEndpoint(flow.toEndpoint, {
		levelup: levelupUsd,
		limitless: limitlessUsd,
		polymarket: polymarketUsd,
		bnb: bnbUsd,
		solana: solanaUsd,
	});

	const showOverviewDegraded =
		flow.funding.accountOverviewQuery.isError && !flow.funding.polymarketSafe;

	const needsPolymarketRelay = flow.needsPolymarketRelay;

	const routeUsesPolymarket =
		flow.fromEndpoint === "polymarket" || flow.toEndpoint === "polymarket";

	const routeUsesLimitless = flow.toEndpoint === "limitless";

	const canConfirm =
		flow.quoteAppliesToCurrentInput &&
		flow.hasSufficientSourceBalance &&
		!flow.isQuoting &&
		!flow.isConfirming &&
		(!needsPolymarketRelay || flow.relay.walletReady);

	const amountNum = parseFloat(flow.amount);
	const insufficientFundsButton =
		flow.canQuote &&
		Number.isFinite(amountNum) &&
		amountNum > 0 &&
		!balances.isLoading &&
		!flow.hasSufficientSourceBalance &&
		!flow.isQuoting &&
		!flow.isConfirming;

	return (
		<section className="transfers-bridge" aria-label="Stablecoin transfer between chains">
			<h2 className="transfers-bridge__title">Transfer funds</h2>
			<p className="transfers-bridge__sub">
				Move USDC between Base (LevelUp smart wallet, Limitless maker), Polygon, and Solana, or USDT
				on BNB (Predict), via LI.FI. The source wallet is chosen for you from your balances; amount
				is always in that wallet&apos;s stablecoin.
			</p>

			{flow.funding.isLoading || flow.relay.polymarketLoading ? (
				<p className="transfers-bridge__muted">{"Loading account…"}</p>
			) : null}

			{needsPolymarketRelay && flow.relay.walletError ? (
				<p className="transfers-bridge__warn" role="status">
					Embedded wallet: {flow.relay.walletError}
				</p>
			) : null}

			{routeUsesPolymarket && flow.funding.polymarketAccountNotFound ? (
				<p className="transfers-bridge__warn" role="status">
					Polymarket account not found (
					<code className="transfers-bridge__code">404</code>). Check{" "}
					<code className="transfers-bridge__code">VITE_PRIVATE_API_BASE</code> and{" "}
					<code className="transfers-bridge__code">VITE_POLYMARKET_ACCOUNT_PATH</code>.
				</p>
			) : null}

			{routeUsesPolymarket && flow.funding.polymarketAccountQuery.isError ? (
				<p className="transfers-bridge__warn" role="status">
					<strong>Polymarket account request failed:</strong>{" "}
					{flow.funding.polymarketAccountQuery.errorMessage ?? "Unknown error"}
				</p>
			) : null}

			{showOverviewDegraded ? (
				<p className="transfers-bridge__muted transfers-bridge__hint" role="status">
					Account overview could not be loaded. Some venue metadata may be missing until the API
					succeeds.
				</p>
			) : null}

			{routeUsesPolymarket &&
			flow.funding.accountOverviewNotFound &&
			!flow.funding.polymarketSafe ? (
				<p className="transfers-bridge__warn" role="status">
					Account overview returned <code className="transfers-bridge__code">404</code> and no
					Polymarket Safe was found. Confirm API paths and that your profile matches the server.
				</p>
			) : null}

			{routeUsesPolymarket && !flow.safeOk && flow.funding.polymarketAccount ? (
				<div className="transfers-bridge__warn" role="status">
					Integration mode is{" "}
					<code className="transfers-bridge__code">{String(flow.funding.integrationMode)}</code>
					{" — expected "}
					<code className="transfers-bridge__code">builder_privy_safe</code> for standard setup.
				</div>
			) : null}

			<div className="transfers-bridge__from-to" role="group" aria-label="Transfer route">
				<div className="transfers-bridge__from-to-field">
					<span className="transfers-bridge__label">From</span>
					<div
						id="bridge-from"
						className="transfers-bridge__select transfers-bridge__select--readonly"
						role="status"
					>
						{FROM_ENDPOINT_OPTIONS.find((o) => o.value === flow.fromEndpoint)?.label ??
							flow.fromEndpoint}
					</div>
					<p className="transfers-bridge__muted transfers-bridge__hint" role="note">
						Source wallet is picked automatically from the largest on-screen balance among
						wallets you can sign from for this destination (withdrawals use quote-based ranking
						on the server instead).
					</p>
				</div>
				<span className="transfers-bridge__arrow" aria-hidden>
					→
				</span>
				<div className="transfers-bridge__from-to-field">
					<label className="transfers-bridge__label" htmlFor="bridge-to">
						To
					</label>
					<select
						id="bridge-to"
						className="transfers-bridge__select"
						value={flow.toEndpoint}
						onChange={(e) => flow.setToEndpoint(e.target.value as BridgeEndpoint)}
					>
						{TO_ENDPOINT_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="transfers-bridge__from-to-balances" aria-label="Balances for selected wallets">
				<div className="transfers-bridge__from-to-balance-row">
					<span className="transfers-bridge__balance-amount">{fromBalanceDisplay}</span>
					<span className="transfers-bridge__balance-spacer" aria-hidden />
					<span className="transfers-bridge__balance-amount transfers-bridge__balance-amount--to">
						{toBalanceDisplay}
					</span>
				</div>
			</div>

			<div className="transfers-bridge__row">
				<label className="transfers-bridge__label" htmlFor="bridge-amt">
					Amount
				</label>
				<input
					id="bridge-amt"
					className="transfers-bridge__input"
					value={flow.amount}
					placeholder="0"
					onChange={(e) => {
						const raw = e.target.value.replace(/[^\d.]/g, "");
						const firstDot = raw.indexOf(".");
						let v =
							firstDot === -1
								? raw
								: `${raw.slice(0, firstDot)}.${raw.slice(firstDot + 1).replace(/\./g, "")}`;
						if (!v.includes(".")) {
							v = v.replace(/^0+(?=\d)/, "");
						} else {
							const [intPart, frac = ""] = v.split(".");
							const intNorm =
								intPart.replace(/^0+(?=\d)/, "") || (frac.length > 0 ? "0" : "");
							v = v.endsWith(".") && frac === "" ? `${intNorm}.` : `${intNorm}.${frac}`;
						}
						flow.setAmount(v);
					}}
					onFocus={() => {
						if (flow.amount === "0") flow.setAmount("");
					}}
					inputMode="decimal"
				/>
			</div>

			{flow.quote ? (
				<div
					className={`transfers-bridge__quote-summary${
						flow.quoteAppliesToCurrentInput ? "" : " transfers-bridge__quote-summary--stale"
					}`}
				>
					{quoteUsd?.sendUsd ? (
						<div className="transfers-bridge__quote-line">
							<span className="transfers-bridge__quote-k">Send</span>
							<span className="transfers-bridge__quote-v">{quoteUsd.sendUsd}</span>
						</div>
					) : null}
					{quoteUsd?.receiveUsd ? (
						<div className="transfers-bridge__quote-line">
							<span className="transfers-bridge__quote-k">Receive</span>
							<span className="transfers-bridge__quote-v">{quoteUsd.receiveUsd}</span>
						</div>
					) : null}
					{quoteUsd?.feeUsd ? (
						<div className="transfers-bridge__quote-line">
							<span className="transfers-bridge__quote-k">Fee</span>
							<span className="transfers-bridge__quote-v">{quoteUsd.feeUsd}</span>
						</div>
					) : null}
				</div>
			) : null}

			<div className="transfers-bridge__actions transfers-bridge__actions--single">
				<button
					type="button"
					className="transfers-bridge__btn transfers-bridge__btn--primary"
					disabled={!canConfirm}
					onClick={() => void flow.handleConfirm()}
				>
					{flow.isConfirming
						? flow.phase === "polling"
							? "Transferring…"
							: "Preparing & signing…"
						: insufficientFundsButton
							? "Insufficient funds"
							: "Confirm transfer"}
				</button>
			</div>

			{flow.statusNote ? (
				<p className="transfers-bridge__status">{flow.statusNote}</p>
			) : null}
			{flow.error ? (
				<p className="transfers-bridge__error" role="alert">
					{flow.error}
				</p>
			) : null}
			{flow.phase === "done" ? (
				<p className="transfers-bridge__success">Transfer successful.</p>
			) : null}
		</section>
	);
}

function formatWalletUsd(humanBalance: string | null | undefined, isLoading: boolean) {
	if (humanBalance == null) return isLoading ? "…" : "—";
	const n = parseFloat(humanBalance);
	if (!Number.isFinite(n)) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(n);
}

function balanceForEndpoint(
	e: BridgeEndpoint,
	map: {
		levelup: string;
		limitless: string;
		polymarket: string;
		bnb: string;
		solana: string;
	}
): string {
	switch (e) {
		case "levelup":
			return map.levelup;
		case "limitless":
			return map.limitless;
		case "polymarket":
			return map.polymarket;
		case "bnb":
			return map.bnb;
		case "solana":
			return map.solana;
	}
}
