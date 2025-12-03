/**
 * PaymentsFooter Component
 * Footer section with payment info and security details
 */

import React from "react";
import { PAYMENT_PROVIDERS } from "../constants";

export function PaymentsFooter() {
	return (
		<div className="payments-footer">
			<div className="footer-info">
				<h4>Supported Payment Methods</h4>
				<div className="payment-logos">
					{PAYMENT_PROVIDERS.map((provider) => (
						<span
							key={provider}
							className={`payment-logo ${provider.toLowerCase()}`}
						>
							{provider}
						</span>
					))}
				</div>
			</div>
			<div className="footer-info">
				<h4>Security</h4>
				<p>
					All transactions are secured by Privy's enterprise-grade
					infrastructure and smart wallet technology.
				</p>
			</div>
		</div>
	);
}

