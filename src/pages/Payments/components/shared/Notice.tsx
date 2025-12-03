/**
 * Notice Component
 * Informational notices and warnings
 */

import React from "react";

interface NoticeProps {
	children: React.ReactNode;
	variant?: "warning" | "info" | "success";
	icon?: string;
}

const VARIANT_CLASSES = {
	warning: "network-warning",
	info: "kyc-notice",
	success: "bank-instructions",
};

const DEFAULT_ICONS = {
	warning: "⚠️",
	info: "📋",
	success: "✓",
};

export function Notice({ children, variant = "warning", icon }: NoticeProps) {
	const displayIcon = icon || DEFAULT_ICONS[variant];

	return (
		<div className={VARIANT_CLASSES[variant]}>
			<span className="warning-icon">{displayIcon}</span>
			<span>{children}</span>
		</div>
	);
}

