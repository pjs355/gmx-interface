# ClutchComet Traffic Review Cadence

Recurring SEO and content performance loop for blog and lander pages.

## Schedule

| Cadence | Ploybook | Scope |
| --- | --- | --- |
| **Monthly** | `analyse-web-traffic` | Full site traffic quality, top pages, engagement |
| **Monthly** | `gsc-keyword-optimization` | One high-value URL per run (rotate through `/blog/*` and `/learn/*`) |
| **Quarterly** | `seo-aeo-strategy-system` | Refresh content map, expand winners, merge/cut losers |

## When to Start

Begin the monthly loop **3–4 weeks after deploy** once GSC has indexed pages and accumulated impression data.

## Decision Rules

- **Winner:** Rising impressions + clicks + on-site engagement → expand cluster (follow-up MOFU/BOFU)
- **Loser:** Impressions but weak engagement → rewrite direct-answer paragraph + FAQ block
- **No data:** Wait 90 days before major rewrites on new URLs

## GSC Setup (one-time after deploy)

1. Open [Google Search Console](https://search.google.com/search-console)
2. Select property: `clutchcomet.com`
3. Submit sitemap: `https://clutchcomet.com/sitemap.xml`
4. URL Inspection → Request indexing for:
   - `https://clutchcomet.com/blog`
   - `https://clutchcomet.com/blog/what-is-a-prediction-market`
   - `https://clutchcomet.com/learn/cs2`

## Sample URLs to Track

Rotate these through monthly GSC optimization:

- `/blog/what-is-a-prediction-market`
- `/blog/how-to-compare-odds-across-prediction-markets`
- `/blog/polymarket-explained`
- `/learn/cs2`
- `/learn/line-shopping`

## Crawlability Spot Checks (each deploy)

```bash
curl -s https://clutchcomet.com/robots.txt
curl -s https://clutchcomet.com/sitemap.xml | head -40
curl -s https://clutchcomet.com/blog/what-is-a-prediction-market | grep -o '<h1>[^<]*</h1>'
```

H1 must appear in curl output (no JS required).
