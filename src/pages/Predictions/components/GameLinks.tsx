import React from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "@/context/PredictionDataContext";
import type { Tag } from "@/services/api/tagService";

interface GameLinksProps {
	selectedGame: string | null;
	onGameSelect: (game: string | null) => void;
	umbrellas?: Umbrella[];
	loading?: boolean;
	filterType?: "esports" | "games";
}

export default function GameLinks({
	selectedGame,
	onGameSelect,
	umbrellas = [],
	loading = false,
	filterType,
}: GameLinksProps) {
	const { tags, tagsLoading } = usePredictionData();

	// Helper function to normalize tags for ESPORTS detection (keeping for backward compatibility)
	const normalizeTag = (value: string) =>
		value
			.toUpperCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");

	// Filter tags to only show tags that have active markets for the current page type
	// All hooks must be called before any early returns
	const scrollRef = React.useRef<HTMLDivElement | null>(null);
	const [canScrollLeft, setCanScrollLeft] = React.useState(false);
	const [canScrollRight, setCanScrollRight] = React.useState(false);

	const updateScrollState = React.useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const { scrollLeft, clientWidth, scrollWidth } = el;
		setCanScrollLeft(scrollLeft > 0);
		setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
	}, []);

	const scrollByAmount = (delta: number) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: delta, behavior: "smooth" });
	};

	const filteredTags = React.useMemo(() => {
		if (loading || tagsLoading || !umbrellas || umbrellas.length === 0) {
			return []; // Don't show any tags while loading
		}

		// First filter out inactive umbrellas (same logic as home page cards)
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		// Filter umbrellas by esports/games type if filterType is provided
		const typeFilteredUmbrellas = filterType
			? activeUmbrellas.filter((umbrella) => {
					const children = (umbrella as any).children as
						| Array<any>
						| undefined;
					if (!children || children.length === 0) return false;

					// Check if any child has the ESPORTS tag
					// Only check questions that HAVE tagIds (skip legacy questions)
					const esportsTag = tags.find(
						(t) => normalizeTag(t.label) === "ESPORTS"
					);
					const hasEsportsTag = children.some((q) => {
						const tagIds: string[] | undefined = (q &&
							(q as any).tagIds) as any;

						// MUST have tagIds array (skip questions with legacy tags only)
						if (!Array.isArray(tagIds) || tagIds.length === 0) {
							return false;
						}

						if (esportsTag) {
							return tagIds.includes(esportsTag._id);
						}

						return false;
					});

					// Filter based on filterType
					if (filterType === "esports") {
						return hasEsportsTag;
					} else {
						// games
						return !hasEsportsTag;
					}
			  })
			: activeUmbrellas;

		// For each tag, check if any umbrella has a question with that tagId
		// Only show tags that have images AND have active markets
		const tagsWithActiveMarkets = tags.filter((tag) => {
			// Skip tags without images
			if (!tag.imageUrl) return false;

			return typeFilteredUmbrellas.some((umbrella) => {
				const children = (umbrella as any).children as
					| Array<any>
					| undefined;
				if (!children || children.length === 0) return false;

				return children.some((q) => {
					const tagIds: string[] | undefined = (q &&
						(q as any).tagIds) as any;

					// MUST have tagIds array (skip questions with legacy tags only)
					if (!Array.isArray(tagIds) || tagIds.length === 0) {
						return false;
					}

					return tagIds.includes(tag._id);
				});
			});
		});

		return tagsWithActiveMarkets.sort((a, b) =>
			a.label.localeCompare(b.label)
		);
	}, [umbrellas, loading, tagsLoading, filterType, tags]);

	React.useEffect(() => {
		// Ensure we start at the far left
		if (scrollRef.current) {
			scrollRef.current.scrollLeft = 0;
		}
		updateScrollState();
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => updateScrollState();
		el.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", updateScrollState);
		return () => {
			el.removeEventListener("scroll", onScroll as any);
			window.removeEventListener("resize", updateScrollState);
		};
	}, [updateScrollState]);

	// Don't render anything while loading or if no tags have active markets
	if (loading || tagsLoading || filteredTags.length === 0) return null;

	return (
		<div className="game-links-wrapper">
			{canScrollLeft && (
				<button
					type="button"
					className="scroll-arrow left"
					aria-label="Scroll left"
					onClick={() => scrollByAmount(-240)}
				>
					‹
				</button>
			)}
			{canScrollLeft && <div className="fade-left" aria-hidden />}
			<nav
				className="game-links-bar game-links-scroll"
				aria-label="Game links"
				ref={scrollRef}
			>
				{filteredTags.map((tag) => (
					<button
						className={`game-link ${
							selectedGame === tag.label ? "active" : ""
						}`}
						key={tag._id}
						onClick={() => {
							// Toggle selection: if already selected, deselect; otherwise select
							if (selectedGame === tag.label) {
								onGameSelect(null);
							} else {
								onGameSelect(tag.label);
							}
						}}
					>
						{tag.imageUrl && (
							<img
								src={tag.imageUrl}
								alt={tag.label}
								className="game-link-icon"
							/>
						)}
						{tag.label}
					</button>
				))}
			</nav>
			{canScrollRight && <div className="fade-right" aria-hidden />}
			{canScrollRight && (
				<button
					type="button"
					className="scroll-arrow right"
					aria-label="Scroll right"
					onClick={() => scrollByAmount(240)}
				>
					›
				</button>
			)}
		</div>
	);
}
