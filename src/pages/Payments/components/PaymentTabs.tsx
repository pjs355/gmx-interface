/**
 * PaymentTabs Component
 * Tab navigation for the payments page
 */

import React from "react";
import type { PaymentTab } from "../types";
import { PAYMENT_TABS } from "../constants";

interface PaymentTabsProps {
	activeTab: PaymentTab;
	onTabChange: (tab: PaymentTab) => void;
	isAuthenticated: boolean;
}

export function PaymentTabs({ activeTab, onTabChange, isAuthenticated }: PaymentTabsProps) {
	return (
		<div className="payments-tabs">
			{PAYMENT_TABS.map((tab) => {
				// Hide auth-required tabs when not logged in
				if (tab.requiresAuth && !isAuthenticated) {
					return null;
				}

				return (
					<button
						key={tab.id}
						className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
						onClick={() => onTabChange(tab.id)}
					>
						<span className="tab-icon">{tab.icon}</span>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}

