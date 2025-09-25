import React from "react";
import Button from "components/Button/Button";
import "./Positions.scss";

export default function PositionsTabs({
  activeTab,
  setActiveTab,
  onClaim,
  isClaiming,
}: {
  activeTab: "positions" | "orders" | "history";
  setActiveTab: (t: "positions" | "orders" | "history") => void;
  onClaim?: () => void;
  isClaiming?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-12">
      <div className="flex gap-8 positions-tabs" role="tablist">
        <Button
          variant="ghost"
          onClick={() => setActiveTab("positions")}
          className={`side-btn ${activeTab === "positions" ? "selected primary" : ""}`}
        >
          Positions
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("orders")}
          className={`side-btn ${activeTab === "orders" ? "selected primary" : ""}`}
        >
          Orders
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("history")}
          className={`side-btn ${activeTab === "history" ? "selected primary" : ""}`}
        >
          History
        </Button>
      </div>
      <div>
        <Button
          variant="primary"
          onClick={onClaim}
          disabled={!onClaim || isClaiming}
          className="side-btn"
        >
          {isClaiming ? "Claiming..." : "Claim"}
        </Button>
      </div>
    </div>
  );
}


