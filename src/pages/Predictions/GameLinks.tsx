import React from "react";
import type { Umbrella } from "lib/umbrellaDataService";

// All possible game names
const allGameNames = [
  "Apex Legends",
  "Battlefield",
  "Call of Duty",
  "Counter-Strike 2",
  "Dota 2",
  "Fortnite",
  "GTA VI",
  "League of Legends",
  "Pokemon",
  "Star Wars",
  "Valorant",
  "World of Warcraft",
];

interface GameLinksProps {
  selectedGame: string | null;
  onGameSelect: (game: string | null) => void;
  umbrellas?: Umbrella[];
  loading?: boolean;
  filterType?: 'esports' | 'games';
}

export default function GameLinks({ selectedGame, onGameSelect, umbrellas = [], loading = false, filterType }: GameLinksProps) {
  // Helper function to normalize tags (same as in Predictions.tsx)
  const normalizeTag = (value: string) =>
    value
      .toUpperCase()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  // Filter game names to only show games that have active markets for the current page type
  const gameNames = React.useMemo(() => {
    if (loading || !umbrellas || umbrellas.length === 0) {
      return []; // Don't show any games while loading
    }

    // First filter out inactive umbrellas (same logic as home page cards)
    const activeUmbrellas = umbrellas.filter((umbrella) => {
      return (umbrella as any).active === true;
    });

    // Then filter umbrellas by esports/games type if filterType is provided
    const filteredUmbrellas = filterType ? activeUmbrellas.filter((umbrella) => {
      const children = (umbrella as any).children as Array<any> | undefined;
      if (!children || children.length === 0) return false;
      
      // Check if any child has the ESPORTS tag
      const hasEsportsTag = children.some((q) => {
        const tags: string[] | undefined = (q && (q as any).tags) as any;
        if (!tags || tags.length === 0) return false;
        return tags.some((t) => normalizeTag(t) === "ESPORTS");
      });

      // Filter based on filterType
      if (filterType === 'esports') {
        return hasEsportsTag;
      } else { // games
        return !hasEsportsTag;
      }
    }) : activeUmbrellas;

    const gamesWithActiveMarkets = allGameNames.filter(gameName => {
      const normalizedGame = normalizeTag(gameName);
      return filteredUmbrellas.some(umbrella => {
        const children = (umbrella as any).children as Array<any> | undefined;
        if (!children || children.length === 0) return false;
        return children.some((q) => {
          const tags: string[] | undefined = (q && (q as any).tags) as any;
          if (!tags || tags.length === 0) return false;
          return tags.some((t) => normalizeTag(t) === normalizedGame);
        });
      });
    });

    return gamesWithActiveMarkets.sort((a, b) => a.localeCompare(b));
  }, [umbrellas, loading, filterType]);

  // Don't render anything while loading or if no games have active markets
  if (loading || gameNames.length === 0) return null;

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

  React.useEffect(() => {
    // Ensure we start at the far left
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', onScroll as any);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  const scrollByAmount = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

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
      <nav className="game-links-bar game-links-scroll" aria-label="Game links" ref={scrollRef}>
        {gameNames.map((name) => (
          <button
            className={`game-link ${selectedGame === name ? 'active' : ''}`}
            key={name}
            onClick={() => {
              // Toggle selection: if already selected, deselect; otherwise select
              if (selectedGame === name) {
                onGameSelect(null);
              } else {
                onGameSelect(name);
              }
            }}
          >
            {name}
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
