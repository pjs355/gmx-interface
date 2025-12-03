/**
 * AuthRequired Component
 * Shown when user needs to sign in
 */

import React from "react";
import { PrimaryButton } from "./shared";

interface AuthRequiredProps {
	onLogin: () => void;
}

export function AuthRequired({ onLogin }: AuthRequiredProps) {
	return (
		<div className="auth-required">
			<div className="auth-icon">🔐</div>
			<h2>Sign In Required</h2>
			<p>Please sign in to access payment features</p>
			<PrimaryButton onClick={onLogin}>Sign In</PrimaryButton>
		</div>
	);
}

