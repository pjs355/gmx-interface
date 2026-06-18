---
title: "Polymarket Explained for New Traders"
description: "Polymarket is a crypto-based prediction market for politics, sports, and macro events. Learn how contracts, USDC settlement, and order books work."
slug: polymarket-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "polymarket explained"
faqs:
  - question: "What is Polymarket?"
    answer: "Polymarket is a prediction market where traders buy and sell event contracts using USDC on Polygon. Prices reflect implied probabilities on politics, sports, crypto, and other events."
  - question: "Can U.S. users trade on Polymarket?"
    answer: "The main Polymarket platform blocks the United States and 29 other countries from placing orders. Polymarket US is a separate U.S.-accessible subset. Japan is frontend UI restricted only."
  - question: "What currency does Polymarket use?"
    answer: "Polymarket settles in USDC on the Polygon network. You deposit USDC to fund your account and trade contract shares priced in cents."
  - question: "How much volume does Polymarket trade?"
    answer: "Industry estimates put 2025 notional volume near $21–22B. March 2026 monthly volume reached roughly $10.57B per platform reports."
  - question: "What are Polymarket's fees?"
    answer: "Polymarket taker fee = C × feeRate × p × (1−p). Makers pay 0%. Sports feeRate is 0.03, so 100 shares at 50¢ costs $0.75 in fees ($50.75 all-in)."
sources:
  - label: "Polymarket"
    url: "https://polymarket.com/"
  - label: "Polymarket Documentation"
    url: "https://docs.polymarket.com/"
  - label: "BitKE - Polymarket March 2026"
    url: "https://bitcoinke.io/2026/04/polymarket-in-march-2026/"
  - label: "Pew Research - Category mix"
    url: "https://www.pewresearch.org/short-reads/2026/05/27/trading-volume-on-prediction-markets-has-soared-in-recent-months/"
---

Polymarket processed roughly $10.57B in monthly volume in March 2026 and an estimated $21–22B in notional volume across 2025. Polymarket is a prediction market where traders buy and sell event contracts settled in USDC on Polygon. Contract prices imply probabilities on politics, sports, crypto, and other topics. It is the largest crypto-native prediction market by volume alongside Kalshi's regulated U.S. book.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| 2025 notional volume (est.) | ~$21–22B |
| Mar 2026 monthly volume | ~$10.57B |
| Category mix (Jul 2024+) | Sports 39%, politics 32%, crypto 20% |
| Polymarket US Apr 2026 monthly | ~$1.3B |
| Settlement | USDC on Polygon |
| Main platform geoblock | US blocked; 28 other countries blocked (see below) |
| U.S. product | Polymarket US (separate U.S.-accessible subset) |

## Where is Polymarket available?

Polymarket publishes geographic restrictions through its geoblock API. Orders from blocked locations are rejected at the API level.

**Blocked from placing orders** (cannot open new positions on the main platform):

| Code | Country |
| --- | --- |
| AU | Australia |
| BE | Belgium |
| BY | Belarus |
| BI | Burundi |
| CF | Central African Republic |
| CD | Congo (Kinshasa) |
| CU | Cuba |
| DE | Germany |
| ET | Ethiopia |
| FR | France |
| GB | United Kingdom |
| IR | Iran |
| IQ | Iraq |
| IT | Italy |
| KP | North Korea |
| LB | Lebanon |
| LY | Libya |
| MM | Myanmar |
| NI | Nicaragua |
| NL | Netherlands |
| RU | Russia |
| SO | Somalia |
| SS | South Sudan |
| SD | Sudan |
| SY | Syria |
| UM | U.S. Minor Outlying Islands |
| US | United States |
| VE | Venezuela |
| YE | Yemen |
| ZW | Zimbabwe |

**Close-only** (can close existing positions but cannot open new ones): Poland (PL), Singapore (SG), Thailand (TH), Taiwan (TW).

**Frontend UI restricted** (Polymarket website blocked; API not restricted): Japan (JP).

**Blocked regions within otherwise accessible countries:**

| Country | Region |
| --- | --- |
| Canada (CA) | Ontario (ON) |
| Ukraine (UA) | Crimea, Donetsk, Luhansk |

Polymarket also operates **Polymarket US**, a separate U.S.-accessible subset that logged roughly $1.3B in April 2026 monthly volume. That book is distinct from the international platform described above.

## How does trading work on Polymarket?

Polymarket uses an order book model. Traders post bids and asks on Yes and No outcomes. You can take existing liquidity with a market order or post a limit order at your price and wait for a fill.

Contracts typically settle to $1 if the outcome you hold wins, and $0 if it loses. Your entry price determines profit or loss at settlement.

Read each market's resolution criteria before you trade. Two contracts with similar headlines can resolve differently if their rulebooks differ.

## What markets does Polymarket list?

Polymarket is known for U.S. politics, macro events, and sports. Esports coverage varies by event. Market availability changes as new contracts launch and old ones resolve.

Since mid-2024, sports has grown to 39% of Polymarket volume, politics 32%, and crypto 20%. Polymarket US (the U.S.-accessible subset) logged roughly $1.3B in April 2026 monthly volume separately from the international book.

## What are Polymarket's fees?

Polymarket charges takers only. Makers pay 0%. Taker fees use this formula:

**fee = C × feeRate × p × (1 − p)**

Where C is contracts traded and p is the fill price (0 to 1). feeRate depends on market category:

| Category | Taker feeRate | Maker feeRate |
| --- | --- | --- |
| Sports | 0.03 | 0 |
| Crypto | 0.07 | 0 |
| Finance, Politics, Mentions, Tech | 0.04 | 0 |
| Economics, Culture, Weather, Other | 0.05 | 0 |
| Geopolitics | 0 | 0 |

Fee math example (sports market): buy 100 Yes shares at 50¢ as a taker.

- feeRate = 0.03, p = 0.50, C = 100
- Fee = 100 × 0.03 × 0.50 × (1 − 0.50) = **$0.75**
- You pay $50.00 + $0.75 = **$50.75** all-in
- If Yes settles at $1, you receive $100. Net profit is **$49.25**

At 50¢ the sports fee peaks at $0.75 per 100 shares and falls symmetrically toward $0.01 and $0.99.

## How does Polymarket compare to Kalshi?

Kalshi is CFTC-regulated with USD settlement and skews sports at roughly 80% of volume since mid-2024. Polymarket is crypto-native with global participation and a heavier politics and crypto mix.

The same headline event can trade at different prices on each book. Gaps of 2–5 cents on active markets are common. Contract definitions may differ even when titles look similar.

Kalshi traded $23.8B in 2025 with sports at roughly 80% of volume since mid-2024. Polymarket estimated $21–22B in 2025 with sports at 39%, politics at 32%, and crypto at 20%. Kalshi settles USD under CFTC oversight. Polymarket settles USDC on Polygon. Together they account for the vast majority of sector activity.

## Who uses Polymarket?

Polymarket attracts traders who want crypto-native settlement, deep liquidity on politics and macro, and a global order book. Sports and esports participation has grown sharply since 2024. Traders who need every politics, macro, and culture contract in Polymarket's full catalog use the platform directly.

For cross-venue line shopping on matched sports and esports events, aggregators like ClutchComet include Polymarket as one of several integrated venues alongside Kalshi, Limitless, and Predict.
