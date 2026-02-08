"""Cycle agent — halving-cycle position + MVRV Z-Score on-chain metric."""

from __future__ import annotations

from datetime import date, datetime, timezone

import numpy as np
import requests

from models.signal import Signal
from .base import BaseAgent

# Historical Bitcoin halving dates.
_HALVINGS = [
    date(2012, 11, 28),
    date(2016, 7, 9),
    date(2020, 5, 11),
    date(2024, 4, 19),
]

# Average peak-to-peak cycle length in days.
_AVG_CYCLE_DAYS = 1458

# MVRV Z-Score monthly lookup table (approximate values from on-chain data).
# Keys are (year, month) tuples → Z-Score value.
# Used as a fallback when the live API is unavailable.
_MVRV_LOOKUP: dict[tuple[int, int], float] = {
    # 2023
    (2023, 1): 0.24, (2023, 2): 0.58, (2023, 3): 0.72,
    (2023, 4): 0.85, (2023, 5): 0.70, (2023, 6): 0.80,
    (2023, 7): 0.88, (2023, 8): 0.65, (2023, 9): 0.68,
    (2023, 10): 0.95, (2023, 11): 1.20, (2023, 12): 1.60,
    # 2024
    (2024, 1): 1.75, (2024, 2): 2.20, (2024, 3): 2.85,
    (2024, 4): 2.40, (2024, 5): 2.30, (2024, 6): 2.05,
    (2024, 7): 2.15, (2024, 8): 1.80, (2024, 9): 1.70,
    (2024, 10): 2.10, (2024, 11): 3.00, (2024, 12): 2.90,
    # 2025
    (2025, 1): 2.60, (2025, 2): 2.30, (2025, 3): 1.90,
    (2025, 4): 1.70, (2025, 5): 2.10, (2025, 6): 2.05,
    (2025, 7): 2.40, (2025, 8): 2.20, (2025, 9): 2.15,
    (2025, 10): 2.30, (2025, 11): 1.60, (2025, 12): 1.50,
    # 2026
    (2026, 1): 1.55, (2026, 2): 1.30,
}

# Weighting: cycle position 55%, MVRV 45%.
_CYCLE_WEIGHT = 0.55
_MVRV_WEIGHT = 0.45


def _cycle_progress(today: date) -> float:
    """Return current cycle progress as a fraction in [0, 1].

    Measured as days since the most recent halving divided by the average
    cycle length.  Clamped to 1.0 if we've gone past the expected length.
    """
    last_halving = _HALVINGS[-1]
    days_since = (today - last_halving).days
    return float(np.clip(days_since / _AVG_CYCLE_DAYS, 0.0, 1.0))


def _score_cycle_position(progress: float) -> tuple[float, str]:
    """Map cycle progress to a score in [-1, 1].

    Ranges (per spec):
        0–30 %  → bullish   (+0.4 to +0.8)
        30–60 % → neutral-bullish (+0.1 to +0.4)
        60–85 % → cautious  (−0.2 to +0.1)
        85–100% → bearish   (−0.8 to −0.2)
    Each band is linearly interpolated.
    """
    pct = progress * 100.0

    if pct <= 30.0:
        # 0% → +0.8, 30% → +0.4
        score = 0.8 - (pct / 30.0) * 0.4
        phase = "early"
    elif pct <= 60.0:
        # 30% → +0.4, 60% → +0.1
        score = 0.4 - ((pct - 30.0) / 30.0) * 0.3
        phase = "mid"
    elif pct <= 85.0:
        # 60% → +0.1, 85% → −0.2
        score = 0.1 - ((pct - 60.0) / 25.0) * 0.3
        phase = "late"
    else:
        # 85% → −0.2, 100% → −0.8
        score = -0.2 - ((pct - 85.0) / 15.0) * 0.6
        phase = "final"

    detail = f"Cycle {pct:.1f}% ({phase}) → {score:+.2f}"
    return float(np.clip(score, -1.0, 1.0)), detail


