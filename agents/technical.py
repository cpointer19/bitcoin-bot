"""Technical-analysis agent — RSI, SMA crossover, and MACD on daily + weekly."""

from __future__ import annotations

import numpy as np
import pandas as pd

from models.signal import Signal
from .base import BaseAgent
from .data_fetcher import OHLCVFetcher
from .indicators import IndicatorScore, RSIScorer, MACrossoverScorer, MACDScorer

# Default indicator weights within a single timeframe.
_INDICATOR_WEIGHTS = {"RSI": 0.30, "MA_Cross": 0.35, "MACD": 0.35}

# Timeframe blend: daily 60 %, weekly 40 %.
_DAILY_WEIGHT = 0.60
_WEEKLY_WEIGHT = 0.40


class TechnicalAgent(BaseAgent):
    """Runs technical-analysis indicators on OHLCV data."""

    name = "technical"

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        tech_cfg = config.get("agents", {}).get("technical", {})
        self.symbol = tech_cfg.get("symbol", "BTC/USD")
        self.daily_candles = tech_cfg.get("daily_candles", 400)
        self.weekly_candles = tech_cfg.get("weekly_candles", 200)
        self._fetcher = OHLCVFetcher(symbol=self.symbol)
        self._scorers = [RSIScorer(), MACrossoverScorer(), MACDScorer()]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyse(self) -> Signal:
        """Fetch live data from Kraken and return a Signal."""
        daily_df = self._fetcher.fetch("1d", limit=self.daily_candles)
        weekly_df = self._fetcher.fetch("1w", limit=self.weekly_candles)
        return self._build_signal(daily_df, weekly_df)

    def score_at(self, daily_df: pd.DataFrame, weekly_df: pd.DataFrame) -> Signal:
        """Score pre-sliced DataFrames (used by the back-tester)."""
        return self._build_signal(daily_df, weekly_df)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _build_signal(self, daily_df: pd.DataFrame, weekly_df: pd.DataFrame) -> Signal:
        daily_score, daily_details = self._score_timeframe(daily_df)
        weekly_score, weekly_details = self._score_timeframe(weekly_df)

        final_score = _DAILY_WEIGHT * daily_score + _WEEKLY_WEIGHT * weekly_score
        final_score = float(np.clip(final_score, -1.0, 1.0))

        confidence = self._compute_confidence(daily_details, weekly_details, daily_score, weekly_score)

        reasoning_parts = [
            f"Daily ({_DAILY_WEIGHT:.0%}): score={daily_score:+.3f}",
            *[f"  {d.detail}" for d in daily_details],
            f"Weekly ({_WEEKLY_WEIGHT:.0%}): score={weekly_score:+.3f}",
            *[f"  {d.detail}" for d in weekly_details],
            f"Combined: {final_score:+.3f}  confidence={confidence:.2f}",
        ]
        reasoning = "\n".join(reasoning_parts)

        return Signal(
            agent=self.name,
            score=round(final_score, 4),
            confidence=round(confidence, 4),
            reasoning=reasoning,
        )

    def _score_timeframe(self, df: pd.DataFrame) -> tuple[float, list[IndicatorScore]]:
        close = df["close"]
        details: list[IndicatorScore] = []
        weighted_sum = 0.0
        total_weight = 0.0
        for scorer in self._scorers:
            result = scorer.score(close)
            details.append(result)
            w = _INDICATOR_WEIGHTS.get(result.name, 1.0 / len(self._scorers))
            weighted_sum += w * result.score
            total_weight += w
        score = weighted_sum / total_weight if total_weight else 0.0
        return float(np.clip(score, -1.0, 1.0)), details

    @staticmethod
    def _compute_confidence(
        daily_details: list[IndicatorScore],
        weekly_details: list[IndicatorScore],
        daily_score: float,
        weekly_score: float,
    ) -> float:
        """Confidence from indicator agreement (45 %), magnitude (30 %), TF alignment (25 %)."""
        all_scores = [d.score for d in daily_details + weekly_details]
        if not all_scores:
            return 0.0

        # 1. Agreement: how many indicators point the same direction.
        signs = [np.sign(s) for s in all_scores if s != 0]
        if signs:
            dominant = max(signs.count(1.0), signs.count(-1.0))
            agreement = dominant / len(signs)
        else:
            agreement = 0.5

        # 2. Average absolute magnitude (stronger readings → higher confidence).
        magnitude = float(np.mean([abs(s) for s in all_scores]))

        # 3. Timeframe alignment: daily & weekly pointing same way.
        if daily_score != 0 and weekly_score != 0:
            alignment = 1.0 if np.sign(daily_score) == np.sign(weekly_score) else 0.2
        else:
            alignment = 0.5

        raw = 0.45 * agreement + 0.30 * magnitude + 0.25 * alignment
        return float(np.clip(raw, 0.0, 1.0))
