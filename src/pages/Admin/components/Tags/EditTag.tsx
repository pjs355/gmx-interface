import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService } from "@/services/api/tagService";
import { uploadTagImage } from "@/services/firebase/firebaseStorage";
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
	const [saving, setSaving] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	// Image upload states
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(
		(tag as any).imageUrl || null
	);
	const [imageUrl, setImageUrl] = useState<string>(
		(tag as any).imageUrl || ""
	);
	const [uploadingImage, setUploadingImage] = useState<boolean>(false);

	useEffect(() => {
		setLabel(tag.label || "");
		setSlug(tag.slug || "");
		setImageUrl((tag as any).imageUrl || "");
		setImagePreview((tag as any).imageUrl || null);
		setImage(null);
		setError(null);
		setMessage(null);
	}, [tag._id]);

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

			// Upload image if selected
			if (image) {
				setUploadingImage(true);
				const slugForUpload =
					slug.trim() ||
					label.trim().toLowerCase().replace(/\s+/g, "-");
				const result = await uploadTagImage(image, slugForUpload);
				body.imageUrl = result.url;
				setUploadingImage(false);
			} else if (imageUrl) {
				body.imageUrl = imageUrl;
			}

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

			// Clear uploaded image after successful save
			if (image) {
				setImage(null);
				setImagePreview(imageUrl || null);
			}

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
									setImagePreview(imageUrl || null);
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
