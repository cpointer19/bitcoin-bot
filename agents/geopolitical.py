"""Geopolitical risk agent — NewsAPI headlines → Anthropic LLM scoring."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass

import anthropic
import numpy as np
import requests

try:
    from dotenv import load_dotenv
    from pathlib import Path
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except ImportError:
    pass

from models.signal import Signal
from .base import BaseAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter (same design as sentiment agent)
# ---------------------------------------------------------------------------

class _RateLimiter:
    """Token-bucket limiter: at most *max_calls* per *period* seconds."""

    def __init__(self, max_calls: int, period: float) -> None:
        self.max_calls = max_calls
        self.period = period
        self._timestamps: list[float] = []

    def wait(self) -> None:
        now = time.monotonic()
        self._timestamps = [t for t in self._timestamps if now - t < self.period]
        if len(self._timestamps) >= self.max_calls:
            sleep_for = self.period - (now - self._timestamps[0])
            if sleep_for > 0:
                logger.info("Rate limit reached — sleeping %.1fs", sleep_for)
                time.sleep(sleep_for)
        self._timestamps.append(time.monotonic())


# ---------------------------------------------------------------------------
# Headline dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Headline:
    source: str
    title: str
    description: str
    published_at: str


# ---------------------------------------------------------------------------
# News fetcher — NewsAPI.org (/v2/everything)
# ---------------------------------------------------------------------------

# Default query topics that historically move BTC flows.
_DEFAULT_QUERIES = [
    "bitcoin regulation",
    "bitcoin sanctions",
    "banking crisis",
    "currency devaluation",
    "central bank digital currency",
    "capital controls crypto",
]


class NewsFetcher:
    """Pull recent English-language headlines from NewsAPI.org."""

    _BASE_URL = "https://newsapi.org/v2/everything"

    def __init__(self, api_key: str, page_size: int = 20) -> None:
        self._api_key = api_key
        self._page_size = min(page_size, 100)

    def fetch(self, queries: list[str]) -> list[Headline]:
        """Run one API call with an OR-joined query and return headlines."""
        combined = " OR ".join(f'"{q}"' for q in queries)
        headlines: list[Headline] = []
        try:
            resp = requests.get(
                self._BASE_URL,
                params={
                    "q": combined,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": self._page_size,
                    "apiKey": self._api_key,
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            for article in data.get("articles", []):
                headlines.append(Headline(
                    source=article.get("source", {}).get("name", "unknown"),
                    title=article.get("title", ""),
                    description=article.get("description") or "",
                    published_at=article.get("publishedAt", ""),
                ))
        except (requests.RequestException, ValueError, KeyError) as exc:
            logger.warning("NewsAPI fetch failed: %s", exc)
        return headlines


# ---------------------------------------------------------------------------
# LLM scorer
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a geopolitical analyst specialising in how macro events affect Bitcoin.

You will receive recent news headlines. Assess the overall geopolitical environment \
for Bitcoin based on these headlines.

Focus on events that historically drive BTC capital flows:
- Banking instability or bank failures (positive for BTC — flight to alternative assets)
- Currency devaluation or capital controls (positive — drives BTC demand as a hedge)
- Regulatory clarity or pro-crypto legislation (positive — reduces uncertainty)
- War, sanctions, or geopolitical tension (mildly positive — safe-haven flows, but can disrupt markets)
- Regulatory crackdowns, bans, or enforcement actions (negative — reduces access and demand)
- Central bank hawkishness / rate hikes (negative — strengthens fiat, reduces risk appetite)

Return ONLY valid JSON with exactly these fields:
{
  "score": <float from -1.0 (very negative for BTC) to 1.0 (very positive for BTC)>,
  "confidence": <float from 0.0 to 1.0>,
  "reasoning": "<2-3 sentence summary of the key geopolitical factors>"
}

If headlines are irrelevant or too few to judge, set confidence below 0.3."""


@dataclass(frozen=True)
class LLMGeopolitical:
    score: float       # -1 (negative for BTC) … +1 (positive for BTC)
    confidence: float  # 0 … 1
    reasoning: str


