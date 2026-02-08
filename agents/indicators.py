"""Technical-analysis indicator scorers.

Each scorer consumes a pandas Series of close prices and produces an
IndicatorScore with a normalised score in [-1, 1].
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import ta


@dataclass(frozen=True)
class IndicatorScore:
    """Result from a single indicator scorer."""

    name: str
    score: float   # -1 (bearish) … +1 (bullish)
    detail: str


# ---------------------------------------------------------------------------
# RSI
# ---------------------------------------------------------------------------

class RSIScorer:
    """Linear map of RSI(14) into [-1, 1].

    RSI 30 → +1 (oversold / buy), RSI 70 → −1 (overbought / sell).
    Formula: clip((50 − rsi) / 20, −1, 1)
    """

    def __init__(self, period: int = 14) -> None:
        self.period = period

    def score(self, close: pd.Series) -> IndicatorScore:
        rsi_series = ta.momentum.RSIIndicator(close, window=self.period).rsi()
        rsi = rsi_series.iloc[-1]
        if np.isnan(rsi):
            return IndicatorScore("RSI", 0.0, "RSI: insufficient data")
        raw = (50.0 - rsi) / 20.0
        s = float(np.clip(raw, -1.0, 1.0))
        return IndicatorScore("RSI", round(s, 4), f"RSI({self.period})={rsi:.1f} → {s:+.2f}")


# ---------------------------------------------------------------------------
# SMA Crossover (50 / 200)
# ---------------------------------------------------------------------------

class MACrossoverScorer:
    """Percentage gap between SMA-50 and SMA-200, scaled so ±5 % → ±1."""

    def __init__(self, fast: int = 50, slow: int = 200, scale_pct: float = 5.0) -> None:
        self.fast = fast
        self.slow = slow
        self.scale_pct = scale_pct

    def score(self, close: pd.Series) -> IndicatorScore:
        if len(close) < self.slow:
            return IndicatorScore("MA_Cross", 0.0, f"MA cross: need {self.slow} bars, have {len(close)}")
        sma_fast = close.rolling(self.fast).mean().iloc[-1]
        sma_slow = close.rolling(self.slow).mean().iloc[-1]
        if np.isnan(sma_fast) or np.isnan(sma_slow) or sma_slow == 0:
            return IndicatorScore("MA_Cross", 0.0, "MA cross: insufficient data")
        gap_pct = (sma_fast - sma_slow) / sma_slow * 100.0
        raw = gap_pct / self.scale_pct
        s = float(np.clip(raw, -1.0, 1.0))
        return IndicatorScore(
            "MA_Cross", round(s, 4),
            f"SMA{self.fast}={sma_fast:.0f} SMA{self.slow}={sma_slow:.0f} gap={gap_pct:+.2f}% → {s:+.2f}",
        )


# ---------------------------------------------------------------------------
# MACD (12 / 26 / 9)
# ---------------------------------------------------------------------------

class MACDScorer:
    """Blend of MACD-signal crossover direction (60 %) and histogram momentum (40 %)."""

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9) -> None:
        self.fast = fast
        self.slow = slow
        self.signal_period = signal

    def score(self, close: pd.Series) -> IndicatorScore:
        macd_ind = ta.trend.MACD(close, window_fast=self.fast, window_slow=self.slow, window_sign=self.signal_period)
        macd_line = macd_ind.macd().iloc[-1]
        signal_line = macd_ind.macd_signal().iloc[-1]
        hist = macd_ind.macd_diff()

        if np.isnan(macd_line) or np.isnan(signal_line):
            return IndicatorScore("MACD", 0.0, "MACD: insufficient data")

        price = close.iloc[-1]
        if price == 0:
            return IndicatorScore("MACD", 0.0, "MACD: zero price")

        # Factor 1: crossover direction — normalise (MACD − signal) / price to ±1 %
        diff_pct = (macd_line - signal_line) / price * 100.0
        crossover_score = float(np.clip(diff_pct / 1.0, -1.0, 1.0))

        # Factor 2: histogram momentum
        h = hist.dropna()
        if len(h) >= 2:
            cur, prev = h.iloc[-1], h.iloc[-2]
            if cur > 0 and cur > prev:
                momentum_score = 1.0
            elif cur > 0 and cur <= prev:
                momentum_score = 0.3
            elif cur < 0 and cur < prev:
                momentum_score = -1.0
            elif cur < 0 and cur >= prev:
                momentum_score = -0.3
            else:
                momentum_score = 0.0
        else:
            momentum_score = 0.0

        s = float(np.clip(0.6 * crossover_score + 0.4 * momentum_score, -1.0, 1.0))
        return IndicatorScore(
            "MACD", round(s, 4),
            f"MACD xover={crossover_score:+.2f} momentum={momentum_score:+.2f} → {s:+.2f}",
        )
