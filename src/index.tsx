import * as Sentry from "@sentry/react";
Sentry.init({
	dsn: "https://014a3809164e437ea9fa07f4dc0d3f32@o4508413424893952.ingest.us.sentry.io/4510275102703616",
	// Setting this option to true will send default PII data to Sentry.
	// For example, automatic IP address collection on events
	sendDefaultPii: true,
});

import { initMixpanel } from "./utils/mixpanel";
initMixpanel("0da2aa66dee9343cec64d0cdeb46562e", {
	autocapture: true,
	record_sessions_percent: 100,
});

import { PrivyProvider } from "@privy-io/react-auth";
import { addRpcUrlOverrideToChain } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import { base } from "viem/chains";

const baseOverride = addRpcUrlOverrideToChain(
	base,
	"https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG5T1Ih"
);

import { SignerProvider } from "context/SignerContext";
import { PredictionDataProvider } from "context/PredictionDataContext";
import { UserDataProvider } from "context/UserDataContext";
import { BalanceProvider } from "context/BalanceContext";
import { PortfolioProvider } from "context/PortfolioContext";
import { RPGProvider } from "context/RPGContext";
import { TransfersModalProvider } from "context/TransfersModalContext";

import App from "./app/App";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Router>
			<PrivyProvider
				appId="cmb7ccvbd011hl50m62vf8epr"
				config={{
					defaultChain: baseOverride,
					appearance: {
						accentColor: "#6A6FF5",
						theme: "dark",
						showWalletLoginFirst: false,
						loginMessage:
							"Welcome to LevelUp Predictions! Please create an account or sign in",
					},
					loginMethods: ["email", "google", "wallet"],
					embeddedWallets: {
						createOnLogin: "users-without-wallets",
						requireUserPasswordOnCreate: false,
					},
					mfa: {
						noPromptOnMfaRequired: false,
					},
				}}
			>
				<SmartWalletsProvider>
					<PredictionDataProvider>
						<SignerProvider>
							<UserDataProvider>
								<BalanceProvider>
									<PortfolioProvider>
										<RPGProvider>
											<TransfersModalProvider>
												<App />
											</TransfersModalProvider>
										</RPGProvider>
									</PortfolioProvider>
								</BalanceProvider>
							</UserDataProvider>
						</SignerProvider>
					</PredictionDataProvider>
				</SmartWalletsProvider>
			</PrivyProvider>
		</Router>
	</React.StrictMode>
);
