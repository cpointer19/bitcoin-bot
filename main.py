"""Bitcoin trading bot — entry point."""

from __future__ import annotations

import logging

import requests
import yaml

from agents import SentimentAgent, GeopoliticalAgent, TechnicalAgent, CycleAgent
from orchestrator import Orchestrator
from execution import Executor
from execution.trade_log import TradeRecord, append_trade

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-25s  %(levelname)-5s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def main() -> None:
    config = load_config()

    agents = [
        SentimentAgent(config),
        GeopoliticalAgent(config),
        TechnicalAgent(config),
        CycleAgent(config),
    ]

    orchestrator = Orchestrator(agents, config)
    decision = orchestrator.decide()

    orch_cfg = config.get("orchestrator", {})
    if "base_dca_cad" in orch_cfg:
        try:
            _rate = requests.get(
                "https://api.exchangerate-api.com/v4/latest/USD", timeout=5
            ).json()["rates"]["CAD"]
        except Exception:
            _rate = 1.36
        base_dca = orch_cfg["base_dca_cad"] / _rate
    else:
        base_dca = orch_cfg.get("base_dca_usd", 100)
    order_usd = base_dca * decision.dca_multiplier

    print(decision.reasoning)

    executor = Executor(config)
    executor.connect()
    result = executor.execute(action=decision.action, amount_usd=order_usd)

    print()
    if result.dry_run:
        print(f"[DRY RUN] {result.side.upper()} {result.amount_btc} BTC "
              f"(${result.amount_usd}) @ ${result.price} [{result.leverage}x leverage]")
    elif result.executed:
        print(f"ORDER FILLED  id={result.order_id}  "
              f"{result.amount_btc} BTC @ ${result.price} [{result.leverage}x leverage]")
    else:
        print(f"Order not executed: {result.reason}")

    print(f"Daily spend so far: ${executor.daily_spend():.0f}")

    append_trade(TradeRecord(
        timestamp=decision.timestamp.isoformat(),
        action=decision.action,
        dca_multiplier=decision.dca_multiplier,
        composite_score=decision.composite_score,
        amount_usd=result.amount_usd,
        amount_btc=result.amount_btc,
        price=result.price,
        leverage=result.leverage,
        executed=result.executed,
        dry_run=result.dry_run,
        reason=result.reason,
    ))


if __name__ == "__main__":
    main()
