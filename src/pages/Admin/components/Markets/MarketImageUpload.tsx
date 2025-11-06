interface MarketImageUploadProps {
	image1: File | null;
	image2: File | null;
	image1Preview: string | null;
	image2Preview: string | null;
	image1Url?: string;
	image2Url?: string;
	uploadingImage: "image1" | "image2" | null;
	onImage1Select: (file: File) => void;
	onImage2Select: (file: File) => void;
	onImage1Remove: () => void;
	onImage2Remove: () => void;
}

export default function MarketImageUpload({
	image1Preview,
	image2Preview,
	uploadingImage,
	onImage1Select,
	onImage2Select,
	onImage1Remove,
	onImage2Remove,
}: MarketImageUploadProps) {
	const handleFileChange = (
		e: React.ChangeEvent<HTMLInputElement>,
		imageType: "image1" | "image2"
	) => {
		const file = e.target.files?.[0];
		if (file) {
			if (imageType === "image1") {
				onImage1Select(file);
			} else {
				onImage2Select(file);
			}
		}
	};

	return (
		<div
			style={{
				marginTop: 16,
				borderTop: "1px solid rgba(255,255,255,0.2)",
				paddingTop: 12,
			}}
		>
			<div style={{ marginBottom: 12, fontWeight: 600 }}>
				Images (Optional)
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 16,
				}}
			>
				{/* Image 1 */}
				<div style={{ display: "grid", gap: 8 }}>
					<label style={{ fontSize: 14, fontWeight: 500 }}>
						Banner Image
					</label>
					<div style={{ display: "grid", gap: 8 }}>
						{image1Preview && (
							<div
								style={{
									position: "relative",
									display: "inline-block",
								}}
							>
								<img
									src={image1Preview}
									alt="Preview"
									style={{
										width: "100%",
										height: 120,
										objectFit: "cover",
										borderRadius: 8,
										border: "1px solid rgba(255,255,255,0.2)",
									}}
								/>
								<button
									type="button"
									onClick={onImage1Remove}
									style={{
										position: "absolute",
										top: 4,
										right: 4,
										padding: "4px 8px",
										border: "1px solid #ef4444",
										borderRadius: 4,
										background: "rgba(239, 68, 68, 0.9)",
										color: "white",
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									Remove
								</button>
							</div>
						)}
						<input
							type="file"
							accept="image/*"
							onChange={(e) => handleFileChange(e, "image1")}
							style={{
								padding: 8,
								color: "white",
								border: "1px solid white",
								borderRadius: 6,
								background: "transparent",
							}}
						/>
						{uploadingImage === "image1" && (
							<div
								style={{
									fontSize: 12,
									opacity: 0.8,
									color: "#8b5cf6",
								}}
							>
								Uploading...
							</div>
						)}
					</div>
				</div>

				{/* Image 2 */}
				<div style={{ display: "grid", gap: 8 }}>
					<label style={{ fontSize: 14, fontWeight: 500 }}>
						Square Image
					</label>
					<div style={{ display: "grid", gap: 8 }}>
						{image2Preview && (
							<div
								style={{
									position: "relative",
									display: "inline-block",
								}}
							>
								<img
									src={image2Preview}
									alt="Preview"
									style={{
										width: 100,
										height: 100,
										objectFit: "cover",
										borderRadius: 8,
										border: "1px solid rgba(255,255,255,0.2)",
									}}
								/>
								<button
									type="button"
									onClick={onImage2Remove}
									style={{
										position: "absolute",
										top: 4,
										right: 4,
										padding: "4px 8px",
										border: "1px solid #ef4444",
										borderRadius: 4,
										background: "rgba(239, 68, 68, 0.9)",
										color: "white",
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									Remove
								</button>
							</div>
						)}
						<input
							type="file"
							accept="image/*"
							onChange={(e) => handleFileChange(e, "image2")}
							style={{
								padding: 8,
								color: "white",
								border: "1px solid white",
								borderRadius: 6,
								background: "transparent",
							}}
						/>
						{uploadingImage === "image2" && (
							<div
								style={{
									fontSize: 12,
									opacity: 0.8,
									color: "#8b5cf6",
								}}
							>
								Uploading...
							</div>
						)}
					</div>
				</div>
			</div>

			<div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
				Supported formats: JPG, PNG, GIF. Max size: 5MB per image.
			</div>
		</div>
	);
}

