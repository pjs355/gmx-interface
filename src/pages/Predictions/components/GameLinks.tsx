import React from "react";
import { useMedia } from "react-use";
import { FiChevronDown, FiChevronRight, FiClock } from "react-icons/fi";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";
import type { Tag } from "@/services/api/tagService";
import {
	bundledCounterStrikeLogoFromTagLabels,
	resolveLogoByTags,
	WORLD_CUP_GAME_LOGO_URL,
} from "@/features/markets/assets/gameLogoResolver";
import { isRestrictedProductionUmbrella } from "@/features/markets/presentation/umbrellaGame";
import {
	isRestrictedProductionMode,
	isRestrictedProductionTagLabel,
	restrictedDefaultTagLabel,
} from "@/config/restrictedMode";
import {
	defaultEsportsTagLabel,
	filterHomeCatalogUmbrellas,
	findEsportsTag,
	isEsportsMetaTagLabel,
	isHiddenSidebarTagLabel,
	isMlbUmbrella,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	isWorldCupUmbrella,
	LIVE_PILL_ID,
	STARTING_SOON_PILL_ID,
	umbrellaHasTagId,
	umbrellaMatchesHomeFilterType,
	WORLD_CUP_PILL_ID,
	GAME_FILTER_COMPACT_MEDIA,
	useNowTick,
} from "../utils/gameLinkFilters";

function resolveTagLinkLogo(tag: Tag): string | null {
	const cs2 = bundledCounterStrikeLogoFromTagLabels([tag.label]);
	if (cs2) return cs2;
	if (tag.imageUrl) return tag.imageUrl;
	return resolveLogoByTags([tag.label]);
}

export type WorldCupSection = "games" | "groups" | "futures" | "awards";

/** Fixed left-to-right order of the World Cup sub-tabs. */
const WORLD_CUP_SECTION_ORDER: WorldCupSection[] = ["games", "groups", "futures", "awards"];

const WORLD_CUP_SECTION_LABELS: Record<WorldCupSection, string> = {
	games: "Games",
	groups: "Groups",
	futures: "Futures",
	awards: "Awards",
};

interface GameLinksProps {
	selectedGame: string | null;
	onGameSelect: (game: string | null) => void;
	umbrellas?: Umbrella[];
	loading?: boolean;
	filterType?: "esports" | "games" | "all";
	/** When true, Live / Starting Soon / World Cup never toggle off to All (trading → home). */
	disableFilterToggle?: boolean;
	worldCupSection?: WorldCupSection;
	onWorldCupSectionSelect?: (section: WorldCupSection) => void;
	worldCupSectionCounts?: { games: number; groups: number; futures: number; awards: number };
}

function sortTagsForSidebar(tags: Tag[]): Tag[] {
	const esports = tags.filter((t) => isEsportsMetaTagLabel(t.label));
	const rest = tags
		.filter((t) => !isEsportsMetaTagLabel(t.label))
		.sort((a, b) => a.label.localeCompare(b.label));
	return [...esports, ...rest];
}

