/**
 * MessageDisplay Component
 * Shows success or error messages with auto-dismiss
 */

import React from "react";
import type { PaymentMessage } from "../types";

interface MessageDisplayProps {
	message: PaymentMessage | null;
}

export function MessageDisplay({ message }: MessageDisplayProps) {
	if (!message) return null;

	const className = message.type === "success" ? "success-message" : "error-message";
	const icon = message.type === "success" ? "✓" : "✕";

	return (
		<div className={`message ${className}`}>
			<span className="message-icon">{icon}</span>
			{message.text}
		</div>
	);
}

