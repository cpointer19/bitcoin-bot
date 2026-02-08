"""Execution layer — places DCA orders on Kraken via ccxt with safety limits."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

import ccxt

logger = logging.getLogger(__name__)

_LEDGER_PATH = Path("execution/daily_ledger.json")


# ---------------------------------------------------------------------------
# Order result
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class OrderResult:
    executed: bool
    dry_run: bool
    symbol: str
    side: str
    amount_usd: float
    amount_btc: float | None
    price: float | None
    order_id: str | None
    reason: str


# ---------------------------------------------------------------------------
# Daily spend tracker
# ---------------------------------------------------------------------------

class _DailyLedger:
    """Tracks cumulative USD spent per calendar day.

    Persists to a JSON file so spend survives restarts within the same day.
    """

    def __init__(self, path: Path = _LEDGER_PATH) -> None:
        self._path = path
        self._data: dict[str, float] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._data = json.loads(self._path.read_text())
            except (json.JSONDecodeError, OSError):
                self._data = {}

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._data, indent=2))

    def spent_today(self) -> float:
        return self._data.get(str(date.today()), 0.0)

    def record(self, usd: float) -> None:
        key = str(date.today())
        self._data[key] = self._data.get(key, 0.0) + usd
        self._save()


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------

class Executor:
    """Places market-buy DCA orders on Kraken via ccxt."""

    def __init__(self, config: dict) -> None:
        self.config = config
        ex_cfg = config.get("exchange", {})
        self._api_key: str = ex_cfg.get("api_key", "")
        self._api_secret: str = ex_cfg.get("api_secret", "")
        self._testnet: bool = ex_cfg.get("testnet", True)

        trading_cfg = config.get("trading", {})
        self._symbol: str = trading_cfg.get("symbol", "BTC/USD")
        self._dry_run: bool = trading_cfg.get("dry_run", True)
        self._kill_switch: bool = trading_cfg.get("kill_switch", False)
        self._max_order_usd: float = trading_cfg.get("max_order_usd", 500.0)
        self._max_daily_usd: float = trading_cfg.get("max_daily_usd", 1000.0)

        self._exchange: ccxt.kraken | None = None
        self._ledger = _DailyLedger()

    def connect(self) -> None:
        """Initialise the ccxt Kraken connection.

        Kraken has no sandbox/testnet.  When ``testnet`` is set in config
        we force ``dry_run`` so that no real orders can be placed, and
        still create a public-only exchange instance for price fetches.
        """
        if self._testnet:
            self._dry_run = True
            logger.info("Testnet mode — forcing dry_run=True (Kraken has no sandbox)")

        self._exchange = ccxt.kraken({
            "apiKey": self._api_key,
            "secret": self._api_secret,
            "enableRateLimit": True,
        })

        mode = "TESTNET/DRY-RUN" if self._testnet else "LIVE"
        logger.info("Connected to Kraken (%s)  dry_run=%s", mode, self._dry_run)

    def execute(self, action: str, amount_usd: float) -> OrderResult:
        """Execute a DCA order with full safety checks.

        Args:
            action: orchestrator action label (strong_buy, buy, normal, etc.)
            amount_usd: dollar amount *after* DCA multiplier has been applied.

        Returns:
            OrderResult with execution details.
        """
        side = "buy"

        # --- Safety check: kill switch ---
        if self._kill_switch:
            return self._blocked(side, amount_usd, "Kill switch is ON — all trading halted")

        # --- Safety check: max single order ---
        if amount_usd > self._max_order_usd:
            logger.warning(
                "Order $%.2f exceeds max_order_usd $%.2f — clamping",
                amount_usd, self._max_order_usd,
            )
            amount_usd = self._max_order_usd

        # --- Safety check: max daily spend ---
        spent = self._ledger.spent_today()
        remaining = self._max_daily_usd - spent
        if remaining <= 0:
            return self._blocked(
                side, amount_usd,
                f"Daily limit reached (${spent:.0f} / ${self._max_daily_usd:.0f})",
            )
        if amount_usd > remaining:
            logger.warning(
                "Order $%.2f would exceed daily limit — clamping to $%.2f",
                amount_usd, remaining,
            )
            amount_usd = remaining

        # --- Fetch current price to convert USD → BTC ---
        price = self._get_price()
        if price is None:
            return self._blocked(side, amount_usd, "Could not fetch current price")

        btc_amount = amount_usd / price

        # --- Dry run ---
        if self._dry_run:
            self._ledger.record(amount_usd)
            logger.info(
                "[DRY RUN] Would %s %.8f BTC ($%.2f) at $%.2f",
                side, btc_amount, amount_usd, price,
            )
            return OrderResult(
                executed=False,
                dry_run=True,
                symbol=self._symbol,
                side=side,
                amount_usd=round(amount_usd, 2),
                amount_btc=round(btc_amount, 8),
                price=round(price, 2),
                order_id=None,
                reason="Dry run — no order placed",
            )

        # --- Live order ---
        if self._exchange is None:
            return self._blocked(side, amount_usd, "Exchange not connected — call connect() first")

        try:
            order = self._exchange.create_market_buy_order(
                self._symbol, btc_amount,
            )
            self._ledger.record(amount_usd)
            order_id = order.get("id", "unknown")
            fill_price = order.get("average") or order.get("price") or price
            logger.info(
                "ORDER FILLED  id=%s  %.8f BTC @ $%.2f  ($%.2f)",
                order_id, btc_amount, fill_price, amount_usd,
            )
            return OrderResult(
                executed=True,
                dry_run=False,
                symbol=self._symbol,
                side=side,
                amount_usd=round(amount_usd, 2),
                amount_btc=round(btc_amount, 8),
                price=round(fill_price, 2),
                order_id=str(order_id),
                reason="Order filled",
            )
        except ccxt.BaseError as exc:
            logger.error("Order failed: %s", exc)
            return OrderResult(
                executed=False,
                dry_run=False,
                symbol=self._symbol,
                side=side,
                amount_usd=round(amount_usd, 2),
                amount_btc=round(btc_amount, 8),
                price=round(price, 2),
                order_id=None,
                reason=f"Exchange error: {exc}",
            )

    def get_balance(self) -> dict:
        """Fetch current account balances from Kraken."""
        if self._exchange is None:
            logger.warning("Exchange not connected")
            return {}
        try:
            bal = self._exchange.fetch_balance()
            return {
                "BTC": bal.get("BTC", {}).get("free", 0.0),
                "USD": bal.get("USD", {}).get("free", 0.0),
            }
        except ccxt.BaseError as exc:
            logger.error("Balance fetch failed: %s", exc)
            return {}

    def daily_spend(self) -> float:
        """Return USD spent so far today."""
        return self._ledger.spent_today()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_price(self) -> float | None:
        """Fetch the current mid-price for the trading symbol."""
        try:
            if self._exchange is None:
                # Fallback: public-only instance for price fetching in dry-run.
                pub = ccxt.kraken({"enableRateLimit": True})
                ticker = pub.fetch_ticker(self._symbol)
            else:
                ticker = self._exchange.fetch_ticker(self._symbol)
            return float(ticker["last"])
        except (ccxt.BaseError, KeyError, TypeError) as exc:
            logger.error("Price fetch failed: %s", exc)
            return None

    def _blocked(self, side: str, amount_usd: float, reason: str) -> OrderResult:
        logger.warning("Order BLOCKED: %s", reason)
        return OrderResult(
            executed=False,
            dry_run=self._dry_run,
            symbol=self._symbol,
            side=side,
            amount_usd=round(amount_usd, 2),
            amount_btc=None,
            price=None,
            order_id=None,
            reason=reason,
        )
