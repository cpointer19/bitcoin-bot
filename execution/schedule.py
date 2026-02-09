"""Daily scheduled buy ledger — tracks planned 9am PT buys."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

_SCHEDULE_PATH = Path("execution/scheduled_buys.json")
_TZ_PT = ZoneInfo("America/Los_Angeles")
_PLANNED_HOUR = 9  # 9 AM Pacific


@dataclass
class ScheduledBuy:
    date: str                                    # "YYYY-MM-DD"
    planned_time: str                            # "09:00 PT"
    status: str                                  # pending | confirmed | missed
    planned_amount_usd: float
    executed_at: Optional[str] = None
    actual_amount_usd: Optional[float] = None
    actual_amount_btc: Optional[float] = None
    price: Optional[float] = None
    action: Optional[str] = None
    dca_multiplier: Optional[float] = None
    dry_run: Optional[bool] = None
    trade_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def load_schedule(path: Path = _SCHEDULE_PATH) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def save_schedule(entries: list[dict], path: Path = _SCHEDULE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries, indent=2))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FIELD_NAMES = {f.name for f in fields(ScheduledBuy)}


def _dict_to_entry(d: dict) -> ScheduledBuy:
    return ScheduledBuy(**{k: v for k, v in d.items() if k in _FIELD_NAMES})


def get_today_pt() -> str:
    return datetime.now(_TZ_PT).strftime("%Y-%m-%d")


def is_past_planned_time() -> bool:
    return datetime.now(_TZ_PT).hour >= _PLANNED_HOUR


# ---------------------------------------------------------------------------
# Schedule generation
# ---------------------------------------------------------------------------

def ensure_todays_entry(
    base_dca_usd: float,
    path: Path = _SCHEDULE_PATH,
) -> ScheduledBuy | None:
    """Create today's pending entry if past 9am PT and none exists yet."""
    today = get_today_pt()
    entries = load_schedule(path)

    for e in entries:
        if e["date"] == today:
            return _dict_to_entry(e)

    if not is_past_planned_time():
        return None

    new = ScheduledBuy(
        date=today,
        planned_time="09:00 PT",
        status="pending",
        planned_amount_usd=base_dca_usd,
    )
    entries.append(new.to_dict())
    save_schedule(entries, path)
    return new


def mark_missed_entries(path: Path = _SCHEDULE_PATH) -> None:
    """Flip past-date pending entries to missed."""
    today = get_today_pt()
    entries = load_schedule(path)
    changed = False
    for e in entries:
        if e["status"] == "pending" and e["date"] < today:
            e["status"] = "missed"
            changed = True
    if changed:
        save_schedule(entries, path)


def confirm_scheduled_buy(
    trade_date: str,
    result,       # OrderResult
    decision,     # Decision
    path: Path = _SCHEDULE_PATH,
) -> None:
    """Mark a scheduled buy as confirmed, or create-and-confirm if early."""
    entries = load_schedule(path)
    found = False
    for e in entries:
        if e["date"] == trade_date:
            e["status"] = "confirmed"
            e["executed_at"] = datetime.now(timezone.utc).isoformat()
            e["actual_amount_usd"] = result.amount_usd
            e["actual_amount_btc"] = result.amount_btc
            e["price"] = result.price
            e["action"] = decision.action
            e["dca_multiplier"] = decision.dca_multiplier
            e["dry_run"] = result.dry_run
            e["trade_reason"] = result.reason
            found = True
            break

    if not found:
        entry = ScheduledBuy(
            date=trade_date,
            planned_time="09:00 PT",
            status="confirmed",
            planned_amount_usd=result.amount_usd,
            executed_at=datetime.now(timezone.utc).isoformat(),
            actual_amount_usd=result.amount_usd,
            actual_amount_btc=result.amount_btc,
            price=result.price,
            action=decision.action,
            dca_multiplier=decision.dca_multiplier,
            dry_run=result.dry_run,
            trade_reason=result.reason,
        )
        entries.append(entry.to_dict())

    save_schedule(entries, path)
