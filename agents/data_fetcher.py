"""Fetch OHLCV candle data from Kraken via ccxt (public, no auth)."""

from __future__ import annotations

import time

import ccxt
import pandas as pd


class OHLCVFetcher:
    """Paginated OHLCV fetcher using ccxt.kraken (public endpoints only)."""

    # Kraken returns at most 720 candles per request.
    _MAX_PER_REQUEST = 720

    _TIMEFRAME_MS = {
        "1d": 86_400_000,
        "1w": 604_800_000,
    }

    def __init__(self, symbol: str = "BTC/USD") -> None:
        self.symbol = symbol
        self.exchange = ccxt.kraken({"enableRateLimit": True})

    def fetch(self, timeframe: str = "1d", limit: int = 400) -> pd.DataFrame:
        """Return a DataFrame with columns [open, high, low, close, volume].

        Paginates automatically when *limit* exceeds Kraken's 720-candle cap.
        Index is a UTC DatetimeIndex named 'timestamp'.
        """
        tf_ms = self._TIMEFRAME_MS.get(timeframe)
        if tf_ms is None:
            raise ValueError(f"Unsupported timeframe {timeframe!r}; use one of {list(self._TIMEFRAME_MS)}")

        now_ms = int(time.time() * 1000)
        since_ms = now_ms - limit * tf_ms
        all_candles: list[list] = []

        while len(all_candles) < limit:
            batch_limit = min(self._MAX_PER_REQUEST, limit - len(all_candles))
            batch = self.exchange.fetch_ohlcv(
                self.symbol, timeframe=timeframe, since=since_ms, limit=batch_limit,
            )
            if not batch:
                break
            all_candles.extend(batch)
            # Move cursor past last candle's timestamp.
            since_ms = batch[-1][0] + tf_ms
            if len(batch) < batch_limit:
                break

        df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp").sort_index()
        # Drop any duplicates that may arise at page boundaries.
        df = df[~df.index.duplicated(keep="first")]
        return df.tail(limit)
