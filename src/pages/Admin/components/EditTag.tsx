import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService } from "@/services/api/tagService";
import type { AdminTag } from "./ListTag";
import "./Tags.scss";

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
			tagService.clearCache(); // Clear cache so updated tag appears
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
		<div className="tag-container">
			<button type="button" onClick={onBack} className="tag-back-button">
				Back
			</button>
			<h2 className="tag-title">Edit Tag</h2>

			<div className="tag-form">
				<label className="tag-form-label">
					<span>Label</span>
					<input
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="ESPORTS"
						className="tag-form-input"
					/>
				</label>
				<label className="tag-form-label">
					<span>Slug</span>
					<input
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder="esports"
						className="tag-form-input"
					/>
				</label>

				<div className="tag-flags-section">
					<span>Flags</span>
					<div className="tag-flags-group">
						<button
							type="button"
							onClick={() =>
								setForceShow(forceShow === true ? null : true)
							}
							className={`tag-flag-button ${
								forceShow ? "active" : ""
							}`}
						>
							Force Show
						</button>
						<button
							type="button"
							onClick={() =>
								setForceHide(forceHide === true ? null : true)
							}
							className={`tag-flag-button ${
								forceHide ? "active" : ""
							}`}
						>
							Force Hide
						</button>
						<button
							type="button"
							onClick={() =>
								setIsCarousel(isCarousel === true ? null : true)
							}
							className={`tag-flag-button ${
								isCarousel ? "active" : ""
							}`}
						>
							Carousel
						</button>
					</div>
					<div className="tag-state-summary">{stateSummary}</div>
				</div>

				<label className="tag-form-label">
					<span>Published At</span>
					<input
						type="datetime-local"
						value={publishedAt}
						onChange={(e) => setPublishedAt(e.target.value)}
						className="tag-form-input"
					/>
				</label>

				<div className="tag-actions">
					<button
						type="button"
						disabled={saving}
						onClick={handleSave}
						className="tag-submit-button"
					>
						{saving ? "Saving..." : "Save"}
					</button>
					{message && (
						<span className="tag-success-message">{message}</span>
					)}
					{error && (
						<span className="tag-error-message">{error}</span>
					)}
				</div>
			</div>
		</div>
	);
}
