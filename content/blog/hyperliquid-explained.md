---
title: "Hyperliquid Outcome Markets Explained for New Traders"
description: "Hyperliquid HIP-4 outcome markets launched in May 2026. Learn how HL outcome markets work and how they differ from HIP-3 perps."
slug: hyperliquid-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "hyperliquid prediction markets explained"
faqs:
  - question: "Does Hyperliquid have prediction markets?"
    answer: "Hyperliquid launched HIP-4 outcome markets in May 2026. Day-one reports cited roughly 6M contracts in notional volume. This is separate from HIP-3 builder perp markets."
  - question: "How big is Hyperliquid overall?"
    answer: "HIP-3 builder-deployed perp volume reached roughly $62B/month in May 2026 per The Defiant. That perp stack is a different product from HIP-4 outcomes."
  - question: "How do HIP-4 outcomes differ from perps?"
    answer: "HIP-4 outcome markets settle on defined event results like prediction market contracts. HIP-3 perps are leveraged perpetual contracts on price feeds, a different product category."
  - question: "What are Hyperliquid outcome market fees?"
    answer: "HIP-4 outcome markets charge no fee on open. Settlement uses tier-0 perps taker rate 0.045% on $1/share. Buy 100 at 50¢ ($50 entry), settle Yes: $0.045 fee, $49.955 net profit."
  - question: "Who can use Hyperliquid?"
    answer: "Hyperliquid docs restrict users from sanctioned jurisdictions (Cuba, Iran, Myanmar, North Korea, Syria, certain Russian-occupied Ukraine regions) and from certain activities involving the U.S. or Ontario."
sources:
  - label: "The Defiant - Hyperliquid HIP-3 volume"
    url: "https://thedefiant.io/news/defi/builder-deployed-perp-markets-push-hyperliquid-to-record-share-of-global-perps-volume"
  - label: "Hyperliquid Docs"
    url: "https://hyperliquid.gitbook.io/hyperliquid-docs"
  - label: "CoinGecko - HIP-4 launch coverage"
    url: "https://www.coingecko.com/"
---

Hyperliquid's HIP-3 builder perps cleared roughly $62B in monthly volume in May 2026, while HIP-4 outcome markets launched the same month with day-one reports citing roughly 6M contracts in notional volume. These are different products. HIP-4 outcome markets settle on defined event results. HIP-3 perps are leveraged perpetual contracts on price feeds.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| HIP-3 perp volume (May 2026) | ~$62B/month (builder markets) |
| HIP-4 outcome markets | Launched May 2026; day-one ~6M contracts notional |
| Restricted jurisdictions | Sanctioned countries; U.S. and Ontario for certain activities |

## Where is Hyperliquid available?

Hyperliquid's documentation sets eligibility criteria for platform access. You must not be from:

- **Sanctioned jurisdictions**, including Cuba, Iran, Myanmar, North Korea, Syria, and certain Russian-occupied regions of Ukraine
- **Jurisdictions subject to applicable restrictions**, including **certain activities involving the United States or Ontario**

The Hyperliquid Foundation reserves the right to adjust eligibility criteria at any time.

## What are Hyperliquid outcome markets?

HIP-4 outcome markets let traders take positions on defined event results, closer to prediction market contracts than perpetual futures. They launched in May 2026 alongside Hyperliquid's existing DeFi infrastructure.

Outcome markets settle based on event resolution rules defined per market. This is distinct from HIP-3 builder-deployed perps, which track price feeds with leverage.

HIP-3 perp volume and HIP-4 outcome activity measure different products. Perp volume does not tell you how deep outcome market books are on a given event.

## How do Hyperliquid outcome fees work?

HIP-4 outcome markets charge fees **only when closing or settling**, not when opening a position. Fee tiers follow Hyperliquid's **perps** schedule (not spot). At tier 0 (base):

| Role | Tier 0 rate | When it applies (outcomes) |
| --- | --- | --- |
| Open (buy) | 0% | No fee when opening |
| Close / settle (taker) | 0.045% | Fee on settlement notional |
| Close / settle (maker) | 0.015% | Makers who would get rebates on perps pay 0% on outcomes |

Settlement fee formula (tier 0 taker, hold to Yes):

**fee = shares × $1.00 × 0.00045**

Fee math example: buy 100 Yes outcome shares at 50¢, hold to settlement.

- Entry = 100 × $0.50 = **$50.00**
- Open fee = **$0.00**
- If Yes settles at $1: settlement notional = 100 × $1.00 = $100.00
- Settlement fee = $100.00 × 0.045% = **$0.045**
- You receive $100.00 − $0.045 = **$99.955**
- Net profit = **$49.955**

Higher 14-day volume unlocks lower taker rates (0.040% at tier 1, down to 0.024% at tier 6). Outcome trading does not support maker rebates.

## How do HIP-3 perps and HIP-4 outcomes differ?

HIP-3 builder-deployed perps cleared roughly $62B in monthly volume in May 2026 per The Defiant. These are leveraged perpetual contracts on price feeds. HIP-4 outcome markets, launched May 2026, settle on defined event results like prediction market contracts.

Traders who want both products in one Hyperliquid account use the native app. Outcome market liquidity is newer (May 2026 launch) and may be thinner on niche events than on Polymarket or Kalshi.

## How does Hyperliquid compare to Polymarket?

Polymarket is a dedicated prediction market with USDC on Polygon and estimated $21–22B in 2025 notional volume. Hyperliquid outcome markets sit inside a broader DeFi exchange ecosystem with massive perp volume separately.

On matched rows where both link, prices can diverge. Outcome market liquidity on HL is newer and may be thinner on niche events.

## Who uses Hyperliquid outcome markets?

Hyperliquid fits traders who already use HL for perps and want HIP-4 outcomes in the same account. ClutchComet shows Hyperliquid outcome prices on All Odds for line shopping on matched events when the feed links.
