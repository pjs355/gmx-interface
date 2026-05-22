import Button from "components/Button/Button";
import { hexToRgba } from "@/helpers/predictionUtils";
import { getBorderColorForSelected } from "../hooks/useTradeBoxTeamPresentation";

export interface TradeBoxOutcomeButtonsProps {
	outcomeSelection: "yes" | "no";
	yesTeamLabel: string;
	noTeamLabel: string;
	yesPriceCents: string;
	noPriceCents: string;
	isVsSingle: boolean;
	yesTeamColor: string;
	noTeamColor: string;
	yesTeamTextSolid: string;
	yesTeamTextTint: string;
	noTeamTextSolid: string;
	noTeamTextTint: string;
	tradeInteractionLocked: boolean;
	onPositionChange: (position: "yes" | "no") => void;
}

export default function TradeBoxOutcomeButtons({
	outcomeSelection,
	yesTeamLabel,
	noTeamLabel,
	yesPriceCents,
	noPriceCents,
	isVsSingle,
	yesTeamColor,
	noTeamColor,
	yesTeamTextSolid,
	yesTeamTextTint,
	noTeamTextSolid,
	noTeamTextTint,
	tradeInteractionLocked,
	onPositionChange,
}: TradeBoxOutcomeButtonsProps) {
	return (
		<div
			className={`position-selector${tradeInteractionLocked ? " trade-control--locked" : ""}`}
			style={{ marginBottom: 24 }}
			title={
				tradeInteractionLocked ? "Trade in progress — outcome locked" : undefined
			}
		>
			<Button
				qa="tradebox-position-yes"
				variant="secondary"
				disabled={tradeInteractionLocked}
				onClick={() => onPositionChange("yes")}
				className={`position-btn ${outcomeSelection === "yes" ? "selected primary" : ""}`}
				style={
					isVsSingle
						? {
								background:
									outcomeSelection === "yes"
										? yesTeamColor
										: hexToRgba(yesTeamColor, 0.35),
								color:
									outcomeSelection === "yes"
										? yesTeamTextSolid
										: yesTeamTextTint,
								border: `2px solid ${
									outcomeSelection === "yes"
										? getBorderColorForSelected(yesTeamColor)
										: hexToRgba(yesTeamColor, 0.35)
								}`,
							}
						: undefined
				}
				onMouseEnter={(e) => {
					if (isVsSingle && outcomeSelection !== "yes") {
						e.currentTarget.style.border = `2px solid ${yesTeamColor}`;
					}
				}}
				onMouseLeave={(e) => {
					if (isVsSingle && outcomeSelection !== "yes") {
						e.currentTarget.style.border = `2px solid ${hexToRgba(yesTeamColor, 0.35)}`;
					}
				}}
			>
				<strong className="position-btn__label-row">
					<span className="position-btn__name">{yesTeamLabel}</span>
					<span className="position-btn__price">{yesPriceCents}</span>
				</strong>
			</Button>

			<Button
				qa="tradebox-position-no"
				variant="secondary"
				disabled={tradeInteractionLocked}
				onClick={() => onPositionChange("no")}
				className={`position-btn ${outcomeSelection === "no" ? "selected secondary" : ""}`}
				style={
					isVsSingle
						? {
								background:
									outcomeSelection === "no"
										? noTeamColor
										: hexToRgba(noTeamColor, 0.35),
								color:
									outcomeSelection === "no"
										? noTeamTextSolid
										: noTeamTextTint,
								border: `2px solid ${
									outcomeSelection === "no"
										? getBorderColorForSelected(noTeamColor)
										: hexToRgba(noTeamColor, 0.35)
								}`,
							}
						: undefined
				}
				onMouseEnter={(e) => {
					if (isVsSingle && outcomeSelection !== "no") {
						e.currentTarget.style.border = `2px solid ${noTeamColor}`;
					}
				}}
				onMouseLeave={(e) => {
					if (isVsSingle && outcomeSelection !== "no") {
						e.currentTarget.style.border = `2px solid ${hexToRgba(noTeamColor, 0.35)}`;
					}
				}}
			>
				<strong className="position-btn__label-row">
					<span className="position-btn__name">{noTeamLabel}</span>
					<span className="position-btn__price">{noPriceCents}</span>
				</strong>
			</Button>
		</div>
	);
}
