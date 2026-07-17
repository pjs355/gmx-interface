import { useEffect, useRef } from "react";
import {
	BaselineSeries,
	ColorType,
	CrosshairMode,
	LineStyle,
	createChart,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

const POS = "#38d39f";
const NEG = "#ff5e6c";

type PnlPoint = { ts: number; pnl: number };

function fmtAxisUsd(v: number): string {
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
	return `${sign}$${Math.round(abs)}`;
}

function fmtTipUsd(v: number): string {
	const sign = v < 0 ? "-" : "+";
	if (Math.abs(v) < 0.5) return "$0";
	return `${sign}$${Math.round(Math.abs(v)).toLocaleString()}`;
}

function fmtTipDate(tsSec: number, showTime: boolean): string {
	const d = new Date(tsSec * 1000);
	const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	if (!showTime) return date;
	const time = d
		.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
		.toLowerCase();
	return `${date}, ${time}`;
}

/**
 * Interactive PnL line chart on TradingView's open-source Lightweight Charts.
 *
 * Why it replaces the recharts version:
 *  - Points are spaced by INDEX, not by wall-clock distance, so a month with
 *    no trades doesn't leave a dead flat hole. The x axis stays evenly filled.
 *  - Native pan (drag), zoom (wheel / pinch), and kinetic touch scrolling.
 *    Vertical swipes still scroll the page on mobile. Double click resets.
 *  - Baseline series colors the curve green above $0 and red below it.
 */
export function PnlLineChart({ points, height = 220 }: { points: PnlPoint[]; height?: number }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
	const showTimeRef = useRef(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const chart = createChart(el, {
			autoSize: true,
			layout: {
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: "rgba(255, 255, 255, 0.35)",
				fontSize: 10,
			},
			grid: {
				vertLines: { visible: false },
				horzLines: { color: "rgba(255, 255, 255, 0.05)" },
			},
			// Breathing room above and below the curve so it never kisses the edges.
			rightPriceScale: {
				borderVisible: false,
				scaleMargins: { top: 0.15, bottom: 0.15 },
			},
			// Bound to the data: no panning or zooming into empty time on either
			// side of the curve.
			timeScale: {
				borderVisible: false,
				timeVisible: true,
				secondsVisible: false,
				rightOffset: 0,
				fixLeftEdge: true,
				fixRightEdge: true,
				lockVisibleTimeRangeOnResize: true,
			},
			crosshair: {
				mode: CrosshairMode.Magnet,
				vertLine: {
					color: "rgba(255, 255, 255, 0.25)",
					style: LineStyle.Dashed,
					labelBackgroundColor: "#14161b",
				},
				horzLine: {
					color: "rgba(255, 255, 255, 0.25)",
					style: LineStyle.Dashed,
					labelBackgroundColor: "#14161b",
				},
			},
			localization: { priceFormatter: fmtAxisUsd },
			// Horizontal drags pan the chart; vertical swipes keep scrolling the page.
			handleScroll: {
				mouseWheel: true,
				pressedMouseMove: true,
				horzTouchDrag: true,
				vertTouchDrag: false,
			},
			handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
			kineticScroll: { touch: true, mouse: false },
		});

		const series = chart.addSeries(BaselineSeries, {
			baseValue: { type: "price", price: 0 },
			topLineColor: POS,
			topFillColor1: "rgba(56, 211, 159, 0.25)",
			topFillColor2: "rgba(56, 211, 159, 0.02)",
			bottomLineColor: NEG,
			bottomFillColor1: "rgba(255, 94, 108, 0.02)",
			bottomFillColor2: "rgba(255, 94, 108, 0.25)",
			lineWidth: 2,
			priceLineVisible: false,
			lastValueVisible: false,
			crosshairMarkerRadius: 4,
		});

		// Floating scrub tooltip: date + signed dollars at the crosshair.
		chart.subscribeCrosshairMove((param) => {
			const tip = tooltipRef.current;
			if (!tip) return;
			const data = param.seriesData.get(series) as { value?: number } | undefined;
			if (!param.point || param.time === undefined || data?.value === undefined) {
				tip.style.display = "none";
				return;
			}
			const value = data.value;
			tip.innerHTML =
				`<span style="color: rgba(255,255,255,0.5)">${fmtTipDate(
					param.time as number,
					showTimeRef.current,
				)}</span>` +
				`<span style="color: ${value < 0 ? NEG : POS}; font-weight: 700; margin-left: 8px">${fmtTipUsd(value)}</span>`;
			tip.style.display = "block";
			const w = tip.offsetWidth;
			const x = Math.max(0, Math.min(param.point.x - w / 2, el.clientWidth - w));
			tip.style.left = `${x}px`;
			tip.style.top = "0px";
		});

		// Double click brings the whole curve back into view after zooming around.
		chart.subscribeDblClick(() => chart.timeScale().fitContent());

		chartRef.current = chart;
		seriesRef.current = series;
		return () => {
			chartRef.current = null;
			seriesRef.current = null;
			chart.remove();
		};
	}, []);

	useEffect(() => {
		const series = seriesRef.current;
		const chart = chartRef.current;
		if (!series || !chart) return;
		// Lightweight Charts needs strictly ascending, unique timestamps: sort,
		// then collapse same-second events keeping the latest value.
		const bySec = new Map<number, number>();
		for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
			bySec.set(Math.floor(p.ts / 1000), p.pnl);
		}
		const rows = [...bySec.entries()].map(([time, value]) => ({
			time: time as UTCTimestamp,
			value,
		}));
		series.setData(rows);
		// Tooltip shows the clock only when the whole series spans under 2 days.
		showTimeRef.current =
			rows.length > 1 && rows[rows.length - 1].time - rows[0].time < 2 * 24 * 3600;
		chart.timeScale().fitContent();
	}, [points]);

	return (
		<div style={{ position: "relative", width: "100%", height }}>
			<div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
			<div
				ref={tooltipRef}
				style={{
					display: "none",
					position: "absolute",
					zIndex: 2,
					pointerEvents: "none",
					padding: "5px 9px",
					borderRadius: 8,
					background: "#14161b",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					fontSize: 12,
					whiteSpace: "nowrap",
				}}
			/>
		</div>
	);
}
