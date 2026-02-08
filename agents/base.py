from __future__ import annotations

from abc import ABC, abstractmethod

from models.signal import Signal


class BaseAgent(ABC):
    """Abstract base class that every agent must implement."""

    name: str = "base"

    def __init__(self, config: dict) -> None:
        self.config = config

    @abstractmethod
    def analyse(self) -> Signal:
        """Run analysis and return a standardised Signal."""
        ...
