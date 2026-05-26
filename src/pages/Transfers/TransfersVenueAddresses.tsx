import React, { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useAccountData, useVenueAddressChainMap } from "@/context/AccountDataContext";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import { levelUpQueryKeys } from "@/features/trading/venues/levelup/levelUpQueryKeys";
import { POLYMARKET_APPROVALS_QUERY_KEY } from "@/features/trading/venues/polymarket/approvals/usePolymarketApprovalsStatus";
import { LIMITLESS_APPROVALS_QUERY_KEY } from "@/features/trading/venues/limitless/approvals/useLimitlessApprovalsStatus";
import { pickWarmupMarketSlugFromEnsureData } from "@/features/trading/venues/limitless/session/limitlessEnsurePayload";
import { buildTransfersVenueAddressRows } from "./transfersVenueAddressRows";
import { useTransfersVenueApprovalStatus } from "./useTransfersVenueApprovalStatus";
import { useTransfersVenueMongoApprovalStatus } from "./useTransfersVenueMongoApprovalStatus";
import type { TransfersVenueApprovalBadge } from "./transfersVenueApprovalStatus";
import type { TransfersVenueMongoApprovalDebug } from "./transfersVenueMongoApprovalStatus";

function formatAddress(value: string | undefined): string {
	if (!value?.trim()) return "—";
	return value.trim();
}

