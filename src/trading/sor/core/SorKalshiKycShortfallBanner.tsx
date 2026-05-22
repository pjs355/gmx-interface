import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { RoutePlan } from "./sor-types";
import {
	getKalshiKycShortfallBannerParts,
	PROFILE_DFLOW_KYC_HASH,
} from "./sor-types";

const linkStyle: CSSProperties = {
	color: "inherit",
	textDecoration: "underline",
	textUnderlineOffset: 2,
};

function ShortfallCopy({ extraShares }: { extraShares: string }) {
	return (
		<>
			<Link to={`/profile#${PROFILE_DFLOW_KYC_HASH}`} style={linkStyle}>
				Enable Kalshi trading
			</Link>{" "}
			to receive {extraShares} more shares
		</>
	);
}

type Variant = "tradebox" | "embedded";

/**
 * Kalshi (DFlow) KYC shortfall callout — only renders when `dflow` is in the route’s
 * `executionShortfall.venuesBlocking`.
 */
export function SorKalshiKycShortfallBanner({
	route,
	variant,
}: {
	route: RoutePlan;
	variant: Variant;
}) {
	const parts = getKalshiKycShortfallBannerParts(route);
	if (!parts) return null;

	if (variant === "tradebox") {
		return (
			<div
				className="trade-kalshi-kyc-hint"
				role="status"
				style={{
					marginTop: 10,
					padding: "0 4px",
					fontSize: 12,
					lineHeight: 1.45,
					color: "#d1d5db",
					textAlign: "center",
				}}
			>
				<ShortfallCopy extraShares={parts.extraShares} />
			</div>
		);
	}

	return (
		<span style={{ color: "#d1d5db" }}>
			<ShortfallCopy extraShares={parts.extraShares} />
		</span>
	);
}
