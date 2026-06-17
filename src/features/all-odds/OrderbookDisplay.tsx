import type { OrderbookData } from "@/types/odds-monitor";
import { formatCentsLabel } from "@/features/odds-display/oddsDisplayFormat";

function formatAge(timestamp?: number | null): string {
	if (!timestamp) return "Never";
	const age = Date.now() - timestamp;
	if (age < 1000) return "Just now";
	if (age < 60000) return `${Math.floor(age / 1000)}s ago`;
	if (age < 3600000) return `${Math.floor(age / 60000)}m ago`;
	return `${Math.floor(age / 3600000)}h ago`;
}

export interface OrderbookDisplayProps {
	orderbook: OrderbookData | null | undefined;
	teamName: string;
}

export function OrderbookDisplay({ orderbook, teamName }: OrderbookDisplayProps) {
	if (!orderbook) {
		return <div className="all-odds-ob-empty">No orderbook data</div>;
	}

	const bids = orderbook.bids ?? [];
	const asks = orderbook.asks ?? [];
	const lastUpdate = orderbook.lastWsUpdate ?? orderbook.lastUpdated;

	return (
		<div className="all-odds-ob">
			<div className="all-odds-ob-header">
				<span className="all-odds-ob-team">{teamName}</span>
				<span className="all-odds-ob-age">{formatAge(lastUpdate)}</span>
			</div>
			<div className="all-odds-ob-grid">
				<div>
					<div className="all-odds-ob-side all-odds-ob-bids">BIDS ({bids.length})</div>
					{bids.length === 0 ? (
						<div className="all-odds-ob-muted">No bids</div>
					) : (
						bids.slice(0, 8).map((level, i) => (
							<div key={i} className="all-odds-ob-level">
								<span>{formatCentsLabel(level.price)}</span>
								<span>{Number(level.size).toFixed(0)}</span>
							</div>
						))
					)}
				</div>
				<div>
					<div className="all-odds-ob-side all-odds-ob-asks">ASKS ({asks.length})</div>
					{asks.length === 0 ? (
						<div className="all-odds-ob-muted">No asks</div>
					) : (
						asks.slice(0, 8).map((level, i) => (
							<div key={i} className="all-odds-ob-level">
								<span>{formatCentsLabel(level.price)}</span>
								<span>{Number(level.size).toFixed(0)}</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
