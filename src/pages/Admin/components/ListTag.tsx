import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface AdminTag {
	_id: string;
	label: string;
	slug: string;
	imageUrl?: string;
	createdAt?: string;
	updatedAt?: string;
}

export default function ListTag({
	onEdit,
}: {
	onEdit: (tag: AdminTag) => void;
}) {
	const { getAccessToken } = usePrivy();
	const [tags, setTags] = useState<AdminTag[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState<string>("");

	useEffect(() => {
		let mounted = true;
		async function run() {
			setLoading(true);
			setError(null);
			try {
				const token = await getAccessToken?.();
				if (typeof token === "undefined" || !token) {
					throw new Error("Missing admin access token");
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/tags`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = await resp.json().catch(() => ({} as any));
				if (!resp.ok) {
					throw new Error(json?.error || `HTTP ${resp.status}`);
				}
				if (!Array.isArray(json)) {
					throw new Error("Invalid response for tags list");
				}
				if (mounted) setTags(json as AdminTag[]);
			} catch (err: any) {
				console.error("error", err);
				if (mounted) setError(err?.message || String(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		run();
		return () => {
			mounted = false;
		};
	}, []);

	const filtered = useMemo(() => {
		if (!query) return tags;
		const q = query.toLowerCase();
		return tags.filter(
			(t) =>
				(t.label || "").toLowerCase().includes(q) ||
				(t.slug || "").toLowerCase().includes(q)
		);
	}, [tags, query]);

	async function handleDelete(tag: AdminTag) {
		try {
			const confirmDelete = window.confirm(
				`Delete tag "${tag.label}"? This cannot be undone.`
			);
			if (!confirmDelete) return;
			const token = await getAccessToken?.();
			if (typeof token === "undefined" || !token) {
				throw new Error("Missing admin access token");
			}
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(
				`${base}/admin/tags/${encodeURIComponent(tag._id)}`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				}
			);
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			// Refresh list
			setTags((prev) => prev.filter((t) => t._id !== tag._id));
		} catch (err: any) {
			console.error("error", err);
			alert(err?.message || String(err));
		}
	}

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
					placeholder="Search tags by label or slug"
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
				{error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
			</div>

			<div style={{ display: "grid", gap: 12 }}>
				{filtered.map((t) => (
					<div
						key={t._id}
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
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
								}}
							>
								{t.imageUrl && (
									<img
										src={t.imageUrl}
										alt={t.label}
										style={{
											width: 48,
											height: 48,
											objectFit: "cover",
											borderRadius: 8,
											border: "1px solid rgba(255,255,255,0.2)",
										}}
									/>
								)}
								<div>
									<div style={{ fontWeight: 600 }}>
										{t.label}
									</div>
									<div style={{ fontSize: 12, opacity: 0.8 }}>
										slug: {t.slug}
									</div>
									{t.createdAt && (
										<div
											style={{
												fontSize: 12,
												opacity: 0.8,
											}}
										>
											created:{" "}
											{new Date(
												t.createdAt
											).toLocaleString()}
										</div>
									)}
								</div>
							</div>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									onClick={() => onEdit(t)}
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
								<button
									type="button"
									onClick={() => handleDelete(t)}
									style={{
										padding: "6px 10px",
										border: "1px solid #ef4444",
										borderRadius: 6,
										background: "transparent",
										color: "#ef4444",
										cursor: "pointer",
										whiteSpace: "nowrap",
									}}
								>
									Delete
								</button>
							</div>
						</div>
					</div>
				))}
				{!loading && filtered.length === 0 && (
					<div style={{ opacity: 0.8 }}>No tags found.</div>
				)}
			</div>
		</div>
	);
}
