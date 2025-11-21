import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { tagService, type TagPayload } from "@/services/api/tagService";
import {
	uploadTagImage,
	uploadTagBannerImage,
} from "@/services/firebase/firebaseStorage";
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

	// Banner image upload states
	const [bannerImage, setBannerImage] = useState<File | null>(null);
	const [bannerImagePreview, setBannerImagePreview] = useState<string | null>(
		(tag as any).bannerImageUrl || null
	);
	const [bannerImageUrl, setBannerImageUrl] = useState<string>(
		(tag as any).bannerImageUrl || ""
	);
	const [uploadingBannerImage, setUploadingBannerImage] =
		useState<boolean>(false);

	useEffect(() => {
		setLabel(tag.label || "");
		setSlug(tag.slug || "");
		setImageUrl((tag as any).imageUrl || "");
		setImagePreview((tag as any).imageUrl || null);
		setImage(null);
		setBannerImageUrl((tag as any).bannerImageUrl || "");
		setBannerImagePreview((tag as any).bannerImageUrl || null);
		setBannerImage(null);
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

	const handleBannerImageSelect = (file: File) => {
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
			setBannerImage(file);
			setBannerImagePreview(previewUrl);
		};
		reader.readAsDataURL(file);
	};

	async function handleSave() {
		setSaving(true);
		setError(null);
		setMessage(null);
		try {
			const trimmedLabel = label.trim();
			if (trimmedLabel.length === 0) {
				throw new Error("label is required");
			}
			const token = await getAccessToken?.();
			if (typeof token === "undefined" || !token) {
				throw new Error("Missing admin access token");
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
					const baseSlugSource =
						trimmedSlug.length > 0 ? trimmedSlug : trimmedLabel;
					const slugForUpload = baseSlugSource
						.toLowerCase()
						.replace(/\s+/g, "-");
					const result = await uploadTagImage(image, slugForUpload);
					payload.imageUrl = result.url;
				} finally {
					setUploadingImage(false);
				}
			} else if (imageUrl) {
				payload.imageUrl = imageUrl;
			}

			// Upload banner image if selected
			if (bannerImage) {
				setUploadingBannerImage(true);
				try {
					const baseSlugSource =
						trimmedSlug.length > 0 ? trimmedSlug : trimmedLabel;
					const slugForUpload = baseSlugSource
						.toLowerCase()
						.replace(/\s+/g, "-");
					const result = await uploadTagBannerImage(
						bannerImage,
						slugForUpload
					);
					payload.bannerImageUrl = result.url;
				} finally {
					setUploadingBannerImage(false);
				}
			} else if (bannerImageUrl) {
				payload.bannerImageUrl = bannerImageUrl;
			}

			const json = await tagService.updateTag(tag._id, payload, token);
			setMessage("Saved");

			// Clear uploaded images after successful save
			const nextTag: AdminTag = json as AdminTag;
			if (image) {
				setImage(null);
			}
			const rawNextImageUrl = (nextTag as any).imageUrl;
			let computedImageUrl = "";
			if (typeof rawNextImageUrl === "string") {
				computedImageUrl = rawNextImageUrl;
			}
			setImageUrl(computedImageUrl);
			const previewValue =
				computedImageUrl.length > 0 ? computedImageUrl : null;
			setImagePreview(previewValue);

			if (bannerImage) {
				setBannerImage(null);
			}
			const rawNextBannerImageUrl = (nextTag as any).bannerImageUrl;
			let computedBannerImageUrl = "";
			if (typeof rawNextBannerImageUrl === "string") {
				computedBannerImageUrl = rawNextBannerImageUrl;
			}
			setBannerImageUrl(computedBannerImageUrl);
			const bannerPreviewValue =
				computedBannerImageUrl.length > 0
					? computedBannerImageUrl
					: null;
			setBannerImagePreview(bannerPreviewValue);
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

				<div className="tag-form-label">
					<span>
						Banner Image (fallback: uses tag image if not set)
					</span>
					{bannerImagePreview && (
						<div className="tag-image-preview-container">
							<img
								src={bannerImagePreview}
								alt="Banner Preview"
								className="tag-image-preview"
							/>
							<button
								type="button"
								onClick={() => {
									setBannerImage(null);
									setBannerImagePreview(
										bannerImageUrl || null
									);
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
							if (file) handleBannerImageSelect(file);
						}}
						className="tag-file-input"
					/>
					{uploadingBannerImage && (
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