function formatCurrency(value: number | null): string {
	if (value === null || !isFinite(value)) return "0.00";
	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function VenueApprovalBadge({ badge }: { badge: TransfersVenueApprovalBadge }) {
	if (badge.status === "loading") {
		return (
			<span className="transfers-addresses__badge transfers-addresses__badge--loading">
				Checking…
			</span>
		);
	}
	if (badge.status === "ready") {
		return (
			<span className="transfers-addresses__badge transfers-addresses__badge--ready">
				{badge.label}
			</span>
		);
	}
	return (
		<span className="transfers-addresses__badge transfers-addresses__badge--needs">
			{badge.label}
		</span>
	);
}

function VenueMongoDebugBadge({ mongo }: { mongo: TransfersVenueMongoApprovalDebug }) {
	const statusClass =
		mongo.ready === null
			? "transfers-addresses__badge--loading"
			: mongo.ready
				? "transfers-addresses__badge--ready"
				: "transfers-addresses__badge--needs";
	return (
		<div className="transfers-addresses__debug-mongo">
			<span
				className={`transfers-addresses__badge transfers-addresses__badge--debug ${statusClass}`}
			>
				✓ Debug · {mongo.label}
			</span>
			<code className="transfers-addresses__debug-detail">{mongo.detail}</code>
		</div>
	);
}

export function TransfersVenueAddresses() {
	const collateral = useCollateralTokens();
	const { walletIsLoading, refresh } = useAccountData();
	const vacm = useVenueAddressChainMap();
	const queryClient = useQueryClient();
	const profileQuery = useCurrentProfile({ enabled: true });
	const profileId = profileQuery.data?._id;

	const [copiedAddressKey, setCopiedAddressKey] = useState<string | null>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);

	const rows = useMemo(() => buildTransfersVenueAddressRows(vacm, collateral), [vacm, collateral]);

	const approvalByVenue = useTransfersVenueApprovalStatus(detailsOpen);
	const mongoApprovalByVenue = useTransfersVenueMongoApprovalStatus(detailsOpen);
	const showMongoApprovalDebug = !import.meta.env.PROD;

	const refreshApprovalStatus = useCallback(async () => {
		const levelUpWallet = vacm?.levelup.walletAddress?.trim();
		if (levelUpWallet) {
			await queryClient.invalidateQueries({
				queryKey: levelUpQueryKeys.approvals(levelUpWallet),
			});
		}
		await queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
		const polymarketWallet = vacm?.polymarket.walletAddress?.trim();
		if (polymarketWallet) {
			await queryClient.invalidateQueries({
				queryKey: [POLYMARKET_APPROVALS_QUERY_KEY, polymarketWallet.toLowerCase()],
			});
		}
		const limitlessWallet = vacm?.limitless.walletAddress?.trim();
		if (limitlessWallet && profileId) {
			const ensureData = queryClient.getQueryData(
				tradingQueryKeys.limitlessEnsureAccount(profileId),
			);
			const slug = pickWarmupMarketSlugFromEnsureData(ensureData);
			if (slug) {
				await queryClient.invalidateQueries({
					queryKey: [LIMITLESS_APPROVALS_QUERY_KEY, limitlessWallet.toLowerCase(), slug],
				});
			}
		}
		await Promise.all([refresh.polyAccount(), refresh.predictAccount(), refresh.dflowProof()]);
	}, [
		queryClient,
		vacm?.levelup.walletAddress,
		vacm?.polymarket.walletAddress,
		vacm?.limitless.walletAddress,
		profileId,
		refresh,
	]);

	const handleDetailsToggle = useCallback(
		(e: React.SyntheticEvent<HTMLDetailsElement>) => {
			const open = e.currentTarget.open;
			setDetailsOpen(open);
			if (open) {
				void refreshApprovalStatus();
			}
		},
		[refreshApprovalStatus],
	);

	const handleCopyAddress = useCallback(async (key: string, raw: string | undefined) => {
		const v = raw?.trim();
		if (!v) return;
		try {
			await navigator.clipboard.writeText(v);
			setCopiedAddressKey(key);
			window.setTimeout(() => setCopiedAddressKey(null), 2000);
		} catch (err) {
			console.error("error", err);
		}
	}, []);

	return (
		<details
			className="transfers-addresses"
			aria-label="Your wallet addresses"
			onToggle={handleDetailsToggle}
		>
			<summary className="transfers-addresses__summary">Your addresses</summary>
			<div className="transfers-addresses__inner">
				<p className="transfers-addresses__notice">
					If sending funds manually, please ensure that you are using the correct currency by chain.
					LevelUp does not currently support recovering incorrect sent funds.
				</p>

				{rows.map((row) => {
					const addressLoading = walletIsLoading && !String(row.address ?? "").trim();
					const badge = approvalByVenue[row.venue];
					const chainLabel = `${row.venueLabel} · ${row.chainLabel} (${row.collateralLabel})`;

					return (
						<div key={row.venue} className="transfers-addresses__item">
							<div className="transfers-addresses__chain">
								<span className="transfers-addresses__chain-label">
									{chainLabel}
									{row.walletKindLabel ? (
										<span className="transfers-addresses__wallet-kind">{row.walletKindLabel}</span>
									) : null}
								</span>
								<span className="transfers-addresses__balance">
									{collateral.isFetched ? (
										`$${formatCurrency(row.balance)}`
									) : (
										<span className="transfers-skeleton transfers-skeleton--balance" />
									)}
								</span>
							</div>
							<div className="transfers-addresses__value-row">
								{addressLoading ? (
									<span className="transfers-skeleton transfers-skeleton--address" />
								) : (
									<code className="transfers-addresses__value">{formatAddress(row.address)}</code>
								)}
								<button
									type="button"
									className="Details-copy-button Details-copy-button--compact"
									title="Copy address"
									aria-label={`Copy ${row.venueLabel} address`}
									disabled={!String(row.address ?? "").trim() || addressLoading}
									onClick={() => void handleCopyAddress(row.copyKey, row.address)}
								>
									{copiedAddressKey === row.copyKey ? "✓" : "Copy"}
								</button>
							</div>
							<div className="transfers-addresses__badge-row">
								<VenueApprovalBadge badge={badge} />
							</div>
							{showMongoApprovalDebug ? (
								<VenueMongoDebugBadge mongo={mongoApprovalByVenue[row.venue]} />
							) : null}
						</div>
					);
				})}

				{profileId != null &&
				!queryClient.getQueryData(tradingQueryKeys.limitlessEnsureAccount(profileId)) ? (
					<p className="transfers-addresses__hint">
						Limitless trading status appears after your account finishes onboarding on that venue.
					</p>
				) : null}
			</div>
		</details>
	);
}
