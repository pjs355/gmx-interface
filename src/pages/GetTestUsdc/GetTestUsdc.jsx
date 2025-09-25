import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import React, { useEffect, useState } from "react";
import { getPredictionApiBaseUrl } from "../../lib/predictionApiBase";

import Button from "components/Button/Button";

import "./GetTestUsdc.css";

// On-chain logic handled by server; client only authenticates and calls API

export function GetTestUsdc() {
  const { getAccessToken, user } = usePrivy();
  const { client: smartClient } = useSmartWallets();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingClaim, setIsCheckingClaim] = useState(true);
  const [hasAlreadyClaimed, setHasAlreadyClaimed] = useState(false);

  // Resolve API base via shared helper
  const API_ROOT = getPredictionApiBaseUrl();

  // Wait for smart wallet to initialize, then POST to check-claim with smart wallet in body
  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    async function run() {
      try {
        // Wait up to 5s for smart wallet address to appear
        let smartWalletAddress;
        while (!cancelled) {
          smartWalletAddress = (user?.linkedAccounts || []).find((a) => a?.type === "smart_wallet")?.address;
          if (smartWalletAddress || Date.now() - start > 5000) break;
          await new Promise((r) => setTimeout(r, 200));
        }

        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch(`${API_ROOT}/test-coins/check-claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ smartWallet: smartWalletAddress }),
        });

        let claimed = false;
        try {
          const data = await res.clone().json();
          claimed = Boolean(data?.claimed ?? data?.hasClaimed ?? data?.alreadyClaimed ?? data?.result?.claimed);
        } catch {
          const text = await res.text();
          claimed = /true|already/i.test(text);
        }

        if (!cancelled) setHasAlreadyClaimed(claimed);
      } catch {
        // ignore and keep as not claimed
      } finally {
        if (!cancelled) setIsCheckingClaim(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, user?.linkedAccounts, smartClient]);

  const handleClaimClick = async () => {
    try {
      setIsLoading(true);
      const token = await getAccessToken();
      const smartWallet = (user?.linkedAccounts || []).find((a) => a?.type === "smart_wallet")?.address;
      const response = await fetch(`${API_ROOT}/test-coins/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ smartWallet }),
      });
      const text = await response.text();
      console.log("/api/test-coins/claim response:", response.status, text);
    } catch (error) {
      console.error("Claim request failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isCheckingClaim) return "Checking...";
    if (hasAlreadyClaimed) return "You have already claimed";
    if (isLoading) return "Processing...";
    return "Claim Test USD";
  };

  const isButtonDisabled = isLoading || isCheckingClaim || hasAlreadyClaimed;

  return (
    <div className="GetTestUsdc">
      <div className="GetTestUsdc-content">
        <div className="GetTestUsdc-banner">
          <div className="GetTestUsdc-banner-content">
            <h1 className="GetTestUsdc-title">Get $1,000 of Test USD</h1>

            <div className="GetTestUsdc-button-container">
              <Button
                variant="primary"
                onClick={handleClaimClick}
                className="GetTestUsdc-claim-button"
                disabled={isButtonDisabled}
              >
                {getButtonText()}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Disclosure Statement */}
      <div className="GetTestUsdc-disclosure">
        <p>
          This is FAKE USD and it has 0 real world value or use case. It can not be redeemed for anything of value and
          it is just for testing and funding purposes.
        </p>
      </div>
    </div>
  );
}

export default GetTestUsdc;
