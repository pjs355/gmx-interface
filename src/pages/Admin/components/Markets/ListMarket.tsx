import { useEffect, useMemo, useState } from "react";
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";

interface ListMarketProps {
	onEdit: (umbrella: Umbrella) => void;
	refreshKey?: number;
}

export default function ListMarket({ onEdit, refreshKey }: ListMarketProps) {
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [query, setQuery] = useState<string>("");

	useEffect(() => {
		let mounted = true;
		setLoading(true);
		umbrellaDataService
			.fetchAllUmbrellas()
			.then((list) => {
				if (!mounted) return;
				setUmbrellas(Array.isArray(list) ? list : []);
			})
			.catch(() => {})
			.finally(() => mounted && setLoading(false));
		return () => {
			mounted = false;
		};
	}, [refreshKey]);

	const filtered = useMemo(() => {
		const base = query
			? umbrellas.filter((u) =>
					u.displayName.toLowerCase().includes(query.toLowerCase())
			  )
			: umbrellas;
		return base;
	}, [umbrellas, query]);

	return (
		<div style={{ color: "white" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginBottom: 12,
				}}
			>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search umbrellas"
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						minWidth: 260,
					}}
				/>
				{loading && <span style={{ opacity: 0.8 }}>Loading…</span>}
			</div>

			<div style={{ display: "grid", gap: 12 }}>
				{filtered.map((u) => {
					const isActive = Boolean((u as any).active);
					const statusColor = isActive ? "#22c55e" : "#ef4444";
					const statusLabel = isActive ? "Active" : "Inactive";
					return (
					<div
						key={u._id}
						style={{
							border: "1px solid rgba(255,255,255,0.2)",
							borderRadius: 8,
							padding: 12,
							background: "rgba(255,255,255,0.03)",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								gap: 12,
							}}
						>
							<div>
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<span
										style={{
											display: "inline-flex",
											width: 10,
											height: 10,
											borderRadius: "50%",
											background: statusColor,
											boxShadow: `0 0 6px ${
												isActive ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"
											}`,
										}}
										title={statusLabel}
									/>
									<div style={{ fontWeight: 600 }}>
										{u.displayName}
									</div>
								</div>
								<div style={{ fontSize: 12, opacity: 0.8 }}>
									ID: {u._id}
								</div>
								{u.children?.length ? (
									<div style={{ fontSize: 12, opacity: 0.8 }}>
										Questions: {u.children.length}
									</div>
								) : (
									<div style={{ fontSize: 12, opacity: 0.8 }}>
										No questions
									</div>
								)}
							</div>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									onClick={() => onEdit(u)}
									style={{
										padding: "6px 10px",
										border: "1px solid white",
										borderRadius: 6,
										background: "rgba(255,255,255,0.2)",
										color: "white",
										cursor: "pointer",
										whiteSpace: "nowrap",
									}}
								>
									Edit
								</button>
							</div>
						</div>
					</div>
				);
			})}
				{!loading && filtered.length === 0 && (
					<div style={{ opacity: 0.8 }}>No umbrellas found.</div>
				)}
			</div>
		</div>
	);
}
