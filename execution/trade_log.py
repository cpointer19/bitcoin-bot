"""Persistent JSON trade log for recording every execution decision."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

_LOG_PATH = Path("execution/trade_history.json")


@dataclass
class TradeRecord:
    timestamp: str
    action: str
    dca_multiplier: float
    composite_score: float
    amount_usd: float
    amount_btc: float | None
    price: float | None
    executed: bool
    dry_run: bool
    reason: str

    def to_dict(self) -> dict:
        return asdict(self)


def load_trade_log(path: Path = _LOG_PATH) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def append_trade(record: TradeRecord, path: Path = _LOG_PATH) -> None:
    history = load_trade_log(path)
    history.append(record.to_dict())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2))
