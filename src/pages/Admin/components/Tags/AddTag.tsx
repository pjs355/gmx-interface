import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { tagService, type TagPayload } from "@/services/api/tagService";
import { uploadTagImage } from "@/services/firebase/firebaseStorage";
import "./Tags.scss";
import {
	adminErrorMessage,
	formatAdminErrorForUser,
	ADMIN_MISSING_ACCESS_TOKEN,
	ADMIN_TAG_LABEL_REQUIRED,
} from "@/errors";

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
			const trimmedLabel = label.trim();
			if (trimmedLabel.length === 0) {
				throw new Error(adminErrorMessage(ADMIN_TAG_LABEL_REQUIRED));
			}
			const token = await getAccessToken?.();
			if (typeof token === "undefined" || !token) {
				throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
			}
			const trimmedSlug = slug.trim();
			const payload: TagPayload = {
				label: trimmedLabel,
			};
			if (trimmedSlug.length > 0) {
				payload.slug = trimmedSlug;
			}

			// Upload image if selected
			if (image) {
				setUploadingImage(true);
				try {
					const baseSlugSource = trimmedSlug.length > 0 ? trimmedSlug : trimmedLabel;
					const slugForUpload = baseSlugSource.toLowerCase().replace(/\s+/g, "-");
					const result = await uploadTagImage(image, slugForUpload);
					payload.imageUrl = result.url;
				} finally {
					setUploadingImage(false);
				}
			}
			await tagService.createTag(payload, token);
			setMessage("Created");
			setLabel("");
			setSlug("");
			setImage(null);
			setImagePreview(null);
			onCreated?.();
		} catch (err: unknown) {
			console.error("error", err);
			setError(formatAdminErrorForUser(err));
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
							<img src={imagePreview} alt="Preview" className="tag-image-preview" />
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
					{uploadingImage && <div className="tag-uploading-text">Uploading...</div>}
				</div>

				<div className="tag-actions">
					<button type="submit" disabled={submitting} className="tag-submit-button">
						{submitting ? "Creating..." : "Create Tag"}
					</button>
					{message && <span className="tag-success-message">{message}</span>}
					{error && <span className="tag-error-message">{error}</span>}
				</div>
			</form>
		</div>
	);
}
