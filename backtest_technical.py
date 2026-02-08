#!/usr/bin/env python3
"""Rolling-window back-test for the TechnicalAgent.

Fetches ~2 years + 250-day buffer of daily/weekly BTC/USD data from Kraken,
then walks forward one day at a time scoring each point with the same logic
the live agent uses.

Usage:
    source venv/bin/activate
    python backtest_technical.py
"""

from __future__ import annotations

import yaml

from agents.data_fetcher import OHLCVFetcher
from agents.technical import TechnicalAgent


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def main() -> None:
    config = load_config()
    orch_cfg = config.get("orchestrator", {})
    signal_threshold = orch_cfg.get("signal_threshold", 0.5)
    min_confidence = orch_cfg.get("min_confidence", 0.6)

    tech_cfg = config.get("agents", {}).get("technical", {})
    symbol = tech_cfg.get("symbol", "BTC/USD")

    fetcher = OHLCVFetcher(symbol=symbol)
    agent = TechnicalAgent(config)

    # Fetch all data upfront — 2 years ≈ 730 days, plus 250-day buffer for SMA-200.
    daily_limit = 980
    weekly_limit = 200

    print(f"Fetching {daily_limit} daily candles from Kraken …")
    daily_df = fetcher.fetch("1d", limit=daily_limit)
    print(f"Fetching {weekly_limit} weekly candles from Kraken …")
    weekly_df = fetcher.fetch("1w", limit=weekly_limit)

    print(f"Daily range : {daily_df.index[0].date()} → {daily_df.index[-1].date()} ({len(daily_df)} bars)")
    print(f"Weekly range: {weekly_df.index[0].date()} → {weekly_df.index[-1].date()} ({len(weekly_df)} bars)")

    # Walk forward from day-index 250 onward (need 200+ bars for SMA-200).
    start_idx = 250
    if start_idx >= len(daily_df):
        print(f"Not enough daily data ({len(daily_df)} bars); need at least {start_idx + 1}.")
        return

    counts = {"BUY": 0, "SELL": 0, "HOLD": 0}
    total_score = 0.0
    n = 0

    header = f"{'Date':>12}  {'Score':>7}  {'Conf':>6}  {'Action':>5}  {'Close':>10}"
    print(f"\n{header}")
    print("-" * len(header))

    for i in range(start_idx, len(daily_df)):
        day = daily_df.index[i]
        daily_slice = daily_df.iloc[: i + 1]
        # Weekly slice: all weeks up to and including the current day.
        weekly_slice = weekly_df[weekly_df.index <= day]
        if weekly_slice.empty:
            continue

        sig = agent.score_at(daily_slice, weekly_slice)

        if sig.score >= signal_threshold and sig.confidence >= min_confidence:
            action = "BUY"
        elif sig.score <= -signal_threshold and sig.confidence >= min_confidence:
            action = "SELL"
        else:
            action = "HOLD"

        counts[action] += 1
        total_score += sig.score
        n += 1

        close = daily_df.iloc[i]["close"]
        print(f"{day.date()!s:>12}  {sig.score:+.4f}  {sig.confidence:.4f}  {action:>5}  {close:>10,.0f}")

    print("-" * len(header))
    print(f"\nDays scored: {n}")
    print(f"BUY:  {counts['BUY']:>4}   SELL: {counts['SELL']:>4}   HOLD: {counts['HOLD']:>4}")
    if n:
        print(f"Avg score: {total_score / n:+.4f}")


if __name__ == "__main__":
    main()
