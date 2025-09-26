import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "../../../../lib/predictionApiBase";

export default function AddTag({ onCreated }: { onCreated?: () => void }) {
	const { getAccessToken } = usePrivy();
	const [label, setLabel] = useState<string>("");
	const [slug, setSlug] = useState<string>("");
	const [forceShow, setForceShow] = useState<boolean | null>(null);
	const [forceHide, setForceHide] = useState<boolean | null>(null);
	const [isCarousel, setIsCarousel] = useState<boolean | null>(null);
	const [publishedAt, setPublishedAt] = useState<string>("");
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		setMessage(null);
		try {
			if (!label.trim()) {
				throw new Error("label is required");
			}
			const token = await getAccessToken?.();
			if (typeof token === "undefined" || !token) {
				throw new Error("Missing admin access token");
			}
			const base = getPredictionApiBaseUrl();
			const body: any = {
				label: label.trim(),
				slug: slug.trim() || undefined,
				forceShow:
					typeof forceShow === "boolean" ? forceShow : undefined,
				forceHide:
					typeof forceHide === "boolean" ? forceHide : undefined,
				isCarousel:
					typeof isCarousel === "boolean" ? isCarousel : undefined,
				publishedAt: publishedAt
					? new Date(publishedAt).toISOString()
					: undefined,
			};
			const resp = await fetch(`${base}/admin/tags`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(body),
			});
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setMessage("Created");
			setLabel("");
			setSlug("");
			setForceShow(null);
			setForceHide(null);
			setIsCarousel(null);
			setPublishedAt("");
			onCreated?.();
		} catch (err: any) {
			console.error("error", err);
			setError(err?.message || String(err));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h2 style={{ marginBottom: 16 }}>Add Tag</h2>
			<form
				onSubmit={handleSubmit}
				style={{ display: "grid", gap: 12, maxWidth: 600 }}
			>
				<label style={{ display: "grid", gap: 6 }}>
					<span>Label</span>
					<input
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="e.g. ESPORTS"
						required
						style={{
							padding: 8,
							color: "cyan",
							border: "1px solid white",
							borderRadius: 6,
							background: "transparent",
						}}
					/>
				</label>
				<label style={{ display: "grid", gap: 6 }}>
					<span>Slug (optional)</span>
					<input
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder="lowercase-dashed"
						style={{
							padding: 8,
							color: "cyan",
							border: "1px solid white",
							borderRadius: 6,
							background: "transparent",
						}}
					/>
				</label>

				<div style={{ display: "grid", gap: 6 }}>
					<span>Force Show / Hide</span>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={() =>
								setForceShow(forceShow === true ? null : true)
							}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: forceShow
									? "rgba(255,255,255,0.2)"
									: "transparent",
								color: "white",
							}}
						>
							Force Show
						</button>
						<button
							type="button"
							onClick={() =>
								setForceHide(forceHide === true ? null : true)
							}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: forceHide
									? "rgba(255,255,255,0.2)"
									: "transparent",
								color: "white",
							}}
						>
							Force Hide
						</button>
					</div>
				</div>

				<div style={{ display: "grid", gap: 6 }}>
					<span>Carousel</span>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={() =>
								setIsCarousel(isCarousel === true ? null : true)
							}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: isCarousel
									? "rgba(255,255,255,0.2)"
									: "transparent",
								color: "white",
							}}
						>
							Is Carousel
						</button>
					</div>
				</div>

				<label style={{ display: "grid", gap: 6 }}>
					<span>Published At (optional)</span>
					<input
						type="datetime-local"
						value={publishedAt}
						onChange={(e) => setPublishedAt(e.target.value)}
						style={{
							padding: 8,
							color: "cyan",
							border: "1px solid white",
							borderRadius: 6,
							background: "transparent",
						}}
					/>
				</label>

				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<button
						type="submit"
						disabled={submitting}
						style={{ padding: "8px 16px" }}
					>
						{submitting ? "Creating..." : "Create Tag"}
					</button>
					{message && (
						<span style={{ color: "#22c55e" }}>{message}</span>
					)}
					{error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
				</div>
			</form>
		</div>
	);
}
