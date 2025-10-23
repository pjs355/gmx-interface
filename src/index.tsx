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

import App from "./App/App";
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
										<App />
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
