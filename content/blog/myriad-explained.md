---
title: "Myriad Markets Explained for New Traders"
description: "Myriad is a multi-chain prediction app on BSC, Abstract, and Linea with roughly 3% fees. Learn how Myriad works, what it lists, and how its fees compare."
slug: myriad-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "myriad markets explained"
faqs:
  - question: "What is Myriad Markets?"
    answer: "Myriad Markets is a multi-chain prediction app where traders buy and sell event contracts on BSC, Abstract, and Linea. Press reports 400K+ active traders and 6.3M+ trades."
  - question: "How much volume does Myriad trade?"
    answer: "DefiLlama reports roughly $228.6M cumulative DEX volume and about $2.9M in 30-day DEX volume as of the June 2026 snapshot."
  - question: "What are Myriad fees?"
    answer: "Myriad order-book taker fee = peakBPS × min(p, 1−p) / 0.5. Peak is 150 BPS (1.5%) at 50¢. Makers pay 0%. At 50¢, 100 shares costs $0.75 in fees ($50.75 all-in)."
  - question: "What is Myriad's TVL?"
    answer: "DefiLlama reports roughly $481K TVL as of the June 2026 snapshot."
  - question: "What chains does Myriad support?"
    answer: "Myriad operates on BSC, Abstract, and Linea. Liquidity may split across chains for similar headline markets."
sources:
  - label: "DefiLlama - Myriad Markets"
    url: "https://defillama.com/protocol/myriad-markets"
  - label: "Dune - Myriad Markets"
    url: "https://dune.com/surfquery/myriad-markets"
  - label: "Bitcoin.com - Myriad growth"
    url: "https://news.bitcoin.com/prediction-protocol-myriad-surpasses-100m-trading-volume-reports-10x-growth-in-3-months/"
  - label: "Myriad Markets"
    url: "https://myriad.markets/"
---

Myriad Markets reports 400K+ active traders and 6.3M+ cumulative trades in press coverage, with DefiLlama citing roughly $228.6M in cumulative DEX volume. Myriad is a multi-chain prediction app on BSC, Abstract, and Linea where traders buy and sell event contracts on crypto brackets, culture markets, and short-duration events.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| Cumulative DEX volume | ~$228.6M |
| 30d DEX volume | ~$2.9M |
| TVL | ~$481K |
| Fees | 1.5% peak taker (order book); 0% maker |
| Users (press, cumulative) | 400K+ active traders; 6.3M+ trades |

## How does trading work on Myriad?

Myriad lists short-term and event-driven contracts across multiple chains. Traders connect wallets on supported chains and buy Yes or No positions on listed markets.

Settlement follows each market's rules on the chain where the market lives. Multi-chain deployment means the same headline market may exist on different chains with separate liquidity.

## What markets does Myriad list?

Myriad focuses on crypto brackets, culture markets, and short-duration event contracts. Points campaigns and promotional markets appear frequently in Myriad's positioning.

Volume metrics differ by source. DefiLlama DEX volume and Dune trade volume measure different activity. Use the metric that matches your question when comparing Myriad to other venues.

## How do Myriad fees work?

Myriad order-book markets charge takers only. Makers pay **0%** and receive fee rebates from taker volume.

Taker fee formula:

**feeBPS(p) = peakBPS × min(p, 1 − p) / 0.5**

**fee (USD) = notional × (feeBPS ÷ 10,000)**, where notional = shares × price.

The peak rate at $0.50 is **150 BPS (1.5%)**. The rate scales linearly to 0% at $0.01 and $0.99.

| Role | Fee |
| --- | --- |
| Taker (market order) | peakBPS × min(p, 1−p) / 0.5 on notional |
| Maker (limit order) | 0% (plus rebates from taker fees) |

Fee math example: buy 100 Yes shares at 50¢ as a taker.

- peakBPS = 150, p = 0.50
- feeBPS = 150 × 0.50 / 0.50 = 150 BPS = 1.5%
- Notional = 100 × $0.50 = $50.00
- Fee = $50.00 × 1.5% = **$0.75**
- You pay $50.00 + $0.75 = **$50.75** all-in
- If Yes settles at $1, you receive $100. Net profit is **$49.25**

Fee math comparison at 50¢ on 100 shares:

**Myriad** (1.5% peak taker): $50.00 + $0.75 = $50.75. Payout if Yes: $100. Net profit: $49.25.

**Polymarket sports** (fee = C × 0.03 × p × (1−p)): $50.00 + $0.75 = $50.75. Payout if Yes: $100. Net profit: $49.25.

Same 50¢ ask, same all-in cost on this trade because both peak at 1.5% effective rate at the midpoint.

## How does Myriad compare to Predict.fun?

Predict.fun reports roughly $2.22B cumulative DEX volume on DefiLlama with about $280M in 30-day volume. Myriad reports roughly $228.6M cumulative DEX volume with about $2.9M in 30-day volume. Predict sits on BSC with taker-only fees (2% base at 50¢). Myriad spans BSC, Abstract, and Linea with a 1.5% peak taker curve on order-book markets.

## What chains does Myriad support?

Myriad operates on BSC, Abstract, and Linea. Multi-chain deployment means liquidity may split across chains for similar headline markets. Check which chain a specific market uses before you fund a wallet.

## Who uses Myriad?

Myriad fits traders who want points campaigns, short-term crypto brackets, and multi-chain prediction markets outside the major regulated and Polygon books. Aggregators like ClutchComet show Myriad prices on All Odds for line shopping when the feed links a matched row.
