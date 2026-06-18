---
title: "Predict.fun Explained for New Traders"
description: "Predict.fun is a BNB Chain prediction market with taker-only fees and Binance Wallet integration. Learn how Predict contracts, volume, and fees work."
slug: predict-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "predict.fun explained"
faqs:
  - question: "What is Predict.fun?"
    answer: "Predict.fun is a prediction market on BNB Chain where traders buy and sell event contracts. DefiLlama reports roughly $2.22B in cumulative DEX volume."
  - question: "What chain does Predict.fun use?"
    answer: "Predict.fun operates primarily on BSC (BNB Chain) per DefiLlama. Binance Wallet integration drove much of its 2026 growth."
  - question: "What are Predict.fun fees?"
    answer: "Predict.fun charges takers only. Fee = baseFee × min(price, 1−price) × shares. At 2% base and 50¢, 100 shares costs $1.00 in fees ($51.00 all-in). Makers pay 0%."
  - question: "How much volume does Predict.fun trade?"
    answer: "DefiLlama reports roughly $2.22B cumulative DEX volume and about $280M in 30-day DEX volume as of the June 2026 snapshot, with roughly $19.1M TVL."
  - question: "Does Predict.fun offer yield on collateral?"
    answer: "Predict.fun markets yield on collateral as a product feature. Verify current yield terms on Predict.fun before you hold positions."
sources:
  - label: "DefiLlama - Predict.fun"
    url: "https://defillama.com/protocol/predict-fun"
  - label: "Predict.fun"
    url: "https://predict.fun/"
---

Predict.fun reports roughly $2.22B in cumulative DEX volume on DefiLlama and about $280M in 30-day volume as of the June 2026 snapshot. Predict.fun is a BNB Chain prediction market where traders buy and sell event contracts with taker-only fees. Binance Wallet integration drove much of its 2026 growth.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| Cumulative DEX volume | ~$2.22B |
| 30d DEX volume | ~$280M |
| TVL | ~$19.1M |
| Fees | Taker-only on prediction trades |
| Chain | BSC (primary) |

## How does trading work on Predict.fun?

Predict.fun lists binary event contracts on sports, crypto, and other categories. Traders buy Yes or No shares through the platform's order book or AMM-style interfaces depending on the market type.

Contracts settle based on each market's resolution rules. Winning shares pay out per the contract spec; losing shares expire worthless.

Predict.fun also offers yield on collateral for some markets. That can affect hold-vs-trade decisions. Verify current terms on Predict.fun.

## What markets does Predict.fun list?

Predict.fun grew through BNB ecosystem distribution and Binance Wallet flows. Sports and crypto brackets are common. Esports coverage is smaller than on Polymarket or Kalshi but growing with BNB-native distribution.

## How do Predict.fun fees work?

Predict.fun charges takers only. Makers pay **0%**.

Taker fee formula:

**fee = baseFee × min(price, 1 − price) × shares**

Where baseFee is the market's base rate (typically **2%** = 0.02). A 10% fee discount, when active, multiplies the fee by 0.9.

| Role | Fee |
| --- | --- |
| Taker | baseFee × min(p, 1−p) × shares (0.018%–2% effective by price) |
| Maker | 0% |

At 50¢ with 2% base, the effective rate is 2% of notional. At $0.01 or $0.99 it drops to 0.018%.

Fee math example: buy 100 Yes shares at 50¢ as a taker (2% base, no discount).

- min(0.50, 0.50) = 0.50
- Fee = 0.02 × 0.50 × 100 = **$1.00**
- You pay $50.00 + $1.00 = **$51.00** all-in
- If Yes settles at $1, you receive $100. Net profit is **$49.00**

With the 10% discount active, the same trade costs $0.90 in fees ($50.90 all-in, $49.10 net profit).

## How does Predict.fun compare to Polymarket?

Polymarket settles in USDC on Polygon with estimated $21–22B in 2025 notional volume. Predict.fun settles on BSC with DefiLlama DEX metrics. The trader bases and distribution channels differ.

Polymarket skews politics (32%) and sports (39%). Predict.fun grew through BNB ecosystem distribution and Binance Wallet flows. On matched rows where both link, prices can diverge by 2–4 cents after fees.

## What is Predict.fun TVL and why does it matter?

DefiLlama reports roughly $19.1M TVL on Predict.fun as of the June 2026 snapshot. TVL reflects collateral locked in the protocol, not the same metric as 30-day DEX volume (~$280M). Higher TVL can support larger positions on some markets, but always check order book depth at your size.

## Who uses Predict.fun?

Predict.fun fits Binance Wallet users and BNB-native traders who want yield-on-collateral features and Predict's full market catalog. ClutchComet includes Predict as one of four tradeable venues on matched events alongside Polymarket, Kalshi, and Limitless.
