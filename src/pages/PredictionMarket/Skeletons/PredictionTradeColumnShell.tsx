import React from "react";
import { useMedia } from "react-use";
import { PREDICTIONS_TRADE_PANEL_DESKTOP_MEDIA } from "@/pages/Predictions/utils/gameLinkFilters";

type PredictionTradeColumnShellProps = {
	children: React.ReactNode;
	className?: string;
	dataQa?: string;
	dataQaUmbrellaId?: string;
};

export function PredictionTradeColumnShell({
	children,
	className,
	dataQa = "prediction-tradebox",
	dataQaUmbrellaId,
}: PredictionTradeColumnShellProps) {
	const wideTradeDock = useMedia(PREDICTIONS_TRADE_PANEL_DESKTOP_MEDIA);

	if (!wideTradeDock) {
		return <>{children}</>;
	}

	const shellClassName = className
		? `prediction-trade-column-shell ${className}`
		: "prediction-trade-column-shell";

	return (
		<div
			className={shellClassName}
			data-qa={dataQa}
			data-qa-umbrella-id={dataQaUmbrellaId ?? undefined}
		>
			<div className="prediction-trade-column-underlay" aria-hidden />
			<div className="prediction-trade-column-body">{children}</div>
		</div>
	);
}
