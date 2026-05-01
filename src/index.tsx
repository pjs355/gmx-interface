// MUST be first: Buffer + process (readable-stream@2 / hash-base) before any other imports
import "./polyfills/node-runtime-globals";

// MUST be second - suppress console.log in production before any other code runs
import { initConsoleSuppress } from "./utils/suppressConsole";
initConsoleSuppress();

// CRITICAL: Clean up any lingering environment override in localStorage
// This prevents a production bug where test markets could leak to real users
// Environment is now determined solely by hostname (production) or VITE_ENVIRONMENT_MODE (dev)
if (typeof window !== "undefined") {
	localStorage.removeItem("levelup_environment");
}

import * as Sentry from "@sentry/react";
import { shouldDropPrivyDuplicateSolanaInsufficientUnhandled } from "@/utils/sentryPrivySolanaFilter";

Sentry.init({
	dsn: "https://014a3809164e437ea9fa07f4dc0d3f32@o4508413424893952.ingest.us.sentry.io/4510275102703616",
	// Setting this option to true will send default PII data to Sentry.
	// For example, automatic IP address collection on events
	sendDefaultPii: true,
	beforeSend(event) {
		if (shouldDropPrivyDuplicateSolanaInsufficientUnhandled(event)) return null;
		return event;
	},
});

import { initMixpanel } from "./utils/mixpanel";
initMixpanel("0da2aa66dee9343cec64d0cdeb46562e", {
	autocapture: true,
	record_sessions_percent: 100,
});

import { PrivyProvider } from "@privy-io/react-auth";
import { addRpcUrlOverrideToChain } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import { base, bsc, polygon } from "viem/chains";
import {
	BSC_RPC_URL,
	POLYGON_RPC_URL,
	SOLANA_RPC_URL,
	SOLANA_WS_URL,
} from "@/config/rpc";

const baseOverride = addRpcUrlOverrideToChain(
	base,
	"https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG5T1Ih"
);

/** Embedded-wallet / viem JSON-RPC — overrides Privy defaults (e.g. thirdweb) that often 429 or block CORS from localhost. */
const polygonOverride = addRpcUrlOverrideToChain(polygon, POLYGON_RPC_URL);
const bscOverride = addRpcUrlOverrideToChain(bsc, BSC_RPC_URL);

/**
 * Privy 3.x requires explicit Solana RPCs for embedded wallets to sign and
 * send transactions. Without this the SDK throws
 * `No RPC configuration found for chain solana:mainnet` at submit time.
 */
const solanaMainnetRpcs = {
	rpc: createSolanaRpc(SOLANA_RPC_URL),
	rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WS_URL),
};

import WalletProvider from "@/services/wallets/WalletProvider";
import { SignerProvider } from "context/SignerContext";
import { PredictionDataProvider } from "context/PredictionDataContext";
import { OddsMonitorProvider } from "context/OddsMonitorContext";
import { UserDataProvider } from "context/UserDataContext";
import { RecentSettlementClaimProvider } from "context/RecentSettlementClaimContext";
import { CollateralTokenProvider } from "@/context/CollateralTokenContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { PositionsPageMetricsGateProvider } from "context/PositionsPageMetricsGateContext";
import { RPGProvider } from "context/RPGContext";
import { TransfersModalProvider } from "context/TransfersModalContext";
import { OddsDisplayProvider } from "context/OddsDisplayContext";
import { PolymarketBackgroundActivation } from "@/trading/polymarket/PolymarketBackgroundActivation";

import App from "./app/App";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Router>
			<PrivyProvider
				appId="cmb7ccvbd011hl50m62vf8epr"
				config={{
					defaultChain: baseOverride,
					supportedChains: [baseOverride, polygonOverride, bscOverride],
					appearance: {
						accentColor: "#6A6FF5",
						theme: "dark",
						showWalletLoginFirst: false,
						loginMessage:
							"Welcome to LevelUp Predictions! Please create an account or sign in",
					},
					loginMethods: ["email", "google", "wallet"],
					embeddedWallets: {
						ethereum: {
							createOnLogin: "users-without-wallets",
						},
						solana: {
							createOnLogin: "users-without-wallets",
						},
					},
					solana: {
						rpcs: {
							"solana:mainnet": solanaMainnetRpcs,
						},
					},
					mfa: {
						noPromptOnMfaRequired: false,
					},
				}}
			>
				<SmartWalletsProvider>
					<WalletProvider>
					<PredictionDataProvider>
						<OddsMonitorProvider>
							<SignerProvider>
									<UserDataProvider>
										<PolymarketBackgroundActivation />
										<RecentSettlementClaimProvider>
										<CollateralTokenProvider>
											<PortfolioProvider>
												<PositionsPageMetricsGateProvider>
													<RPGProvider>
														<TransfersModalProvider>
															<OddsDisplayProvider>
																<App />
															</OddsDisplayProvider>
														</TransfersModalProvider>
													</RPGProvider>
												</PositionsPageMetricsGateProvider>
											</PortfolioProvider>
										</CollateralTokenProvider>
										</RecentSettlementClaimProvider>
									</UserDataProvider>
							</SignerProvider>
						</OddsMonitorProvider>
					</PredictionDataProvider>
					</WalletProvider>
				</SmartWalletsProvider>
			</PrivyProvider>
		</Router>
	</React.StrictMode>
);