export default function GameLinks({
	selectedGame,
	onGameSelect,
	umbrellas = [],
	loading = false,
	filterType,
	disableFilterToggle = false,
	worldCupSection = "games",
	onWorldCupSectionSelect,
	worldCupSectionCounts = { games: 0, groups: 0, futures: 0, awards: 0 },
}: GameLinksProps) {
	const { tags, tagsLoading } = usePredictionData();
	const now = useNowTick(60_000);
	const isCompactLayout = useMedia(GAME_FILTER_COMPACT_MEDIA);

	const worldCupActive = selectedGame === WORLD_CUP_PILL_ID;
	const [worldCupExpanded, setWorldCupExpanded] = React.useState(worldCupActive);

	React.useEffect(() => {
		if (worldCupActive) setWorldCupExpanded(true);
	}, [worldCupActive]);

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

	const restrictedMode = isRestrictedProductionMode();

	const linkFilterState = React.useMemo(() => {
		if (loading || tagsLoading || !umbrellas || umbrellas.length === 0) {
			return {
				typeFilteredUmbrellas: [] as Umbrella[],
				tagsSorted: [] as Tag[],
				esportsTagId: undefined as string | undefined,
			};
		}

		const activeUmbrellas = umbrellas.filter((umbrella) => {
			if (isMlbUmbrella(umbrella)) return false;
			if (restrictedMode && !isRestrictedProductionUmbrella(umbrella as any)) {
				return false;
			}
			return (umbrella as any).active === true;
		});

		const esportsTag = findEsportsTag(tags);
		const esportsTagId = esportsTag?._id;

		const typeFilteredUmbrellas = filterHomeCatalogUmbrellas(
			filterType
				? activeUmbrellas.filter((umbrella) =>
						umbrellaMatchesHomeFilterType(umbrella, filterType, esportsTagId),
					)
				: activeUmbrellas,
			now,
			esportsTagId,
		);

		const tagsWithActiveMarkets = tags.filter((tag) => {
			return typeFilteredUmbrellas.some((umbrella) => umbrellaHasTagId(umbrella, tag._id));
		});

		const tagsSorted = sortTagsForSidebar(tagsWithActiveMarkets);

		return { typeFilteredUmbrellas, tagsSorted, esportsTagId };
	}, [umbrellas, loading, tagsLoading, filterType, tags, restrictedMode, now]);

	const esportsTagLabel = defaultEsportsTagLabel(tags);
	const esportsMetaTag = linkFilterState.tagsSorted.find((t) => isEsportsMetaTagLabel(t.label));
	const allGameTags = linkFilterState.tagsSorted
		// "FIFA World Cup" back-end Tag duplicates the synthetic World Cup
		// block (renderWorldCupBlock) — hide it so the sidebar shows one
		// canonical entry point for those markets.
		.filter((t) => !isEsportsMetaTagLabel(t.label) && !isHiddenSidebarTagLabel(t.label));
	const gameTagsOnly = restrictedMode
		? allGameTags.filter((t) => isRestrictedProductionTagLabel(t.label))
		: allGameTags;
	// Restricted prod has no ESPORTS "All" pill — toggle Live/Starting Soon off to CS2 (etc.).
	const toggleOffTarget = restrictedMode ? restrictedDefaultTagLabel(tags) : esportsTagLabel;

	const selectPill = (pillId: string) => {
		if (disableFilterToggle) {
			onGameSelect(pillId);
			return;
		}
		if (selectedGame === pillId) {
			if (toggleOffTarget) onGameSelect(toggleOffTarget);
		} else {
			onGameSelect(pillId);
		}
	};

	const liveMarketCount = React.useMemo(() => {
		let n = 0;
		for (const u of linkFilterState.typeFilteredUmbrellas) {
			if (isUmbrellaLiveByEventDate(u, now, linkFilterState.esportsTagId)) {
				n += 1;
			}
		}
		return n;
	}, [linkFilterState, now]);

	const startingSoonMarketCount = React.useMemo(() => {
		let n = 0;
		for (const u of linkFilterState.typeFilteredUmbrellas) {
			if (isUmbrellaStartingSoonByEventDate(u, now, linkFilterState.esportsTagId)) {
				n += 1;
			}
		}
		return n;
	}, [linkFilterState, now]);

	const esportsMarketCount = React.useMemo(() => {
		return linkFilterState.typeFilteredUmbrellas.length;
	}, [linkFilterState.typeFilteredUmbrellas]);

	const worldCupMarketCount = React.useMemo(() => {
		if (restrictedMode) return 0;
		let n = 0;
		for (const u of umbrellas) {
			if ((u as any).active === true && isWorldCupUmbrella(u)) n += 1;
		}
		return n;
	}, [umbrellas, restrictedMode]);

	const tagMarketCounts = React.useMemo(() => {
		const map = new Map<string, number>();
		const pool = linkFilterState.typeFilteredUmbrellas;
		for (const tag of linkFilterState.tagsSorted) {
			if (isEsportsMetaTagLabel(tag.label)) {
				map.set(tag._id, pool.length);
				continue;
			}
			let c = 0;
			for (const umbrella of pool) {
				if (umbrellaHasTagId(umbrella, tag._id)) c += 1;
			}
			map.set(tag._id, c);
		}
		return map;
	}, [linkFilterState]);

	// Attach scroll/resize listeners once. `updateScrollState` is stable
	// (useCallback with no deps).
	React.useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		updateScrollState();
		const onScroll = () => updateScrollState();
		el.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", updateScrollState);
		return () => {
			el.removeEventListener("scroll", onScroll as any);
			window.removeEventListener("resize", updateScrollState);
		};
	}, [updateScrollState]);

	// Refresh arrow visibility when the pill content changes; do NOT reset
	// scrollLeft. The previous reset re-ran on every umbrella WS tick (because
	// `gameTagsOnly` is recomputed via `linkFilterState`) and was snapping the
	// user back to start mid-scroll on mobile.
	React.useEffect(() => {
		updateScrollState();
	}, [updateScrollState, gameTagsOnly, esportsMetaTag, worldCupExpanded]);

	if (loading || tagsLoading) return null;

	const renderTagButton = (tag: Tag) => {
		const count = tagMarketCounts.get(tag._id) ?? 0;
		const logoUrl = resolveTagLinkLogo(tag);
		return (
			<button
				type="button"
				className={`game-link ${selectedGame === tag.label ? "active" : ""}`}
				key={tag._id}
				onClick={() => onGameSelect(tag.label)}
			>
				<span className="game-link__inner">
					<span className="game-link__leading">
						{logoUrl ? <img className="game-link__logo" src={logoUrl} alt="" aria-hidden /> : null}
						<span className="game-link__label">{tag.label}</span>
					</span>
					<span className="game-link__count" aria-label={`${count} markets`}>
						{count}
					</span>
				</span>
			</button>
		);
	};

	const allFilterActive = esportsTagLabel !== null && selectedGame === esportsTagLabel;

	const renderAllFilterButton = (key: string) => {
		if (!esportsTagLabel) return null;
		return (
			<button
				type="button"
				className={`game-link ${allFilterActive ? "active" : ""}`}
				key={key}
				onClick={() => onGameSelect(esportsTagLabel)}
			>
				<span className="game-link__inner">
					<span className="game-link__leading">
						<span className="game-link__label">All</span>
					</span>
					<span className="game-link__count" aria-label={`${esportsMarketCount} markets`}>
						{esportsMarketCount}
					</span>
				</span>
			</button>
		);
	};

	// Only show a World Cup sub-tab that still has markets. Group winners,
	// futures and awards resolve/expire as the tournament progresses; once a
	// section's umbrellas are deactivated its count drops to 0 and the tab is a
	// dead end (renders "0", opens an empty list). Hide those. The counts share
	// the same active-World-Cup-umbrella base as `worldCupMarketCount`, so the
	// block only renders when at least one section is non-empty.
	const visibleWorldCupSections = React.useMemo<WorldCupSection[]>(
		() =>
			WORLD_CUP_SECTION_ORDER.filter((section) => (worldCupSectionCounts[section] ?? 0) > 0),
		[worldCupSectionCounts],
	);
	const visibleWorldCupSectionsKey = visibleWorldCupSections.join(",");

	// If the section the user is viewing empties out (its last market resolves),
	// move them to the first section that still has markets so they never land
	// on a hidden, empty tab.
	React.useEffect(() => {
		if (!worldCupActive) return;
		const first = visibleWorldCupSections[0];
		if (first === undefined) return;
		if (visibleWorldCupSections.includes(worldCupSection)) return;
		onWorldCupSectionSelect?.(first);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [worldCupActive, worldCupSection, visibleWorldCupSectionsKey]);

	const handleWorldCupSectionClick = (section: WorldCupSection) => {
		setWorldCupExpanded(true);
		onWorldCupSectionSelect?.(section);
	};

	const handleWorldCupParentClick = () => {
		selectPill(WORLD_CUP_PILL_ID);
		if (!worldCupActive) {
			onWorldCupSectionSelect?.("games");
		}
	};

	const renderWorldCupSectionButton = (
		section: WorldCupSection,
		label: string,
		count: number,
		className = "game-link game-link--sub",
	) => (
		<button
			type="button"
			className={`${className} ${worldCupActive && worldCupSection === section ? "active" : ""}`}
			key={section}
			onClick={() => handleWorldCupSectionClick(section)}
		>
			<span className="game-link__inner">
				<span className="game-link__leading">
					<span className="game-link__label">{label}</span>
				</span>
				<span className="game-link__count" aria-label={`${count} markets`}>
					{count}
				</span>
			</span>
		</button>
	);

	const renderWorldCupSubSections = (className = "game-link game-link--sub") => (
		<>
			{visibleWorldCupSections.map((section) =>
				renderWorldCupSectionButton(
					section,
					WORLD_CUP_SECTION_LABELS[section],
					worldCupSectionCounts[section],
					className,
				),
			)}
		</>
	);

	const renderWorldCupBlock = () => {
		if (worldCupMarketCount <= 0) return null;

		if (isCompactLayout) {
			return (
				<button
					type="button"
					className={`game-link ${worldCupActive ? "active" : ""}`}
					key={WORLD_CUP_PILL_ID}
					onClick={handleWorldCupParentClick}
				>
					<span className="game-link__inner">
						<span className="game-link__leading">
							<img
								className="game-link__logo game-link__logo--world-cup"
								src={WORLD_CUP_GAME_LOGO_URL}
								alt=""
								aria-hidden
							/>
							<span className="game-link__label">World Cup</span>
						</span>
						<span className="game-link__count" aria-label={`${worldCupMarketCount} markets`}>
							{worldCupMarketCount}
						</span>
					</span>
				</button>
			);
		}

		const CaretIcon = worldCupExpanded ? FiChevronDown : FiChevronRight;

		return (
			<div className="game-link-world-cup-block" key={WORLD_CUP_PILL_ID}>
				<div className={`game-link game-link--world-cup-parent ${worldCupActive ? "active" : ""}`}>
					<span className="game-link__inner">
						<button
							type="button"
							className="game-link__main"
							onClick={() => {
								setWorldCupExpanded(true);
								selectPill(WORLD_CUP_PILL_ID);
							}}
						>
							<span className="game-link__leading">
								<img
									className="game-link__logo game-link__logo--world-cup"
									src={WORLD_CUP_GAME_LOGO_URL}
									alt=""
									aria-hidden
								/>
								<span className="game-link__label">World Cup</span>
							</span>
						</button>
						<span className="game-link__world-cup-trailing">
							<button
								type="button"
								className="game-link__caret"
								aria-label={
									worldCupExpanded ? "Collapse World Cup sections" : "Expand World Cup sections"
								}
								aria-expanded={worldCupExpanded}
								onClick={(e) => {
									e.stopPropagation();
									setWorldCupExpanded((v) => !v);
								}}
							>
								<CaretIcon aria-hidden />
							</button>
							<span className="game-link__count" aria-label={`${worldCupMarketCount} markets`}>
								{worldCupMarketCount}
							</span>
						</span>
					</span>
				</div>
				{worldCupExpanded ? (
					<div
						className="game-links-world-cup-children"
						role="group"
						aria-label="World Cup sections"
					>
						{renderWorldCupSubSections()}
					</div>
				) : null}
			</div>
		);
	};

	const renderWorldCupSubRow = () => {
		if (!isCompactLayout || !worldCupActive || worldCupMarketCount <= 0) return null;

		return (
			<nav
				className="game-links-sub-row game-links-scroll"
				aria-label="World Cup sections"
				role="group"
			>
				{renderWorldCupSubSections("game-link game-link--sub-pill")}
			</nav>
		);
	};

	return (
		<div className="game-links-wrapper">
			<div className="game-links-underlay" aria-hidden />
			<div className="game-links-sticky">
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
				<nav className="game-links-bar game-links-scroll" aria-label="Game links" ref={scrollRef}>
					{!restrictedMode && renderAllFilterButton("__ALL__")}
					<button
						type="button"
						className={`game-link game-link--live ${selectedGame === LIVE_PILL_ID ? "active" : ""}`}
						key={LIVE_PILL_ID}
						onClick={() => selectPill(LIVE_PILL_ID)}
					>
						<span className="game-link__inner">
							<span className="game-link__leading">
								<span className="game-link__live-dot" aria-hidden />
								<span className="game-link__label">Live</span>
							</span>
							<span className="game-link__count" aria-label={`${liveMarketCount} markets`}>
								{liveMarketCount}
							</span>
						</span>
					</button>
					<button
						type="button"
						className={`game-link ${selectedGame === STARTING_SOON_PILL_ID ? "active" : ""}`}
						key={STARTING_SOON_PILL_ID}
						onClick={() => selectPill(STARTING_SOON_PILL_ID)}
					>
						<span className="game-link__inner">
							<span className="game-link__leading">
								<FiClock className="game-link__clock-icon" aria-hidden />
								<span className="game-link__label">Starting Soon</span>
							</span>
							<span className="game-link__count" aria-label={`${startingSoonMarketCount} markets`}>
								{startingSoonMarketCount}
							</span>
						</span>
					</button>
					{renderWorldCupBlock()}
					{gameTagsOnly.map((tag) => renderTagButton(tag))}
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
			{renderWorldCupSubRow()}
		</div>
	);
}