def _fetch_mvrv_live(timeout: float = 5.0) -> float | None:
    """Try to fetch the current MVRV Z-Score from blockchain.info / CoinMetrics.

    Returns None on any failure so the caller can fall back to the lookup table.
    """
    try:
        resp = requests.get(
            "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics",
            params={
                "assets": "btc",
                "metrics": "CapMVRVCur",
                "frequency": "1d",
                "page_size": 1,
                "sort": "time",
                "sort_direction": "descending",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        if data:
            return float(data[0]["CapMVRVCur"])
    except Exception:
        pass
    return None


def _get_mvrv(today: date, use_live: bool = True) -> tuple[float | None, str]:
    """Return (z_score, source_label).  z_score may be None if nothing available."""
    if use_live:
        live = _fetch_mvrv_live()
        if live is not None:
            return live, "live"

    key = (today.year, today.month)
    val = _MVRV_LOOKUP.get(key)
    if val is not None:
        return val, "lookup"

    # Try the most recent prior month we have.
    for m in range(today.month - 1, 0, -1):
        val = _MVRV_LOOKUP.get((today.year, m))
        if val is not None:
            return val, "lookup (stale)"
    for y in range(today.year - 1, 2022, -1):
        for m in range(12, 0, -1):
            val = _MVRV_LOOKUP.get((y, m))
            if val is not None:
                return val, "lookup (stale)"
    return None, "unavailable"


def _score_mvrv(z: float | None) -> tuple[float, str]:
    """Map MVRV Z-Score to [-1, 1].

    Thresholds (standard on-chain interpretation):
        Z < 0    → deep value, strong buy  → +1.0
        0–2      → accumulation / fair      → linear +0.6 … 0.0
        2–3.5    → warming up / caution     → linear  0.0 … −0.5
        3.5–7    → overheated / euphoria    → linear −0.5 … −1.0
        ≥ 7      → extreme bubble           → −1.0
    """
    if z is None:
        return 0.0, "MVRV: no data → 0.00"

    if z < 0.0:
        score = 1.0
    elif z <= 2.0:
        score = 0.6 - (z / 2.0) * 0.6
    elif z <= 3.5:
        score = -((z - 2.0) / 1.5) * 0.5
    elif z <= 7.0:
        score = -0.5 - ((z - 3.5) / 3.5) * 0.5
    else:
        score = -1.0

    score = float(np.clip(score, -1.0, 1.0))
    return score, f"MVRV Z={z:.2f} → {score:+.2f}"


class CycleAgent(BaseAgent):
    """Evaluates Bitcoin halving cycle position and MVRV Z-Score."""

    name = "cycle"

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        cycle_cfg = config.get("agents", {}).get("cycle", {})
        self.use_live_mvrv = cycle_cfg.get("mvrv_live", True)

    def analyse(self) -> Signal:
        """Score based on today's date."""
        return self.score_at(date.today())

    def score_at(self, as_of: date) -> Signal:
        """Score at an arbitrary date (for back-testing or manual checks)."""
        progress = _cycle_progress(as_of)
        cycle_score, cycle_detail = _score_cycle_position(progress)

        mvrv_z, mvrv_src = _get_mvrv(as_of, use_live=self.use_live_mvrv)
        mvrv_score, mvrv_detail = _score_mvrv(mvrv_z)

        final = _CYCLE_WEIGHT * cycle_score + _MVRV_WEIGHT * mvrv_score
        final = float(np.clip(final, -1.0, 1.0))

        confidence = self._compute_confidence(cycle_score, mvrv_score, mvrv_z)

        reasoning_parts = [
            f"Halving cycle ({_CYCLE_WEIGHT:.0%}): {cycle_detail}",
            f"MVRV ({_MVRV_WEIGHT:.0%}, src={mvrv_src}): {mvrv_detail}",
            f"Combined: {final:+.3f}  confidence={confidence:.2f}",
        ]

        return Signal(
            agent=self.name,
            score=round(final, 4),
            confidence=round(confidence, 4),
            reasoning="\n".join(reasoning_parts),
        )

    @staticmethod
    def _compute_confidence(
        cycle_score: float,
        mvrv_score: float,
        mvrv_z: float | None,
    ) -> float:
        """Confidence from data quality and signal agreement.

        - Data availability (40 %): full if MVRV present, reduced if missing.
        - Agreement (35 %): both sub-scores pointing same direction.
        - Magnitude (25 %): stronger readings → higher confidence.
        """
        # Data availability.
        data_quality = 1.0 if mvrv_z is not None else 0.4

        # Agreement.
        if cycle_score != 0 and mvrv_score != 0:
            agreement = 1.0 if np.sign(cycle_score) == np.sign(mvrv_score) else 0.25
        else:
            agreement = 0.5

        # Magnitude.
        magnitude = (abs(cycle_score) + abs(mvrv_score)) / 2.0

        raw = 0.40 * data_quality + 0.35 * agreement + 0.25 * magnitude
        return float(np.clip(raw, 0.0, 1.0))
