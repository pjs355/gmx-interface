import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCopySettings, useUpdateCopySettings } from "@/features/trading/hooks/useCopyTrading";

/**
 * Copy trading defaults on the account page. These apply to new copy
 * subscriptions; a running copy keeps the values it was activated with.
 */
export default function CopyTradingSettingsSection() {
	const { authenticated } = usePrivy();
	const settingsQuery = useCopySettings({ enabled: authenticated });
	const updateMutation = useUpdateCopySettings();

	const [stopLossPct, setStopLossPct] = useState("");
	const [minTradeUsd, setMinTradeUsd] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const s = settingsQuery.data;
		if (!s) return;
		setStopLossPct(String(Math.round(s.defaultStopLossPct * 100)));
		setMinTradeUsd(String(s.defaultMinLeaderTradeUsd));
	}, [settingsQuery.data]);

	if (!authenticated) return null;

	const stopLoss = Number(stopLossPct) / 100;
	const minTrade = Number(minTradeUsd);
	const valid =
		Number.isFinite(stopLoss) &&
		stopLoss >= 0.05 &&
		stopLoss <= 1 &&
		Number.isFinite(minTrade) &&
		minTrade >= 0;

	async function onSave() {
		setError(null);
		try {
			await updateMutation.mutateAsync({
				defaultStopLossPct: stopLoss,
				defaultMinLeaderTradeUsd: minTrade,
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Save failed.");
		}
	}

	return (
		<div className="Details-info-section">
			<div className="Details-username-label">Copy trading</div>
			<div className="Details-preferences-list">
				<label className="Details-preference-item">
					<div className="Details-preference-content">
						<span className="Details-preference-label">Stop loss (%)</span>
						<span className="Details-preference-description">
							Copying halts and exits when your pool's live value drops by this share.
							100 means no stop loss.
						</span>
					</div>
					<input
						type="number"
						className="Details-username-input"
						style={{ maxWidth: 110 }}
						min={5}
						max={100}
						step={5}
						value={stopLossPct}
						onChange={(e) => setStopLossPct(e.target.value)}
					/>
				</label>

				<label className="Details-preference-item">
					<div className="Details-preference-content">
						<span className="Details-preference-label">Minimum leader trade ($)</span>
						<span className="Details-preference-description">
							Leader trades below this are not copied. 0 copies everything.
						</span>
					</div>
					<input
						type="number"
						className="Details-username-input"
						style={{ maxWidth: 110 }}
						min={0}
						step={10}
						value={minTradeUsd}
						onChange={(e) => setMinTradeUsd(e.target.value)}
					/>
				</label>

			</div>

			{error && (
				<div className="Details-error">
					<span>{error}</span>
				</div>
			)}

			<div className="Details-preferences-actions">
				<button
					className="Details-button"
					onClick={() => {
						void onSave();
					}}
					disabled={!valid || updateMutation.isPending || settingsQuery.isLoading}
				>
					{updateMutation.isPending ? "Saving..." : saved ? "Saved" : "Save copy settings"}
				</button>
			</div>
		</div>
	);
}
