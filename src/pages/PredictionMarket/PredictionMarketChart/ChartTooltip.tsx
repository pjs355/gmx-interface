export function ChartTooltip({
	primaryTitle,
	secondaryTitle,
	isVsSingleMarket,
	formatTime,
}: {
	primaryTitle: string;
	secondaryTitle: string | null;
	isVsSingleMarket: boolean;
	formatTime: (ts: number) => string;
}) {
	return ({ active, payload }: any) => {
		if (active && payload && payload.length) {
			const data = payload[0].payload;
			return (
				<div className="prediction-chart-tooltip">
					<p className="tooltip-time">{formatTime(data.timestamp)}</p>
					{data.percentage !== null && (
						<p className="tooltip-price primary-tooltip">
							<span className="tooltip-label">{primaryTitle}:</span>
							<span className="tooltip-value primary-value">{data.percentage.toFixed(2)}%</span>
						</p>
					)}
					{(secondaryTitle || isVsSingleMarket) && data.secondPercentage !== null && (
						<p className="tooltip-price second-tooltip">
							<span className="tooltip-label">{secondaryTitle || ""}:</span>
							<span className="tooltip-value second-value">
								{data.secondPercentage.toFixed(2)}%
							</span>
						</p>
					)}
				</div>
			);
		}
		return null;
	};
}
