export interface PredictionMarket {
  id: string;
  title: string;
  category: string;
  description: string;
  currentPrice: string;
  volume24h: string;
  totalVolume: string;
  yesTokenId: string;
  noTokenId: string;
  tickSize: string;
  negRisk: boolean;
}

export const PREDICTION_MARKETS: Record<string, PredictionMarket> = {
  "gta6-postponed": {
    id: "gta6-postponed",
    title: "GTA 6 launch postponed?",
    category: "gaming",
    description: "Will Grand Theft Auto 6 be delayed beyond the announced release date?",
    currentPrice: "0.65",
    volume24h: "125.4K",
    totalVolume: "2.1M",
    yesTokenId: '113422584534297976999136945479250899853478754344170403422107239693639567376036',
    noTokenId: '15328813560949551633336324591873579080529539292643850489030538676832061047709',
    tickSize: "0.001",
    negRisk: false
  },
  "game-of-year": {
    id: "game-of-year",
    title: "Game of the Year?",
    category: "gaming",
    description: "Which game will win the prestigious Game of the Year award?",
    currentPrice: "0.48",
    volume24h: "89.2K",
    totalVolume: "1.8M",
    yesTokenId: '113422584534297976999136945479250899853478754344170403422107239693639567376036', // Placeholder - replace with actual token ID
    noTokenId: '15328813560949551633336324591873579080529539292643850489030538676832061047709',   // Placeholder - replace with actual token ID
    tickSize: "0.001",
    negRisk: false
  },
  "ps6-announced": {
    id: "ps6-announced",
    title: "PS6 Announced this year?",
    category: "gaming",
    description: "Will Sony announce the PlayStation 6 in the current year?",
    currentPrice: "0.32",
    volume24h: "67.8K",
    totalVolume: "950K",
    yesTokenId: '113422584534297976999136945479250899853478754344170403422107239693639567376036', // Placeholder - replace with actual token ID
    noTokenId: '15328813560949551633336324591873579080529539292643850489030538676832061047709',   // Placeholder - replace with actual token ID
    tickSize: "0.001",
    negRisk: false
  }
};

export function getPredictionMarket(marketId: string): PredictionMarket | undefined {
  return PREDICTION_MARKETS[marketId];
}

export function getAllPredictionMarkets(): PredictionMarket[] {
  return Object.values(PREDICTION_MARKETS);
}
