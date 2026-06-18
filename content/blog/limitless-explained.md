---
title: "Limitless Explained for New Traders"
description: "Limitless is an on-chain prediction market on Base with USDC settlement and dynamic taker fees. Learn how Limitless contracts, fees, and order books work."
slug: limitless-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "limitless prediction market explained"
faqs:
  - question: "What is Limitless?"
    answer: "Limitless is an on-chain prediction market on Base where traders buy and sell event contracts settled in USDC. It uses a central limit order book with dynamic taker fees."
  - question: "What chain does Limitless use?"
    answer: "Limitless runs on Base with USDC collateral. Deposits, trading, and settlement follow Base network rules."
  - question: "What are Limitless fees?"
    answer: "Limitless charges dynamic taker fees from 0.03% to 3% by probability on the order book. Maker fees are 0% on limit orders per Limitless documentation."
  - question: "How much volume has Limitless traded?"
    answer: "Industry sources cite cumulative volume between roughly $270M and $497M depending on methodology."
  - question: "What is Limitless best known for?"
    answer: "Limitless has strong activity on short-duration crypto price markets and esports contracts where its Base-native book attracts active traders."
sources:
  - label: "Limitless"
    url: "https://limitless.exchange/"
  - label: "DappRadar - Limitless"
    url: "https://dappradar.com/"
  - label: "IQ.wiki - Limitless"
    url: "https://iq.wiki/"
---

Limitless claims $270M to $497M in cumulative volume across sources and charges dynamic taker fees from 0.03% to 3% on its Base order book. Limitless is an on-chain prediction market where traders buy and sell event contracts settled in USDC. It uses a central limit order book with 0% maker fees on limit orders. Short-duration crypto price brackets and esports match contracts are common categories on the platform.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| Cumulative volume (claims) | $270M–$497M |
| Taker fees (order book) | 0.03%–3% dynamic by probability |
| Maker fees | 0% (limit orders) |
| Chain / collateral | Base, USDC |
| Funding raised | ~$7–9M |

## How does trading work on Limitless?

Limitless uses a central limit order book (CLOB). Post a limit order to add liquidity at your price, or hit the ask to take liquidity immediately. Yes and No contracts settle to $1 or $0 based on each market's resolution rules.

Because Limitless runs on Base, you need USDC on Base to fund trades directly on the platform. Gas fees apply to on-chain transactions.

## What markets does Limitless list?

Limitless is known for short-duration crypto price markets (hourly and daily brackets) and esports match contracts. Availability changes as markets launch and resolve.

Limitless is smaller by matched-row count than Polymarket or Kalshi on cross-venue aggregators, but it can lead on specific crypto and esports lines when its book is active.

## How do Limitless fees work?

Limitless has two market types with different fee schedules.

**CLOB (order book) markets:** dynamic taker fees by price. Makers pay 0% on resting limit orders.

**fee (USD) = notional × (feePercent ÷ 100)**, where notional = contracts × price.

| CLOB side | Fee at 50¢ | Fee range (by price) |
| --- | --- | --- |
| Buy taker | 3.00% | 3.00% at $0.01–$0.50, then falls toward 0.40% at $0.999 |
| Sell taker | 1.50% | 0.42% at $0.01, peaks 1.50% at $0.50, falls toward 0.42% at $0.999 |
| Maker (limit) | 0% | 0% |

**AMM markets:** flat **0.40%** taker fee on notional.

Fee math example (CLOB buy taker): buy 100 Yes shares at 50¢.

- Notional = 100 × $0.50 = $50.00
- Buy taker rate at 50¢ = 3.00%
- Fee = $50.00 × 3.00% = **$1.50**
- You pay $50.00 + $1.50 = **$51.50** all-in
- If Yes settles at $1, you receive $100. Net profit is **$48.50**

Post a resting limit order instead and the maker fee is 0%. Selling as a taker at 50¢ costs 1.50% of notional ($0.75 on 100 shares at 50¢).

## How does Limitless compare to Polymarket?

Both are crypto-native with stablecoin settlement. Polymarket uses USDC on Polygon and dominates global notional volume at roughly $21–22B in 2025. Limitless uses Base and focuses more on short crypto brackets.

Cross-venue gaps on matched esports and sports rows are common when both books list the same event.

## What are Limitless crypto bracket markets?

Limitless is known for hourly and daily crypto price brackets. These short-duration contracts attract active takers during volatile sessions. Maker orders at 0% fees reward patient limit posting on Limitless directly.

## Who uses Limitless?

Limitless fits traders who post maker limits on Base crypto brackets, trade esports match contracts on-chain, and want dynamic taker fees that scale with probability. ClutchComet includes Limitless as one of four tradeable venues on matched events with smart order routing across Polymarket, Kalshi, Limitless, and Predict.
