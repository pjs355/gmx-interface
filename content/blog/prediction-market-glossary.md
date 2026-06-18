---
title: "Prediction Market Glossary"
description: "Definitions for prediction market terms: implied probability, order book, liquidity, settlement, line shopping, and smart order routing."
slug: prediction-market-glossary
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "prediction market glossary"
faqs:
  - question: "What is implied probability in a prediction market?"
    answer: "Implied probability is the chance suggested by the current contract price. On most binary markets, a 55-cent Yes price implies about a 55% probability before fees and spread."
  - question: "What is an order book?"
    answer: "An order book lists all open buy and sell orders for a contract at different prices. Traders match against resting orders or take the best available price immediately."
  - question: "What does settlement mean?"
    answer: "Settlement is when a market resolves and winning contracts pay out while losing contracts expire worthless. Rules are defined per market on each venue."
  - question: "What is line shopping?"
    answer: "Line shopping is comparing prices for the same outcome across multiple prediction market venues before placing a trade to find the best available line."
  - question: "What is smart order routing?"
    answer: "Smart order routing automatically checks prices and liquidity across integrated venues at order time and sends the trade to the venue with the best available execution."
  - question: "What are matched events on ClutchComet?"
    answer: "Matched events are rows where ClutchComet's backend has linked the same outcome across venues. As of June 2026, ClutchComet shows 2,287 matched rows, not each venue's full catalog."
sources:
  - label: "Polymarket Documentation"
    url: "https://docs.polymarket.com/"
  - label: "Kalshi Learn"
    url: "https://kalshi.com/learn"
  - label: "ClutchComet coverage snapshot"
    url: "https://clutchcomet.com/about"
---

The prediction market sector traded an estimated $50B in notional volume in 2025. Kalshi alone cleared 97M transactions that year. This glossary covers the terms you will see on Polymarket, Kalshi, Limitless, Predict, and comparison-only venues when you read odds or compare prices on ClutchComet.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| 2025 sector volume (est.) | ~$50B |
| Kalshi 2025 notional volume | $23.8B |
| Kalshi open interest (end 2025) | ~$225M |
| ClutchComet matched rows | 2,287 |
| All Odds venues | 9 (4 tradeable, 5 comparison-only) |

## Implied probability

The probability suggested by a contract's current price. On a binary market, divide the Yes price in cents by 100 for a rough estimate. A 55-cent Yes implies about 55% before fees and spread.

## Order book

A live list of open buy (bid) and sell (ask) orders at different prices. You trade against resting orders or add your own. Polymarket, Kalshi, Limitless, and Predict all use order book models on ClutchComet's tradeable venues.

## Bid and ask

The bid is the highest price someone will pay to buy. The ask is the lowest price someone will sell for. You usually buy at the ask and sell at the bid.

## Spread

The gap between the best bid and best ask. A wider spread means higher implicit cost to enter and exit quickly. On a 50-cent contract, a 3-cent spread is 6% round-trip friction.

## Liquidity

How much size is available near the current price without moving the market. Deep liquidity means large orders fill with minimal price impact. Thin liquidity means your fill walks the book.

## Market order vs limit order

A market order fills immediately at the best available price. A limit order rests on the book at your chosen price until matched or canceled. Makers often pay lower or zero fees on many venues.

## Settlement

When the event resolves and contracts pay out. Winning Yes contracts typically pay $1 per share; losers pay $0. Rules are defined per market. Always read the contract spec.

## Line shopping

Comparing the same outcome's price across multiple venues before you trade. ClutchComet's All Odds view shows up to nine venues on matched events.

## Smart order routing

Automated venue selection at order time based on price and liquidity across integrated platforms. ClutchComet routes across Polymarket, Kalshi, Limitless, and Predict from one balance.

## Split order execution

When no single venue has enough liquidity at the best price, ClutchComet can split an order across multiple integrated venues for better overall fill quality.

## Matched events

Rows where ClutchComet has linked the same outcome across venues. As of June 2026: 2,287 total matched rows, 117 esports rows. Counts are not each venue's global catalog size.

## All Odds

ClutchComet's cross-venue price matrix. Four tradeable columns: Polymarket, Kalshi, Limitless, Predict. Five comparison-only columns: Myriad, BetDEX, Forkast, SX.bet (shown as SX), Hyperliquid.

## Event contract

A tradable agreement that pays based on whether a defined real-world outcome occurs. Also called a prediction market contract.

## USDC

The stablecoin Polymarket, Limitless, and several crypto-native venues use for deposits, trading, and settlement on supported chains.

## CFTC-regulated market

A U.S. exchange overseen by the Commodity Futures Trading Commission. Kalshi operates under this framework for event contracts with USD settlement.

## DFlow routing

Kalshi access on ClutchComet routes through DFlow. Enabling Kalshi trading may require identity verification through DFlow per ClutchComet's onboarding flow.

## Comparison-only venue

A venue whose prices ClutchComet displays on All Odds but does not execute on. Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid are comparison-only. Feed links are runtime-only on matched rows.

## Taker fee vs maker fee

Takers remove liquidity from the book (market orders or marketable limits). Makers add resting orders. Fee schedules differ by role and venue. Limitless charges 0% maker on limit orders; taker fees are dynamic from 0.03% to 3%.

## Notional volume vs DEX volume

Notional volume counts total traded value (common in Kalshi and Polymarket reports). DEX volume on DefiLlama measures on-chain protocol activity (common for Predict.fun, Myriad, SX.bet). Compare like metrics when reading stats.

## All-in price

The effective entry cost including ask price and taker fees. A 50¢ ask on Polymarket with a 1.56¢ taker fee per contract has a 51.56¢ all-in price for immediate buyers on 100 shares.

## Matched row

A ClutchComet catalog entry where the backend linked the same outcome across one or more venues. As of June 2026: 2,287 total, 117 esports.

## Comparison-only venue

Myriad, BetDEX, Forkast, SX.bet, or Hyperliquid on All Odds. Display prices when linked. No execution through ClutchComet.

## Tradeable venue

Polymarket, Kalshi, Limitless, or Predict. ClutchComet executes and routes orders across these four from one balance.

## Quick reference for ClutchComet traders

ClutchComet shows matched events only, not each venue's full catalog. As of June 2026 the catalog has 2,287 matched rows and 117 esports rows. Four venues are tradeable: Polymarket, Kalshi, Limitless, and Predict. Five are comparison-only: Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid.

All Odds columns appear per row when linked. Smart order routing checks the four tradeable venues at order time. Split order execution can fill large sizes across multiple books. One ClutchComet balance funds all four tradeable venues.

Before every trade: read the ask, check depth, net out fees, and scan comparison-only columns for a better quote outside execution. That workflow is line shopping, and it is the main reason traders use ClutchComet alongside any single venue.


ClutchComet executes on Polymarket, Kalshi, Limitless, and Predict from one balance, with smart order routing on matched events. ClutchComet also shows pricing from five comparison-only venues on All Odds: Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid.
