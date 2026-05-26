import React from "react";

interface ScrollableTableProps {
	children: React.ReactNode;
	minWidth?: string;
	className?: string;
}

export default function ScrollableTable({
	children,
	minWidth = "800px",
	className = "",
}: ScrollableTableProps) {
	return (
		<div className={`overflow-x-auto ${className}`}>
			<div style={{ minWidth }}>{children}</div>
		</div>
	);
}
