"""Execution layer — places leveraged perpetual futures orders on Hyperliquid via ccxt."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

import ccxt
from dotenv import load_dotenv

load_dotenv()

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
    leverage: int
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
    """Places leveraged perpetual futures orders on Hyperliquid via ccxt."""

    def __init__(self, config: dict) -> None:
        self.config = config
        ex_cfg = config.get("exchange", {})
        self._wallet_address: str = os.getenv("HYPERLIQUID_WALLET_ADDRESS", "")
        self._private_key: str = os.getenv("HYPERLIQUID_PRIVATE_KEY", "")
        self._testnet: bool = ex_cfg.get("testnet", True)

        trading_cfg = config.get("trading", {})
        self._symbol: str = trading_cfg.get("symbol", "BTC/USDC:USDC")
        self._dry_run: bool = trading_cfg.get("dry_run", True)
        self._kill_switch: bool = trading_cfg.get("kill_switch", False)
        self._max_order_usd: float = trading_cfg.get("max_order_usd", 100.0)
        self._max_daily_usd: float = trading_cfg.get("max_daily_usd", 100.0)
        self._leverage: int = trading_cfg.get("leverage", 1)

        self._exchange: ccxt.hyperliquid | None = None
        self._ledger = _DailyLedger()

    def connect(self) -> None:
        """Initialise the ccxt Hyperliquid connection."""
        self._exchange = ccxt.hyperliquid({
            "walletAddress": self._wallet_address,
            "privateKey": self._private_key,
            "enableRateLimit": True,
        })

        if self._testnet:
            self._exchange.set_sandbox_mode(True)
            logger.info("Using Hyperliquid testnet environment")

        if self._leverage > 1 and not self._dry_run:
            try:
                self._exchange.set_leverage(self._leverage, self._symbol)
                logger.info("Leverage set to %dx for %s", self._leverage, self._symbol)
            except ccxt.BaseError as exc:
                logger.warning("Could not set leverage via API: %s", exc)

        mode = "TESTNET" if self._testnet else "LIVE"
        logger.info(
            "Connected to Hyperliquid (%s)  dry_run=%s  leverage=%dx",
            mode, self._dry_run, self._leverage,
        )

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
                "[DRY RUN] Would %s %.8f BTC ($%.2f) at $%.2f [%dx leverage]",
                side, btc_amount, amount_usd, price, self._leverage,
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
                leverage=self._leverage,
                reason="Dry run — no order placed",
            )

        # --- Live order ---
        if self._exchange is None:
            return self._blocked(side, amount_usd, "Exchange not connected — call connect() first")

        try:
            order = self._exchange.create_order(
                symbol=self._symbol,
                type="market",
                side="buy",
                amount=btc_amount,
                params={"leverage": self._leverage},
            )
            self._ledger.record(amount_usd)
            order_id = order.get("id", "unknown")
            fill_price = order.get("average") or order.get("price") or price
            logger.info(
                "ORDER FILLED  id=%s  %.8f BTC @ $%.2f  ($%.2f) [%dx leverage]",
                order_id, btc_amount, fill_price, amount_usd, self._leverage,
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
                leverage=self._leverage,
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
                leverage=self._leverage,
                reason=f"Exchange error: {exc}",
            )

    def get_balance(self) -> dict:
        """Fetch current account balances from Hyperliquid."""
        if self._exchange is None:
            logger.warning("Exchange not connected")
            return {}
        try:
            bal = self._exchange.fetch_balance()
            return {
                "USDC": bal.get("USDC", {}).get("free", 0.0),
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
                pub = ccxt.hyperliquid({"enableRateLimit": True})
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
            leverage=self._leverage,
            reason=reason,
        )
