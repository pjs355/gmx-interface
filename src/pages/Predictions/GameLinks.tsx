import React from "react";

// Load all game logo images from the local GameLogos directory using Vite's glob import
const links = [
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
const gameNames = links
  .map((name) => {
    return name;
  })
  .sort((a, b) => a.localeCompare(b));

interface GameLinksProps {
  selectedGame: string | null;
  onGameSelect: (game: string | null) => void;
}

export default function GameLinks({ selectedGame, onGameSelect }: GameLinksProps) {
  if (gameNames.length === 0) return null;

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
            onClick={() => onGameSelect(name)}
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
