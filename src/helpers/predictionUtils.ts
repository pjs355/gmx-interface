// Helper function to calculate prices from orderbook
export const calculateOrderbookPrices = (orderbook: any) => {
  if (!orderbook) return { bestAsk: null, bestBid: null };
  
  const bestAsk = orderbook.asks && orderbook.asks.length > 0 
    ? Math.min(...orderbook.asks.map((a: any) => a.price))
    : null;
    
  const bestBid = orderbook.bids && orderbook.bids.length > 0
    ? Math.max(...orderbook.bids.map((b: any) => b.price))
    : null;
    
  return { bestAsk, bestBid };
};

// Helper function to format price as cents
export const toCentsString = (value?: number | null): string => {
  if (value === undefined || value === null || !isFinite(value)) return "--";
  return Math.round(value * 100).toString();
};

// Helper function to get top 2 markets by highest Yes price
export const getTopTwoMarkets = (
  umbrellaId: string, 
  multiMarketData: {[umbrellaId: string]: {questions: any[], orderbooks: {[questionId: string]: any}}}
) => {
  const data = multiMarketData[umbrellaId];
  if (!data) return [];

  const { questions, orderbooks } = data;
  
  // Calculate Yes prices for all markets and sort by highest
  const marketsWithPrices = questions.map(question => {
    const orderBookId = question._id || question.questionId || question.marketId;
    const orderbook = orderbooks[orderBookId];
    const { bestAsk } = calculateOrderbookPrices(orderbook);
    return {
      question,
      yesPrice: bestAsk,
      orderBookId
    };
  }).sort((a, b) => {
    // Sort by highest Yes price first, handle nulls by putting them at the end
    if (a.yesPrice === null && b.yesPrice === null) return 0;
    if (a.yesPrice === null) return 1;
    if (b.yesPrice === null) return -1;
    return b.yesPrice - a.yesPrice;
  });

  return marketsWithPrices.slice(0, 2); // Return top 2
};

// Helper function to truncate market name
export const truncateMarketName = (name: string, maxLength: number = 25) => {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + '...';
};

/** Compact label for match-winner buttons: first word when multi-word, else truncate with ellipsis. */
export const shortenTeamLabelForButton = (
	name: string,
	maxChars: number = 14,
): string => {
	const trimmed = name.trim();
	if (!trimmed) return trimmed;

	const firstSpace = trimmed.search(/\s/);
	let candidate =
		firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace).trim();
	if (!candidate) candidate = trimmed;

	const ellipsis = "…";
	if (candidate.length > maxChars) {
		const keep = Math.max(1, maxChars - ellipsis.length);
		return candidate.slice(0, keep) + ellipsis;
	}
	return candidate;
};
