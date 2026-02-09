"""Payday scheduled buy ledger — tracks planned buys on the 15th and last day of each month."""

from __future__ import annotations

import calendar
import json
from dataclasses import asdict, dataclass, fields
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

_SCHEDULE_PATH = Path("execution/scheduled_buys.json")
_TZ_PT = ZoneInfo("America/Los_Angeles")
_PLANNED_HOUR = 9  # 9 AM Pacific
_FIRST_DATE = date(2026, 2, 15)  # First scheduled buy


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
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    # Drop any entries before the configured first date (cleans up stale data)
    first = _FIRST_DATE.isoformat()
    cleaned = [e for e in raw if e.get("date", "") >= first]
    if len(cleaned) != len(raw):
        save_schedule(cleaned, path)
    return cleaned


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


def _last_day_of_month(year: int, month: int) -> int:
    """Return the last calendar day for the given year/month."""
    return calendar.monthrange(year, month)[1]


def _is_pay_date(d: date) -> bool:
    """True if `d` is the 15th or the last day of its month."""
    return d.day == 15 or d.day == _last_day_of_month(d.year, d.month)


def _pay_dates_through(end: date) -> list[date]:
    """Generate all pay dates from _FIRST_DATE up to and including `end`."""
    dates: list[date] = []
    current = _FIRST_DATE
    while current <= end:
        if _is_pay_date(current):
            dates.append(current)
            # Jump to next candidate: if we're on 15th, go to last day;
            # if on last day, go to 15th of next month.
            if current.day == 15:
                current = current.replace(
                    day=_last_day_of_month(current.year, current.month)
                )
            else:
                # Last day → 15th of next month
                if current.month == 12:
                    current = date(current.year + 1, 1, 15)
                else:
                    current = date(current.year, current.month + 1, 15)
        else:
            # Shouldn't happen if _FIRST_DATE is a pay date, but handle it
            current = current.replace(day=15) if current.day < 15 else current.replace(
                day=_last_day_of_month(current.year, current.month)
            )
    return dates


def next_pay_date() -> date:
    """Return the next upcoming pay date (today counts if not yet past planned hour)."""
    today = date.fromisoformat(get_today_pt())
    # Check today first
    if _is_pay_date(today) and not is_past_planned_time():
        return today
    # Next candidates
    d = today
    for _ in range(62):  # at most 2 months ahead
        d = d.replace(day=d.day)  # no-op, just iterate
        # Check 15th of current month
        if d.day < 15:
            candidate = d.replace(day=15)
            if candidate > today:
                return candidate
        # Check last day of current month
        last = _last_day_of_month(d.year, d.month)
        candidate = d.replace(day=last)
        if candidate > today:
            return candidate
        # Move to next month
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)
    return today  # fallback


# ---------------------------------------------------------------------------
# Schedule generation
# ---------------------------------------------------------------------------

def ensure_schedule_entries(
    base_dca_usd: float,
    path: Path = _SCHEDULE_PATH,
) -> ScheduledBuy | None:
    """Create pending entries for all pay dates up to today (if past 9am PT).

    Returns today's entry if today is a pay date, else None.
    """
    today = date.fromisoformat(get_today_pt())
    now_past_hour = is_past_planned_time()

    # Generate pay dates through today (only if past planned hour for today)
    end = today if now_past_hour else today.replace(day=max(today.day - 1, 1))
    if end < _FIRST_DATE:
        return None

    pay_dates = _pay_dates_through(end)
    if not pay_dates:
        return None

    entries = load_schedule(path)
    existing_dates = {e["date"] for e in entries}
    changed = False
    todays_entry = None

    for pd in pay_dates:
        pd_str = pd.isoformat()
        if pd_str not in existing_dates:
            new = ScheduledBuy(
                date=pd_str,
                planned_time="09:00 PT",
                status="pending",
                planned_amount_usd=base_dca_usd,
            )
            entries.append(new.to_dict())
            existing_dates.add(pd_str)
            changed = True

        if pd == today:
            # Find and return today's entry
            for e in entries:
                if e["date"] == pd_str:
                    todays_entry = _dict_to_entry(e)
                    break

    if changed:
        save_schedule(entries, path)

    return todays_entry


# Keep old name as alias for backward compat in dashboard
ensure_todays_entry = ensure_schedule_entries


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
