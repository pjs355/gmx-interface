import React from "react";
import { FiChevronDown, FiChevronRight, FiClock } from "react-icons/fi";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";
import type { Tag } from "@/services/api/tagService";
import {
	bundledCounterStrikeLogoFromTagLabels,
	resolveLogoByTags,
	WORLD_CUP_GAME_LOGO_URL,
} from "@/features/markets/assets/gameLogoResolver";
import { isCounterStrikeUmbrella } from "@/features/markets/presentation/umbrellaGame";
import { isCounterStrikeTagLabel, isRestrictedProductionMode } from "@/config/restrictedMode";
import {
	defaultEsportsTagLabel,
	findEsportsTag,
	homeDefaultSelectedTagLabel,
	isEsportsMetaTagLabel,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	isWorldCupUmbrella,
	LIVE_PILL_ID,
	STARTING_SOON_PILL_ID,
	WORLD_CUP_PILL_ID,
	useNowTick,
} from "../utils/gameLinkFilters";

function resolveTagLinkLogo(tag: Tag): string | null {
	const cs2Bundled = bundledCounterStrikeLogoFromTagLabels([tag.label]);
	if (cs2Bundled) return cs2Bundled;
	if (tag.imageUrl) return tag.imageUrl;
	return resolveLogoByTags([tag.label]);
}

export type WorldCupSection = "games" | "groups";

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
	worldCupSectionCounts?: { games: number; groups: number };
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
	worldCupSectionCounts = { games: 0, groups: 0 },
}: GameLinksProps) {
	const { tags, tagsLoading } = usePredictionData();
	const now = useNowTick(60_000);

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
			if (restrictedMode && !isCounterStrikeUmbrella(umbrella as any)) {
				return false;
			}
			return (umbrella as any).active === true;
		});

		const esportsTag = findEsportsTag(tags);
		const esportsTagId = esportsTag?._id;

		const typeFilteredUmbrellas = filterType
			? activeUmbrellas.filter((umbrella) => {
					const children = (umbrella as any).children as Array<any> | undefined;
					if (!children || children.length === 0) return false;

					const hasEsportsTag = children.some((q) => {
						const tagIds: string[] | undefined = (q && (q as any).tagIds) as any;

						if (!Array.isArray(tagIds) || tagIds.length === 0) {
							return false;
						}

						if (esportsTag) {
							return tagIds.includes(esportsTag._id);
						}

						return false;
					});

					if (filterType === "games") return !hasEsportsTag;
					if (filterType === "esports" || filterType === "all") {
						return hasEsportsTag;
					}
					return true;
				})
			: activeUmbrellas;

		const tagsWithActiveMarkets = tags.filter((tag) => {
			return typeFilteredUmbrellas.some((umbrella) => {
				const children = (umbrella as any).children as Array<any> | undefined;
				if (!children || children.length === 0) return false;

				return children.some((q) => {
					const tagIds: string[] | undefined = (q && (q as any).tagIds) as any;

					if (!Array.isArray(tagIds) || tagIds.length === 0) {
						return false;
					}

					return tagIds.includes(tag._id);
				});
			});
		});

		const tagsSorted = sortTagsForSidebar(tagsWithActiveMarkets);

		return { typeFilteredUmbrellas, tagsSorted, esportsTagId };
	}, [umbrellas, loading, tagsLoading, filterType, tags, restrictedMode]);

	const esportsTagLabel = defaultEsportsTagLabel(tags);
	const esportsMetaTag = linkFilterState.tagsSorted.find((t) => isEsportsMetaTagLabel(t.label));
	const allGameTags = linkFilterState.tagsSorted.filter((t) => !isEsportsMetaTagLabel(t.label));
	const gameTagsOnly = restrictedMode
		? allGameTags.filter((t) => isCounterStrikeTagLabel(t.label))
		: allGameTags;
	const restrictedDefaultLabel = restrictedMode ? homeDefaultSelectedTagLabel(tags) : null;
	const toggleOffTarget = restrictedMode ? restrictedDefaultLabel : esportsTagLabel;

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
				const children = (umbrella as any).children as Array<any> | undefined;
				if (!children || children.length === 0) continue;
				const hit = children.some((q) => {
					const tagIds: string[] | undefined = (q && (q as any).tagIds) as any;
					if (!Array.isArray(tagIds) || tagIds.length === 0) {
						return false;
					}
					return tagIds.includes(tag._id);
				});
				if (hit) c += 1;
			}
			map.set(tag._id, c);
		}
		return map;
	}, [linkFilterState]);

	React.useEffect(() => {
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

	const handleWorldCupSectionClick = (section: WorldCupSection) => {
		setWorldCupExpanded(true);
		onWorldCupSectionSelect?.(section);
	};

	const renderWorldCupBlock = () => {
		if (worldCupMarketCount <= 0) return null;

		const CaretIcon = worldCupExpanded ? FiChevronDown : FiChevronRight;

		return (
			<div className="game-link-world-cup-block" key={WORLD_CUP_PILL_ID}>
				<div
					className={`game-link game-link--world-cup-parent ${worldCupActive ? "active" : ""}`}
				>
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
								aria-label={worldCupExpanded ? "Collapse World Cup sections" : "Expand World Cup sections"}
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
					<div className="game-links-world-cup-children" role="group" aria-label="World Cup sections">
						<button
							type="button"
							className={`game-link game-link--sub ${
								worldCupActive && worldCupSection === "games" ? "active" : ""
							}`}
							onClick={() => handleWorldCupSectionClick("games")}
						>
							<span className="game-link__inner">
								<span className="game-link__leading">
									<span className="game-link__label">Games</span>
								</span>
								<span
									className="game-link__count"
									aria-label={`${worldCupSectionCounts.games} markets`}
								>
									{worldCupSectionCounts.games}
								</span>
							</span>
						</button>
						<button
							type="button"
							className={`game-link game-link--sub ${
								worldCupActive && worldCupSection === "groups" ? "active" : ""
							}`}
							onClick={() => handleWorldCupSectionClick("groups")}
						>
							<span className="game-link__inner">
								<span className="game-link__leading">
									<span className="game-link__label">Groups</span>
								</span>
								<span
									className="game-link__count"
									aria-label={`${worldCupSectionCounts.groups} markets`}
								>
									{worldCupSectionCounts.groups}
								</span>
							</span>
						</button>
					</div>
				) : null}
			</div>
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
		</div>
	);
}
