import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "../../../../lib/predictionApiBase";
import type { AdminTag } from "./ListTag";

export default function EditTag({
	tag,
	onBack,
	onSaved,
}: {
	tag: AdminTag;
	onBack: () => void;
	onSaved?: (next: AdminTag) => void;
}) {
	const { getAccessToken } = usePrivy();
	const [label, setLabel] = useState<string>(tag.label || "");
	const [slug, setSlug] = useState<string>(tag.slug || "");
	const [forceShow, setForceShow] = useState<boolean | null>(
		tag.forceShow ?? null
	);
	const [forceHide, setForceHide] = useState<boolean | null>(
		tag.forceHide ?? null
	);
	const [isCarousel, setIsCarousel] = useState<boolean | null>(
		tag.isCarousel ?? null
	);
	const [publishedAt, setPublishedAt] = useState<string>(() =>
		tag.publishedAt
			? new Date(tag.publishedAt).toISOString().slice(0, 16)
			: ""
	);
	const [saving, setSaving] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		setLabel(tag.label || "");
		setSlug(tag.slug || "");
		setForceShow(tag.forceShow ?? null);
		setForceHide(tag.forceHide ?? null);
		setIsCarousel(tag.isCarousel ?? null);
		setPublishedAt(
			tag.publishedAt
				? new Date(tag.publishedAt).toISOString().slice(0, 16)
				: ""
		);
		setError(null);
		setMessage(null);
	}, [tag._id]);

	const stateSummary = useMemo(() => {
		return [
			forceShow === true ? "forceShow" : null,
			forceHide === true ? "forceHide" : null,
			isCarousel === true ? "carousel" : null,
		]
			.filter(Boolean)
			.join(", ");
	}, [forceShow, forceHide, isCarousel]);

	async function handleSave() {
		setSaving(true);
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
			const body: any = {};
			if (label.trim()) body.label = label.trim();
			if (slug.trim()) body.slug = slug.trim();
			if (typeof forceShow === "boolean") body.forceShow = forceShow;
			if (typeof forceHide === "boolean") body.forceHide = forceHide;
			if (typeof isCarousel === "boolean") body.isCarousel = isCarousel;
			if (publishedAt)
				body.publishedAt = new Date(publishedAt).toISOString();

			const resp = await fetch(
				`${base}/admin/tags/${encodeURIComponent(tag._id)}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify(body),
				}
			);
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setMessage("Saved");
			const nextTag: AdminTag = json as AdminTag;
			onSaved?.(nextTag);
		} catch (err: any) {
			console.error("error", err);
			setError(err?.message || String(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={{ color: "white" }}>
			<button
				type="button"
				onClick={onBack}
				style={{
					marginBottom: 12,
					padding: "6px 10px",
					border: "1px solid white",
					borderRadius: 6,
					background: "transparent",
					color: "white",
				}}
			>
				Back
			</button>
			<h2 style={{ marginBottom: 16 }}>Edit Tag</h2>

			<div style={{ display: "grid", gap: 12, maxWidth: 600 }}>
				<label style={{ display: "grid", gap: 6 }}>
					<span>Label</span>
					<input
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="ESPORTS"
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
					<span>Slug</span>
					<input
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder="esports"
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
					<span>Flags</span>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
							Carousel
						</button>
					</div>
					<div style={{ fontSize: 12, opacity: 0.8 }}>
						{stateSummary}
					</div>
				</div>

				<label style={{ display: "grid", gap: 6 }}>
					<span>Published At</span>
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
						type="button"
						disabled={saving}
						onClick={handleSave}
						style={{ padding: "8px 16px" }}
					>
						{saving ? "Saving..." : "Save"}
					</button>
					{message && (
						<span style={{ color: "#22c55e" }}>{message}</span>
					)}
					{error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
				</div>
			</div>
		</div>
	);
}
