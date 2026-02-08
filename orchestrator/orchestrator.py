"""Orchestrator — weighted signal aggregation → DCA multiplier decision."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from models.signal import Signal
from agents.base import BaseAgent

logger = logging.getLogger(__name__)

# Default per-agent weights (must sum to 1.0).
_DEFAULT_WEIGHTS: dict[str, float] = {
    "technical": 0.30,
    "cycle": 0.30,
    "sentiment": 0.25,
    "geopolitical": 0.15,
}

# DCA multiplier tiers.
_ACTION_TIERS: list[tuple[float, str, float]] = [
    # (lower_bound, label, dca_multiplier)
    (0.5, "strong_buy", 3.0),
    (0.2, "buy", 1.5),
    (-0.2, "normal", 1.0),
    (-0.5, "reduce", 0.5),
    (float("-inf"), "minimal", 0.2),
]


@dataclass(frozen=True)
class Decision:
    """Full orchestrator output."""

    action: str              # strong_buy | buy | normal | reduce | minimal
    dca_multiplier: float    # scaling factor for the base DCA amount
    composite_score: float   # confidence-weighted composite in [-1, 1]
    signals: list[Signal]    # individual agent signals
    reasoning: str           # human-readable decision log
    timestamp: datetime


class Orchestrator:
    """Collects signals from all agents, applies weights, and decides action."""

    def __init__(self, agents: list[BaseAgent], config: dict) -> None:
        self.agents = agents
        self.config = config
        orch_cfg = config.get("orchestrator", {})
        self._base_dca_usd: float = orch_cfg.get("base_dca_usd", 100.0)
        self._min_confidence: float = orch_cfg.get("min_confidence", 0.0)

        # Build weight map from config, falling back to defaults.
        agents_cfg = config.get("agents", {})
        self._weights: dict[str, float] = {}
        for agent in self.agents:
            agent_cfg = agents_cfg.get(agent.name, {})
            self._weights[agent.name] = agent_cfg.get(
                "weight", _DEFAULT_WEIGHTS.get(agent.name, 0.0),
            )

        # Normalise weights so they sum to 1.
        total = sum(self._weights.values())
        if total > 0:
            self._weights = {k: v / total for k, v in self._weights.items()}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def gather_signals(self) -> list[Signal]:
        """Run every enabled agent and collect their signals.

        Agents that raise are caught and logged so one failure doesn't
        block the entire pipeline.
        """
        signals: list[Signal] = []
        for agent in self.agents:
            agent_cfg = self.config.get("agents", {}).get(agent.name, {})
            if not agent_cfg.get("enabled", True):
                logger.info("Skipping disabled agent: %s", agent.name)
                continue
            try:
                sig = agent.analyse()
                signals.append(sig)
                logger.info(
                    "Agent %-15s  score=%+.4f  conf=%.4f",
                    sig.agent, sig.score, sig.confidence,
                )
            except Exception:
                logger.exception("Agent %s failed", agent.name)
        return signals

    def compute_composite(self, signals: list[Signal]) -> float:
        """Confidence-weighted composite score.

        For each signal:
            contribution = weight × score × confidence

        The result is normalised by the sum of (weight × confidence) so that
        low-confidence signals are naturally down-weighted.
        """
        numerator = 0.0
        denominator = 0.0
        for sig in signals:
            w = self._weights.get(sig.agent, 0.0)
            effective = w * sig.confidence
            numerator += effective * sig.score
            denominator += effective
        if denominator == 0:
            return 0.0
        return numerator / denominator

    def decide(self, signals: list[Signal] | None = None) -> Decision:
        """Full decision pipeline: gather → composite → DCA action.

        Optionally accepts pre-collected signals (useful for testing or
        when the caller already has them).
        """
        if signals is None:
            signals = self.gather_signals()

        composite = self.compute_composite(signals)
        action, multiplier = self._map_action(composite)
        reasoning = self._build_reasoning(signals, composite, action, multiplier)

        self._log_decision(reasoning)

        return Decision(
            action=action,
            dca_multiplier=multiplier,
            composite_score=round(composite, 4),
            signals=signals,
            reasoning=reasoning,
            timestamp=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _map_action(composite: float) -> tuple[str, float]:
        """Map composite score to (action_label, dca_multiplier)."""
        for threshold, label, mult in _ACTION_TIERS:
            if composite >= threshold:
                return label, mult
        # Shouldn't be reached, but guard.
        return "minimal", 0.2

    def _build_reasoning(
        self,
        signals: list[Signal],
        composite: float,
        action: str,
        multiplier: float,
    ) -> str:
        lines: list[str] = []
        lines.append("=" * 60)
        lines.append("ORCHESTRATOR DECISION")
        lines.append("=" * 60)

        for sig in signals:
            w = self._weights.get(sig.agent, 0.0)
            eff = w * sig.confidence
            lines.append("")
            lines.append(f"--- {sig.agent.upper()} (weight={w:.0%}, conf={sig.confidence:.2f}, effective={eff:.4f}) ---")
            lines.append(f"  Score: {sig.score:+.4f}")
            for rline in sig.reasoning.split("\n"):
                lines.append(f"  {rline}")

        lines.append("")
        lines.append("-" * 60)
        lines.append(f"Composite score: {composite:+.4f}")
        lines.append(f"Action:          {action}")
        lines.append(f"DCA multiplier:  {multiplier:.1f}x")
        lines.append(f"Base DCA:        ${self._base_dca_usd:.0f}")
        lines.append(f"Order size:      ${self._base_dca_usd * multiplier:.0f}")
        lines.append("=" * 60)
        return "\n".join(lines)

    @staticmethod
    def _log_decision(reasoning: str) -> None:
        for line in reasoning.split("\n"):
            logger.info(line)
