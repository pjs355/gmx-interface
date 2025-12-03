/**
 * PrimaryButton Component
 * Main action button for payments
 */

import React from "react";

interface PrimaryButtonProps {
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	loadingText?: string;
	children: React.ReactNode;
	variant?: "default" | "withdraw";
}

export function PrimaryButton({
	onClick,
	disabled = false,
	loading = false,
	loadingText = "Processing...",
	children,
	variant = "default",
}: PrimaryButtonProps) {
	const className = variant === "withdraw" 
		? "primary-btn withdraw-btn" 
		: "primary-btn";

	return (
		<button
			className={className}
			onClick={onClick}
			disabled={disabled || loading}
		>
			{loading ? loadingText : children}
		</button>
	);
}

