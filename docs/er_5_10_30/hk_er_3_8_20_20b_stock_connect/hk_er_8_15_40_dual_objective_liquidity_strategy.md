# HK ER 8/15/40 Dual Objective Liquidity Strategy

## Summary

This is the current Hong Kong dashboard strategy for:

- URL: `http://127.0.0.1:8765/hk_er_3_8_20_20b_stock_connect/index.html`
- Market: Hong Kong stocks only
- Universe: Southbound Stock Connect constituents only
- Market cap floor: `20,000,000,000 HKD`
- Industry filter: disabled
- Selection style: `dual_objective_liquidity`
- Rebalance style: daily replacement-only backtest path
- Benchmark: Hang Seng Index, `HK.800000`

The strategy remains an ER relative-strength strategy. Liquidity is used as a secondary tie-breaker at every selection layer, not as the primary objective.

## Core Parameters

| Parameter | Value |
|---|---:|
| Fast ER window | `8` trading days |
| Mid ER window | `15` trading days |
| Slow ER window | `40` trading days |
| Stage 1 count | `150` |
| Stage 2 count | `80` |
| Final basket | `10` |
| Minimum market cap | `20B HKD` |
| Minimum price | `5 HKD` |
| Minimum ADV20 | `20M HKD` |
| Benchmark trend filter | disabled |
| Industry whitelist | disabled |

## Universe Rules

A stock must pass all of these filters before ranking:

- It is a Hong Kong stock.
- It is in the Southbound Stock Connect universe.
- Latest static market cap is at least `20B HKD`.
- Adjusted close is at least `5 HKD`.
- ADV20 is at least `20M HKD`.
- It has enough price history for the configured ER and liquidity windows.
- Fast ER, mid ER, and slow ER must all be positive on the signal date.

## Ranking Logic

The strategy uses three selection stages.

### Stage 1: Fast ER With Liquidity Tie-Breaker

Candidate stocks are sorted by:

```text
er8 desc, adv20 desc, er40 desc, ticker asc
```

The top `150` stocks move to Stage 2.

### Stage 2: Mid ER With Liquidity Tie-Breaker

Stage 1 stocks are sorted by:

```text
er15 desc, adv20 desc, er40 desc, ticker asc
```

The top `80` stocks move to Stage 3.

### Stage 3: Dual Objective Final Basket

Stage 2 stocks are sorted by:

```text
er40 desc, vol20_ann asc, adv20 desc, ticker asc
```

The final top `10` stocks become the target basket.

## Interpretation

The strategy has three priorities:

1. Select stocks with positive short, medium, and slow relative strength.
2. Prefer stronger ER names first.
3. When ER ranking is close, prefer higher-liquidity stocks through `adv20 desc`.

Liquidity does not override ER. A high-turnover stock with weak ER should not enter the basket just because it trades heavily.

## Daily Signal And Execution Meaning

The dashboard signal is based on daily close data:

- Signal date uses the latest completed trading day's close.
- Target basket is intended for the next tradable session.
- The dashboard is analytical; it does not place HK live trades.

## Output Files

Main dashboard output directory:

```text
/Users/richard/dowork/hk_gap_strategy/results/daily_us_waterfall_dashboard/latest/hk_er_3_8_20_20b_stock_connect
```

Important files:

- `index.html`: local dashboard page.
- `dashboard_summary.json`: strategy parameters and latest summary.
- `latest_signal_top10.csv`: latest selected target basket.
- `planned_holdings_top10.csv`: planned basket after replacement-only logic.
- `current_holdings.csv`: current backtest holdings.
- `daily_nav.csv`: NAV curve.
- `historical_buy_counts.csv`: historical buy counts by ticker.
- `profit_contribution_by_ticker.csv`: realized plus ending-market-value contribution by ticker.

## Known Risks

- Market cap metadata is static, so historical market-cap filtering can contain look-ahead bias.
- The `8/15/40` and `dual_objective` base were selected after a parameter search focused partly on `HK.06869` 长飞光纤光缆, so overfitting risk exists.
- Liquidity tie-breakers improve tradability preference but do not guarantee better future returns.
- The dashboard backtest is not a live HK trading system.
