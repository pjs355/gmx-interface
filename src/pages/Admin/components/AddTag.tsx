import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService } from "@/services/api/tagService";
import "./Tags.scss";

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
			tagService.clearCache(); // Clear cache so new tag appears
			onCreated?.();
		} catch (err: any) {
			console.error("error", err);
			setError(err?.message || String(err));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="tag-container">
			<h2 className="tag-title">Add Tag</h2>
			<form onSubmit={handleSubmit} className="tag-form">
				<label className="tag-form-label">
					<span>Label</span>
					<input
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="e.g. ESPORTS"
						required
						className="tag-form-input"
					/>
				</label>
				<label className="tag-form-label">
					<span>Slug (optional)</span>
					<input
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder="lowercase-dashed"
						className="tag-form-input"
					/>
				</label>

				<div className="tag-flags-section">
					<span>Force Show / Hide</span>
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
					</div>
				</div>

				<div className="tag-flags-section">
					<span>Carousel</span>
					<div className="tag-flags-group">
						<button
							type="button"
							onClick={() =>
								setIsCarousel(isCarousel === true ? null : true)
							}
							className={`tag-flag-button ${
								isCarousel ? "active" : ""
							}`}
						>
							Is Carousel
						</button>
					</div>
				</div>

				<label className="tag-form-label">
					<span>Published At (optional)</span>
					<input
						type="datetime-local"
						value={publishedAt}
						onChange={(e) => setPublishedAt(e.target.value)}
						className="tag-form-input"
					/>
				</label>

				<div className="tag-actions">
					<button
						type="submit"
						disabled={submitting}
						className="tag-submit-button"
					>
						{submitting ? "Creating..." : "Create Tag"}
					</button>
					{message && (
						<span className="tag-success-message">{message}</span>
					)}
					{error && (
						<span className="tag-error-message">{error}</span>
					)}
				</div>
			</form>
		</div>
	);
}