def _score_via_llm(
    headlines: list[Headline],
    api_key: str,
    model: str,
    rate_limiter: _RateLimiter,
) -> LLMGeopolitical:
    """Send headlines to Anthropic Claude and parse a geopolitical score."""
    block = "\n\n".join(
        f"[{h.source}] ({h.published_at})\n{h.title}\n{h.description}"
        for h in headlines
    )
    user_prompt = (
        f"Here are {len(headlines)} recent headlines related to Bitcoin, "
        f"regulation, macro-economics, and geopolitics:\n\n"
        f"{block}\n\n"
        "Assess the overall geopolitical environment for Bitcoin and return JSON."
    )

    rate_limiter.wait()
    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model=model,
            max_tokens=300,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown fences if present.
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]
            raw = raw.strip()
        data = json.loads(raw)
        return LLMGeopolitical(
            score=float(np.clip(data["score"], -1.0, 1.0)),
            confidence=float(np.clip(data["confidence"], 0.0, 1.0)),
            reasoning=data.get("reasoning", ""),
        )
    except (json.JSONDecodeError, KeyError, anthropic.APIError) as exc:
        logger.warning("LLM geopolitical scoring failed: %s", exc)
        return LLMGeopolitical(score=0.0, confidence=0.1, reasoning=f"LLM error: {exc}")


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class GeopoliticalAgent(BaseAgent):
    """Assesses macro / geopolitical risk factors that affect BTC price."""

    name = "geopolitical"

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        geo_cfg = config.get("agents", {}).get("geopolitical", {})

        # NewsAPI config — prefer env var, fall back to config, then Streamlit secrets.
        self._newsapi_key: str = (
            os.getenv("NEWSAPI_KEY", "")
            or config.get("newsapi", {}).get("api_key", "")
        )
        if not self._newsapi_key:
            try:
                import streamlit as st
                self._newsapi_key = st.secrets["NEWSAPI_KEY"]
            except Exception:
                pass
        self._queries: list[str] = geo_cfg.get("queries", _DEFAULT_QUERIES)
        self._max_headlines: int = geo_cfg.get("max_headlines", 30)

        # Anthropic config — prefer env var, fall back to config, then Streamlit secrets.
        anthropic_cfg = config.get("anthropic", {})
        self._api_key: str = (
            os.getenv("ANTHROPIC_API_KEY", "")
            or anthropic_cfg.get("api_key", "")
        )
        if not self._api_key:
            try:
                import streamlit as st
                self._api_key = st.secrets["ANTHROPIC_API_KEY"]
            except Exception:
                pass
        self._model: str = anthropic_cfg.get("model", "claude-haiku-4-5-20251001")

        # Rate limiting: default 10 LLM calls per 60 s.
        rl_cfg = geo_cfg.get("rate_limit", {})
        self._rate_limiter = _RateLimiter(
            max_calls=rl_cfg.get("max_calls", 10),
            period=rl_cfg.get("period_seconds", 60),
        )

    def analyse(self) -> Signal:
        """Fetch headlines, score via LLM, return signal."""
        if not self._newsapi_key:
            return self._fallback("No newsapi.api_key configured")
        if not self._api_key:
            return self._fallback("No anthropic.api_key configured")

        fetcher = NewsFetcher(self._newsapi_key, page_size=self._max_headlines)
        headlines = fetcher.fetch(self._queries)

        if not headlines:
            return self._fallback("No headlines returned from NewsAPI")

        llm = _score_via_llm(headlines, self._api_key, self._model, self._rate_limiter)
        return self._build_signal(headlines, llm)

    def score_with_headlines(self, headlines: list[Headline]) -> Signal:
        """Score a pre-fetched list of headlines (for testing)."""
        if not self._api_key:
            return self._fallback("No anthropic.api_key configured")
        if not headlines:
            return self._fallback("Empty headline list")
        llm = _score_via_llm(headlines, self._api_key, self._model, self._rate_limiter)
        return self._build_signal(headlines, llm)

    def _build_signal(self, headlines: list[Headline], llm: LLMGeopolitical) -> Signal:
        confidence = self._compute_confidence(llm, len(headlines))

        reasoning_parts = [
            f"Headlines analysed: {len(headlines)}",
            f"Geopolitical score: {llm.score:+.2f}",
            f"LLM reasoning: {llm.reasoning}",
            f"Confidence: {confidence:.2f}",
        ]

        return Signal(
            agent=self.name,
            score=round(llm.score, 4),
            confidence=round(confidence, 4),
            reasoning="\n".join(reasoning_parts),
        )

    def _fallback(self, reason: str) -> Signal:
        """Neutral low-confidence signal when data is unavailable."""
        return Signal(
            agent=self.name,
            score=0.0,
            confidence=0.1,
            reasoning=f"Fallback: {reason}",
        )

    @staticmethod
    def _compute_confidence(llm: LLMGeopolitical, headline_count: int) -> float:
        """Confidence from LLM self-rating (50 %), sample size (30 %), strength (20 %).

        Sample size: 15+ headlines → 1.0, scales linearly below.
        """
        llm_conf = llm.confidence
        sample = min(headline_count / 15.0, 1.0)
        strength = abs(llm.score)
        raw = 0.50 * llm_conf + 0.30 * sample + 0.20 * strength
        return float(np.clip(raw, 0.0, 1.0))
