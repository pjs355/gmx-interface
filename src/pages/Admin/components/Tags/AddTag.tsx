import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService } from "@/services/api/tagService";
import { uploadTagImage } from "@/services/firebase/firebaseStorage";
import "./Tags.scss";

export default function AddTag({ onCreated }: { onCreated?: () => void }) {
	const { getAccessToken } = usePrivy();
	const [label, setLabel] = useState<string>("");
	const [slug, setSlug] = useState<string>("");
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	// Image upload states
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [uploadingImage, setUploadingImage] = useState<boolean>(false);

	const handleImageSelect = (file: File) => {
		if (!file.type.startsWith("image/")) {
			alert("Please select an image file");
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			alert("Image size must be less than 5MB");
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const previewUrl = e.target?.result as string;
			setImage(file);
			setImagePreview(previewUrl);
		};
		reader.readAsDataURL(file);
	};

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
			};

			// Upload image if selected
			if (image) {
				setUploadingImage(true);
				const slugForUpload =
					slug.trim() ||
					label.trim().toLowerCase().replace(/\s+/g, "-");
				const result = await uploadTagImage(image, slugForUpload);
				body.imageUrl = result.url;
				setUploadingImage(false);
			}
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
			setImage(null);
			setImagePreview(null);
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

				<div className="tag-form-label">
					<span>Tag Image</span>
					{imagePreview && (
						<div className="tag-image-preview-container">
							<img
								src={imagePreview}
								alt="Preview"
								className="tag-image-preview"
							/>
							<button
								type="button"
								onClick={() => {
									setImage(null);
									setImagePreview(null);
								}}
								className="tag-image-remove-button"
							>
								Remove
							</button>
						</div>
					)}
					<input
						type="file"
						accept="image/*"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) handleImageSelect(file);
						}}
						className="tag-file-input"
					/>
					{uploadingImage && (
						<div className="tag-uploading-text">Uploading...</div>
					)}
				</div>

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
