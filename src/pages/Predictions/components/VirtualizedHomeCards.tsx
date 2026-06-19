import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Umbrella } from "@/services/api/umbrellaDataService";

const ESTIMATED_CARD_HEIGHT_PX = 320;
const OVERSCAN = 4;

interface VirtualizedHomeCardsProps {
	umbrellas: Umbrella[];
	renderCard: (umbrella: Umbrella) => ReactNode;
}

/** Windowed home card list — only mounts cards near the viewport (window scroll). */
export function VirtualizedHomeCards({ umbrellas, renderCard }: VirtualizedHomeCardsProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: umbrellas.length,
		getScrollElement: () => (typeof window !== "undefined" ? window : null),
		scrollMargin: listRef.current?.offsetTop ?? 0,
		estimateSize: () => ESTIMATED_CARD_HEIGHT_PX,
		overscan: OVERSCAN,
	});

	return (
		<div ref={listRef}>
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const umbrella = umbrellas[virtualRow.index];
					if (!umbrella) return null;
					return (
						<div
							key={umbrella._id}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
							}}
						>
							{renderCard(umbrella)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
