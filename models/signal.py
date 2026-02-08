from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Signal:
    """Standardised output every agent must return."""

    agent: str
    score: float          # -1 (strong sell) … 0 (neutral) … +1 (strong buy)
    confidence: float     # 0 (no confidence) … 1 (full confidence)
    reasoning: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        if not (-1.0 <= self.score <= 1.0):
            raise ValueError(f"score must be in [-1, 1], got {self.score}")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError(f"confidence must be in [0, 1], got {self.confidence}")
