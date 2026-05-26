import "./scss/DepthBar.scss";

interface DepthBarProps {
	depth: number; // Percentage depth (0-100)
	side: "bid" | "ask";
	className?: string;
}

export default function DepthBar({ depth, side, className = "" }: DepthBarProps) {
	const barStyle = {
		width: `${Math.min(depth, 100)}%`,
	};

	return <div className={`depth-bar ${side} ${className}`} style={barStyle} />;
}
